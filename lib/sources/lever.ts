import type { JobSource, NormalizedJob } from "./types";
import type { $Enums } from "@/lib/generated/prisma/client";
import { cleanHtml, htmlToPlainText } from "./utils";
import { registrySlugs } from "./ats-registry";

const USER_AGENT = "Toplisters/1.0 (+https://toplisters.xyz)";
const REQUEST_GAP_MS = 250;

// Default Lever boards. Lever's public-API footprint has shrunk over the
// past few years (many former customers have migrated to Greenhouse /
// Ashby / Workable), so this list is intentionally small and easy to grow
// via LEVER_COMPANIES env.
//
// Verified with a live probe at adapter-write time. Rows that drop to 0
// jobs (company moved off Lever) just produce no output — no error.
// 404s are logged and skipped.
const DEFAULT_COMPANIES: readonly string[] = [
  "spotify",
  // India — verified direct boards (locations confirmed India).
  "cred", "meesho", "zeta",
];

interface LeverCategories {
  commitment?: string;
  department?: string;
  location?: string;
  team?: string;
  allLocations?: string[];
}

interface LeverItem {
  id?: string;
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  categories?: LeverCategories;
  createdAt?: number;
  description?: string;
  descriptionPlain?: string;
  additional?: string;
  additionalPlain?: string;
  workplaceType?: string;
}

interface FetchedItem {
  job: LeverItem;
  slug: string;
}

interface FetchPayload {
  items: FetchedItem[];
}

const COMMITMENT_MAP: Record<string, $Enums.JobType> = {
  permanent: "full_time",
  "full time": "full_time",
  "full-time": "full_time",
  fulltime: "full_time",
  "part time": "part_time",
  "part-time": "part_time",
  parttime: "part_time",
  contract: "contract",
  contractor: "contract",
  freelance: "contract",
  internship: "internship",
  intern: "internship",
  temporary: "temp",
  temp: "temp",
};

function pickJobType(commitment: string | undefined): $Enums.JobType {
  if (!commitment) return "full_time";
  return COMMITMENT_MAP[commitment.toLowerCase()] ?? "full_time";
}

function pickWorkMode(workplaceType: string | undefined): $Enums.WorkMode {
  if (!workplaceType) return "unknown";
  const v = workplaceType.toLowerCase();
  if (v.includes("remote")) return "remote";
  if (v.includes("hybrid")) return "hybrid";
  if (v.includes("onsite") || v.includes("on-site") || v.includes("in-office")) {
    return "onsite";
  }
  return "unknown";
}

function configuredCompanies(): string[] {
  // Curated defaults always run; LEVER_COMPANIES extends (union, deduped).
  const extra = (process.env.LEVER_COMPANIES ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...DEFAULT_COMPANIES, ...extra])];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Lever postings API — public, unauthenticated, direct-from-employer feed.
 * Same shape as Greenhouse but a different ATS, so worth running both.
 *
 * Endpoint: GET https://api.lever.co/v0/postings/<slug>?mode=json
 *   - 200 + array → company is on Lever, openings populated
 *   - 200 + []    → company is on Lever, no current openings
 *   - 404         → company isn't on Lever (or moved off)
 *
 * Lever's footprint has shrunk vs Greenhouse — confirmed-working defaults
 * are deliberately conservative; expand via LEVER_COMPANIES env. Each
 * company's createdAt is a Unix-millis timestamp.
 *
 * Notes:
 *  - companyName comes from the slug (Lever doesn't ship a display name
 *    in the posting payload). slug → display via simple capitalisation,
 *    Logo.dev brand-search resolves the real logo by the (capitalised)
 *    name in the pipeline.
 *  - description + additional are both HTML; we concat with a separator
 *    so the detail page renders the full posting plus the company's
 *    additional info section (benefits, EEO statement, etc.).
 *  - workplaceType is sometimes set per-posting and sometimes only via
 *    location text — fall back to onsite when neither is conclusive.
 */
class LeverSource implements JobSource {
  readonly name = "lever";
  readonly displayName = "Lever";
  readonly attribution = "via the company's careers page";
  readonly providerUrl = "https://www.lever.co";

  isEnabled(): boolean {
    return process.env.DISABLE_SOURCE_LEVER !== "1";
  }

  async fetch(): Promise<unknown> {
    const items: FetchedItem[] = [];
    const slugs = [...new Set([...configuredCompanies(), ...(await registrySlugs("lever"))])];
    for (const slug of slugs) {
      try {
        const response = await fetch(
          `https://api.lever.co/v0/postings/${slug}?mode=json`,
          {
            headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
          },
        );
        if (!response.ok) {
          // 404 is expected for companies that aren't (or are no longer)
          // on Lever. Log at debug-level via console.warn so the worker
          // log carries the fact without making it look like a fault.
          console.warn(
            `Lever fetch failed: ${slug} → ${response.status} ${response.statusText}`,
          );
          continue;
        }
        const data = (await response.json()) as LeverItem[];
        if (Array.isArray(data)) {
          for (const job of data) items.push({ job, slug });
        }
      } catch (error) {
        console.warn(
          `Lever fetch errored: ${slug} →`,
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
      if (!job.id || !job.text) continue;

      const html = [job.description, job.additional]
        .filter(Boolean)
        .join("\n\n");

      const cats = job.categories ?? {};
      const locationText =
        cats.location?.trim() ||
        cats.allLocations?.[0]?.trim() ||
        "Unknown";
      const category = cats.department?.toLowerCase() ?? cats.team?.toLowerCase() ?? "other";

      // slug → "Slug" (e.g. "spotify" → "Spotify"). Good enough for
      // Logo.dev brand-search, which is what fills the logo URL.
      const companyName = slug.charAt(0).toUpperCase() + slug.slice(1);

      out.push({
        source: this.name,
        sourceId: job.id,
        title: job.text.trim(),
        companyName,
        companyDomain: null,
        companyLogoUrl: null,
        locationText,
        applyUrl: job.hostedUrl ?? job.applyUrl ?? `https://jobs.lever.co/${slug}/${job.id}`,
        descriptionHtml: cleanHtml(html),
        descriptionText: htmlToPlainText(html),
        postedDate: job.createdAt ? new Date(job.createdAt) : new Date(),
        closingDate: null,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        salaryPeriod: null,
        jobType: pickJobType(cats.commitment),
        workMode: pickWorkMode(job.workplaceType),
        experienceLevel: "unknown",
        category,
        collarType: "white",
        skills: [],
        benefits: [],
        visaSponsorship: null,
      });
    }
    return out;
  }
}

export const lever = new LeverSource();
