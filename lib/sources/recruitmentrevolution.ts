import type { JobSource, NormalizedJob } from "./types";
import type { $Enums } from "@/lib/generated/prisma/client";
import { cleanHtml, htmlToPlainText } from "./utils";

/**
 * Recruitment Revolution — UK flat-fee recruiter publishing its vacancies on
 * a WordPress site. We ingest via the public WordPress REST API (an official
 * API, no auth, no scraping behind logins — compliant per info/COMPLIANCE.md)
 * rather than HTML, since the detail pages carry no schema.org JSON-LD.
 *
 *   GET /wp-json/wp/v2/job-posting?per_page=100&_embed=1&orderby=date&order=desc
 *
 * Notes baked in:
 *  - `content.rendered` is a real <p> wrapping ENTITY-ENCODED HTML
 *    ("&lt;p&gt;…"), so we decode entities once before sanitising.
 *  - `title.rendered` carries HTML entities and a trailing " – <ref-id>"
 *    (e.g. "… – 20203") which we strip.
 *  - Location / employment-type / category arrive as embedded taxonomy
 *    terms (`_embed=1`).
 *  - It's a recruiter board — the client company is embedded in prose, not
 *    structured — so `companyName` is the recruiter ("Recruitment
 *    Revolution") and apply links point at the vacancy page (where you
 *    apply). Logo resolution via Logo.dev then resolves the recruiter logo.
 */
const BASE = "https://recruitmentrevolution.com/wp-json/wp/v2/job-posting";
const USER_AGENT = "Toplisters/1.0 (+https://toplisters.xyz)";
const PER_PAGE = 100;
const DEFAULT_MAX_PAGES = 12; // 944 postings ≈ 10 pages; cap is a safety bound.
const PAGE_DELAY_MS = 250;

interface WpTerm {
  id: number;
  name: string;
  taxonomy: string;
}

interface WpJobPosting {
  id?: number;
  date_gmt?: string;
  link?: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
  job_postings_location?: number[];
  job_postings_employment_type?: number[];
  job_postings_category?: number[];
  _embedded?: { "wp:term"?: WpTerm[][] };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Decode the common HTML entities (numeric + named) to recover real text/HTML. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&"); // last, so we don't double-decode
}

/** "… – 20203" / "… - 20203" → strip the trailing recruiter ref id. */
function stripRefId(title: string): string {
  return title.replace(/\s*[–-]\s*\d{3,}\s*$/, "").trim();
}

function termNames(job: WpJobPosting, taxonomy: string, ids: number[] | undefined): string[] {
  if (!ids?.length) return [];
  const byId = new Map<number, string>();
  for (const group of job._embedded?.["wp:term"] ?? []) {
    for (const t of group) {
      if (t.taxonomy === taxonomy) byId.set(t.id, t.name);
    }
  }
  return ids.map((id) => byId.get(id)).filter((n): n is string => Boolean(n));
}

function pickWorkMode(types: string[]): $Enums.WorkMode {
  const joined = types.join(" ").toLowerCase();
  if (/remote/.test(joined)) return "remote";
  if (/hybrid/.test(joined)) return "hybrid";
  if (types.length) return "onsite";
  return "unknown";
}

function pickJobType(types: string[]): $Enums.JobType {
  const joined = types.join(" ").toLowerCase();
  if (/part.?time/.test(joined)) return "part_time";
  if (/contract|freelance/.test(joined)) return "contract";
  if (/temp/.test(joined)) return "temp";
  if (/intern/.test(joined)) return "internship";
  return "full_time";
}

function pickExperience(title: string): $Enums.ExperienceLevel {
  const t = title.toLowerCase();
  if (/\b(director|head of|chief|c[teofi]o|vp|vice president)\b/.test(t)) return "exec";
  if (/\b(senior|lead|principal|staff)\b/.test(t)) return "senior";
  if (/\b(junior|graduate|trainee|intern|entry)\b/.test(t)) return "entry";
  return "unknown";
}

class RecruitmentRevolutionSource implements JobSource {
  readonly name = "recruitmentrevolution";
  readonly displayName = "Recruitment Revolution";
  readonly attribution = "via Recruitment Revolution";
  readonly providerUrl = "https://recruitmentrevolution.com";

  isEnabled(): boolean {
    return process.env.DISABLE_SOURCE_RECRUITMENTREVOLUTION !== "1";
  }

  async fetch(): Promise<unknown> {
    const maxPages =
      Number.parseInt(process.env.RECRUITMENTREVOLUTION_MAX_PAGES ?? "", 10) ||
      DEFAULT_MAX_PAGES;

    const all: WpJobPosting[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const url = `${BASE}?per_page=${PER_PAGE}&_embed=1&orderby=date&order=desc&page=${page}`;
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });
      if (!res.ok) {
        // WP returns 400 with code rest_post_invalid_page_number when paging
        // past the end — treat that as a clean stop rather than an error.
        if (res.status === 400 && page > 1) break;
        throw new Error(
          `Recruitment Revolution fetch failed (page ${page}): ${res.status} ${res.statusText}`,
        );
      }
      if (page === 1) {
        const tp = Number.parseInt(res.headers.get("x-wp-totalpages") ?? "1", 10);
        totalPages = Number.isFinite(tp) && tp > 0 ? tp : 1;
      }
      const batch = (await res.json()) as WpJobPosting[];
      if (!Array.isArray(batch) || batch.length === 0) break;
      all.push(...batch);
      page += 1;
      if (page <= Math.min(totalPages, maxPages)) await sleep(PAGE_DELAY_MS);
    } while (page <= Math.min(totalPages, maxPages));

    return all;
  }

  normalize(raw: unknown): NormalizedJob[] {
    const items = raw as WpJobPosting[] | null;
    if (!Array.isArray(items)) return [];

    const out: NormalizedJob[] = [];
    for (const item of items) {
      if (!item.id || !item.title?.rendered || !item.link) continue;

      const title = stripRefId(decodeEntities(item.title.rendered).replace(/<[^>]+>/g, ""));
      if (!title) continue;

      const html = cleanHtml(decodeEntities(item.content?.rendered ?? ""));
      const text = htmlToPlainText(decodeEntities(item.content?.rendered ?? ""));

      const locationNames = termNames(item, "job_postings_location", item.job_postings_location);
      const typeNames = termNames(item, "job_postings_employment_type", item.job_postings_employment_type);
      const categoryNames = termNames(item, "job_postings_category", item.job_postings_category);

      const workMode = pickWorkMode(typeNames);
      const locationText =
        locationNames.length > 0
          ? locationNames.join(", ")
          : workMode === "remote"
            ? "Remote — Worldwide"
            : "Unknown";

      const postedDate = item.date_gmt ? new Date(`${item.date_gmt}Z`) : new Date();

      out.push({
        source: this.name,
        sourceId: String(item.id),
        title,
        companyName: this.displayName,
        companyDomain: null,
        companyLogoUrl: null,
        locationText,
        applyUrl: item.link,
        descriptionHtml: html,
        descriptionText: text,
        postedDate: Number.isNaN(postedDate.getTime()) ? new Date() : postedDate,
        closingDate: null,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        salaryPeriod: null,
        jobType: pickJobType(typeNames),
        workMode,
        experienceLevel: pickExperience(title),
        category: categoryNames[0] ?? "general",
        collarType: "white",
        skills: [],
        benefits: [],
        visaSponsorship: null,
      });
    }
    return out;
  }
}

export const recruitmentRevolution = new RecruitmentRevolutionSource();
