import type { JobSource, NormalizedJob } from "./types";
import type { $Enums } from "@/lib/generated/prisma/client";
import { cleanHtml, htmlToPlainText } from "./utils";

const ENDPOINT = "https://www.reed.co.uk/api/1.0/search";
const USER_AGENT = "Toplisters/1.0 (+https://toplisters.xyz)";
const RESULTS_PER_PAGE = 100;
// Reed's first page returns a broad geographic spread; paginating to 500
// gets enough volume that London/Manchester/Birmingham etc. cross the
// 5-job threshold for landing pages. Override with REED_MAX_RESULTS.
const DEFAULT_MAX_RESULTS = 500;

interface ReedItem {
  jobId?: number;
  employerName?: string;
  jobTitle?: string;
  locationName?: string;
  minimumSalary?: number | null;
  maximumSalary?: number | null;
  currency?: string;
  salaryType?: string;
  date?: string;
  expirationDate?: string;
  jobDescription?: string;
  jobUrl?: string;
  contractType?: string;
  fullTime?: boolean;
  partTime?: boolean;
}

interface ReedResponse {
  results?: ReedItem[];
  totalResults?: number;
}

const CONTRACT_TYPE_MAP: Record<string, $Enums.JobType> = {
  permanent: "full_time",
  contract: "contract",
  temporary: "temp",
  temp: "temp",
  apprenticeship: "internship",
};

const SALARY_PERIOD_MAP: Record<string, $Enums.SalaryPeriod> = {
  annual: "yearly",
  yearly: "yearly",
  monthly: "monthly",
  daily: "daily",
  hourly: "hourly",
};

const UK_REGEX = /\b(uk|u\.k\.|united kingdom|england|scotland|wales|northern ireland)\b/i;
const REMOTE_REGEX = /\bremote\b/i;

// Reed exposes an ad-syndication tier where the `employerName` is the
// syndicator (Appcast / Appcastenterprise) rather than the real employer.
// These rows have no recoverable brand: Logo.dev can't find a logo for
// "Appcast", the apply URL bounces through reed.co.uk, and the description
// doesn't reliably name the original poster either. Dropping them is far
// cleaner than littering the listings with identical "AP" InitialsAvatar
// tiles. Add other syndicator strings to this regex as they surface.
const SYNDICATOR_RE = /^appcast(\s*enterprise)?$/i;

/**
 * Reed.co.uk's date format is `dd/mm/yyyy`. Returns the current date when
 * the value is missing or unparseable so a malformed payload doesn't drop
 * the whole row.
 */
function parseReedDate(value: string | undefined): Date {
  if (!value) return new Date();
  const parts = value.split("/").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return new Date();
  const [d, m, y] = parts;
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Reed.co.uk — UK-focused job board. HTTP Basic auth with the API key as
 * username and an empty password. The /search endpoint returns short
 * descriptions (full text needs a per-job fetch which we skip to keep API
 * usage cheap; the link-out + applyUrl give the user the full posting).
 *
 * TOS notes (per Reed's API terms):
 *  - Attribution required ("via Reed" rendered next to Apply on detail page)
 *  - Must link back to the original posting via applyUrl
 *  - Free tier suits Phase 1 cadence (a few hundred lookups/day)
 *
 * The adapter forces "UK" suffix on the locationText when missing so the
 * geocoder resolves to GB instead of falling through to ZZ.
 */
class ReedSource implements JobSource {
  readonly name = "reed";
  readonly displayName = "Reed";
  readonly attribution = "via Reed";
  readonly providerUrl = "https://www.reed.co.uk";

  isEnabled(): boolean {
    if (process.env.DISABLE_SOURCE_REED === "1") return false;
    return Boolean(process.env.REED_API_KEY);
  }

  async fetch(): Promise<unknown> {
    const key = process.env.REED_API_KEY;
    if (!key) throw new Error("REED_API_KEY is not set");
    const auth = Buffer.from(`${key}:`).toString("base64");
    const headers = {
      Authorization: `Basic ${auth}`,
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    };
    const maxResults =
      Number.parseInt(process.env.REED_MAX_RESULTS ?? "", 10) || DEFAULT_MAX_RESULTS;

    const all: ReedItem[] = [];
    for (let skip = 0; skip < maxResults; skip += RESULTS_PER_PAGE) {
      const url = `${ENDPOINT}?resultsToTake=${RESULTS_PER_PAGE}&resultsToSkip=${skip}`;
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(
          `Reed fetch failed at skip=${skip}: ${response.status} ${response.statusText}`,
        );
      }
      const data = (await response.json()) as ReedResponse;
      const page = data.results ?? [];
      all.push(...page);
      // Last page — Reed returned fewer than the page size, no more rows to pull.
      if (page.length < RESULTS_PER_PAGE) break;
    }
    return { results: all } satisfies ReedResponse;
  }

  normalize(raw: unknown): NormalizedJob[] {
    const root = raw as ReedResponse | null;
    const items = root?.results;
    if (!Array.isArray(items)) return [];

    const out: NormalizedJob[] = [];
    for (const item of items) {
      if (!item.jobId || !item.jobTitle || !item.employerName) continue;
      if (SYNDICATOR_RE.test(item.employerName.trim())) continue;

      const sourceId = String(item.jobId);
      const summary = item.jobDescription ?? "";
      const isRemote =
        REMOTE_REGEX.test(item.locationName ?? "") ||
        REMOTE_REGEX.test(item.jobTitle ?? "");

      const contractKey = (item.contractType ?? "").toLowerCase();
      const jobType: $Enums.JobType =
        CONTRACT_TYPE_MAP[contractKey] ??
        (item.fullTime ? "full_time" : item.partTime ? "part_time" : "full_time");

      const salaryPeriod: $Enums.SalaryPeriod | null =
        SALARY_PERIOD_MAP[(item.salaryType ?? "").toLowerCase()] ?? null;
      const hasSalary = Boolean(item.minimumSalary || item.maximumSalary);

      const rawLocation = (item.locationName ?? "United Kingdom").trim();
      const locationText = UK_REGEX.test(rawLocation) ? rawLocation : `${rawLocation}, UK`;

      out.push({
        source: this.name,
        sourceId,
        title: item.jobTitle.trim(),
        companyName: item.employerName.trim(),
        companyDomain: null,
        companyLogoUrl: null,
        locationText,
        applyUrl: item.jobUrl ?? `https://www.reed.co.uk/jobs/job/${sourceId}`,
        descriptionHtml: cleanHtml(summary),
        descriptionText: htmlToPlainText(summary),
        postedDate: parseReedDate(item.date),
        closingDate: item.expirationDate ? parseReedDate(item.expirationDate) : null,
        salaryMin: item.minimumSalary ?? null,
        salaryMax: item.maximumSalary ?? null,
        salaryCurrency: hasSalary ? (item.currency ?? "GBP") : null,
        salaryPeriod: hasSalary ? (salaryPeriod ?? "yearly") : null,
        jobType,
        workMode: isRemote ? "remote" : "onsite",
        experienceLevel: "unknown",
        category: "other",
        collarType: "unknown",
        skills: [],
        benefits: [],
        visaSponsorship: null,
      });
    }
    return out;
  }
}

export const reed = new ReedSource();
