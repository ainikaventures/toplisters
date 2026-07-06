import type { JobSource, NormalizedJob } from "./types";
import type { $Enums } from "@/lib/generated/prisma/client";
import { cleanHtml, htmlToPlainText } from "./utils";
import { registrySlugs } from "./ats-registry";

const USER_AGENT = "Toplisters/1.0 (+https://toplisters.xyz)";
const REQUEST_GAP_MS = 250;

// Probed live at adapter-write time — each slug returns >10 jobs. Slugs
// are case-sensitive on Ashby's endpoint. Expand via ASHBY_COMPANIES env.
// Companies that move off Ashby return 404 and are logged + skipped.
const DEFAULT_COMPANIES: readonly string[] = [
  "Ashby", "Linear", "Posthog", "Ramp", "openai", "notion",
  // India — verified direct board (location confirmed India).
  "atlan",
];

interface AshbyAddress {
  postalAddress?: {
    addressCountry?: string;
    addressLocality?: string;
    addressRegion?: string;
  };
}

interface AshbySecondaryLocation {
  location?: string;
  address?: AshbyAddress;
}

interface AshbyCompensation {
  compensationTierSummary?: string;
  scrapeableCompensationSalarySummary?: string;
}

interface AshbyJob {
  id?: string;
  title?: string;
  department?: string;
  team?: string;
  employmentType?: string;
  location?: string;
  secondaryLocations?: AshbySecondaryLocation[];
  publishedAt?: string;
  isListed?: boolean;
  isRemote?: boolean;
  workplaceType?: string;
  address?: AshbyAddress;
  jobUrl?: string;
  applyUrl?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  compensation?: AshbyCompensation;
}

interface AshbyResponse {
  jobs?: AshbyJob[];
}

interface FetchedItem {
  job: AshbyJob;
  slug: string;
}

interface FetchPayload {
  items: FetchedItem[];
}

const EMPLOYMENT_TYPE_MAP: Record<string, $Enums.JobType> = {
  fulltime: "full_time",
  full_time: "full_time",
  "full-time": "full_time",
  parttime: "part_time",
  part_time: "part_time",
  "part-time": "part_time",
  contract: "contract",
  contractor: "contract",
  freelance: "contract",
  internship: "internship",
  intern: "internship",
  temporary: "temp",
  temp: "temp",
};

function pickJobType(employmentType: string | undefined): $Enums.JobType {
  if (!employmentType) return "full_time";
  return EMPLOYMENT_TYPE_MAP[employmentType.toLowerCase()] ?? "full_time";
}

function pickWorkMode(
  workplaceType: string | undefined,
  isRemote: boolean | undefined,
): $Enums.WorkMode {
  if (workplaceType) {
    const v = workplaceType.toLowerCase();
    if (v.includes("remote")) return "remote";
    if (v.includes("hybrid")) return "hybrid";
    if (v.includes("onsite") || v.includes("on-site") || v.includes("in-office")) {
      return "onsite";
    }
  }
  if (isRemote === true) return "remote";
  if (isRemote === false) return "onsite";
  return "unknown";
}

function configuredCompanies(): string[] {
  // No lowercasing — Ashby's URL path is case-sensitive ("Ashby" ≠ "ashby").
  // Curated defaults always run; ASHBY_COMPANIES extends (union, deduped).
  const extra = (process.env.ASHBY_COMPANIES ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_COMPANIES, ...extra])];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Title-case the slug for use as companyName. The public Ashby API doesn't
 * carry the customer's display name, so we derive it; the pipeline's
 * Logo.dev brand-search resolves the actual logo by brand-name fuzzy match,
 * so a slightly-off capitalisation ("Openai" vs "OpenAI") still finds the
 * right logo.
 */
function slugToCompanyName(slug: string): string {
  if (!slug) return slug;
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

/**
 * Ashby postings API — public, unauthenticated, direct-from-employer feed,
 * same architectural shape as Greenhouse + Lever. Per-company endpoint, one
 * API call per slug per run.
 *
 * Endpoint: GET https://api.ashbyhq.com/posting-api/job-board/<slug>?includeCompensation=true
 *   - 200 + jobs[] → live board
 *   - 404         → company isn't on Ashby (or moved off)
 *
 * Defaults to 6 well-known customers (~1000 jobs combined, OpenAI alone
 * carries ~700). Override with ASHBY_COMPANIES="Ashby,Linear,Ramp,…" —
 * case-sensitive, the URL path matches the slug exactly.
 *
 * Notes on the data:
 *  - descriptionHtml is full HTML (no truncation, no encoding tricks).
 *  - descriptionPlain ships pre-rendered, so we use it as-is for FTS.
 *  - workplaceType ("Remote"/"Hybrid"/"OnSite") + isRemote (boolean) are
 *    both populated on most postings; we cross-check.
 *  - `compensation.scrapeableCompensationSalarySummary` is structured
 *    enough to parse ("€76K - €185K"), but currency symbols + K
 *    abbreviations + dash variants vary; skipped for now. The full
 *    `compensationTierSummary` shows in the description body anyway.
 *  - No company logo URL in the payload — Logo.dev fallback resolves
 *    by company name.
 */
class AshbySource implements JobSource {
  readonly name = "ashby";
  readonly displayName = "Ashby";
  readonly attribution = "via the company's careers page";
  readonly providerUrl = "https://www.ashbyhq.com";

  isEnabled(): boolean {
    return process.env.DISABLE_SOURCE_ASHBY !== "1";
  }

  async fetch(): Promise<unknown> {
    const items: FetchedItem[] = [];
    const slugs = [...new Set([...configuredCompanies(), ...(await registrySlugs("ashby"))])];
    for (const slug of slugs) {
      try {
        const response = await fetch(
          `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`,
          {
            headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
          },
        );
        if (!response.ok) {
          console.warn(
            `Ashby fetch failed: ${slug} → ${response.status} ${response.statusText}`,
          );
          continue;
        }
        const data = (await response.json()) as AshbyResponse;
        for (const job of data.jobs ?? []) items.push({ job, slug });
      } catch (error) {
        console.warn(
          `Ashby fetch errored: ${slug} →`,
          error instanceof Error ? error.message : error,
        );
      }
      await sleep(REQUEST_GAP_MS);
    }
    return { items } satisfies FetchPayload;
  }

  normalize(raw: unknown): NormalizedJob[] {
    const root = raw as FetchPayload | null;
    const items = root?.items;
    if (!Array.isArray(items)) return [];

    const out: NormalizedJob[] = [];
    for (const { job, slug } of items) {
      if (!job.id || !job.title) continue;
      // isListed=false postings are drafts/internal; the public API
      // shouldn't return them but we filter defensively in case it does.
      if (job.isListed === false) continue;

      const html = job.descriptionHtml ?? "";
      const plain = job.descriptionPlain ?? htmlToPlainText(html);
      const companyName = slugToCompanyName(slug);
      const locationText =
        job.location?.trim() ||
        job.secondaryLocations?.[0]?.location?.trim() ||
        "Unknown";
      const category =
        job.department?.toLowerCase() ??
        job.team?.toLowerCase() ??
        "other";

      out.push({
        source: this.name,
        sourceId: job.id,
        title: job.title.trim(),
        companyName,
        companyDomain: null,
        companyLogoUrl: null,
        locationText,
        applyUrl: job.applyUrl ?? job.jobUrl ?? `https://jobs.ashbyhq.com/${slug}/${job.id}`,
        descriptionHtml: cleanHtml(html),
        descriptionText: plain,
        postedDate: job.publishedAt ? new Date(job.publishedAt) : new Date(),
        closingDate: null,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        salaryPeriod: null,
        jobType: pickJobType(job.employmentType),
        workMode: pickWorkMode(job.workplaceType, job.isRemote),
        experienceLevel: "unknown",
        category,
        // Ashby customers skew tech / knowledge-worker — same heuristic
        // as Greenhouse/Lever. Pipeline classifier promotes any blue-collar
        // title (driver, warehouse, etc.) that slips through.
        collarType: "white",
        skills: [],
        benefits: [],
        visaSponsorship: null,
      });
    }
    return out;
  }
}

export const ashby = new AshbySource();
