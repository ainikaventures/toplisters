import type { JobSource, NormalizedJob } from "./types";
import type { $Enums } from "@/lib/generated/prisma/client";
import { cleanHtml, htmlToPlainText } from "./utils";

const USER_AGENT = "Toplisters/1.0 (+https://toplisters.xyz)";
const REQUEST_GAP_MS = 250;

// Curated default Greenhouse boards — all live-checked at adapter time.
// Each company runs its own ATS instance under boards-api.greenhouse.io;
// adding more = appending the slug here OR setting GREENHOUSE_COMPANIES
// in the env. Companies that move off GH start returning 0 jobs (graceful)
// or 404 (we log + continue).
const DEFAULT_COMPANIES: readonly string[] = [
  "stripe", "airbnb", "datadog", "cloudflare", "reddit",
  "figma", "robinhood", "asana", "dropbox", "discord",
  // India — verified direct boards (Indian IT/product employers).
  "postman", "phonepe", "groww", "druva", "netradyne", "highradius", "rubrik", "slice",
];

interface GhMetadata {
  id?: number;
  name?: string;
  value?: unknown;
  value_type?: string;
}

interface GhJob {
  id?: number;
  title?: string;
  updated_at?: string;
  first_published?: string;
  company_name?: string;
  absolute_url?: string;
  content?: string;
  location?: { name?: string };
  offices?: { name?: string }[];
  departments?: { name?: string }[];
  metadata?: GhMetadata[];
  requisition_id?: string | null;
}

interface GhResponse {
  jobs?: GhJob[];
}

interface FetchedItem {
  job: GhJob;
  /** Greenhouse board slug — used as a stable companyDomain hint when other
   * fields are sparse, and surfaced in attribution. */
  slug: string;
}

interface FetchPayload {
  items: FetchedItem[];
}

function configuredCompanies(): string[] {
  // Curated defaults always run; GREENHOUSE_COMPANIES extends (union, deduped).
  const extra = (process.env.GREENHOUSE_COMPANIES ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...DEFAULT_COMPANIES, ...extra])];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Greenhouse API responses HTML-encode the `content` field
 * (`&lt;p&gt;…&lt;/p&gt;` instead of raw HTML). Decode the common entities
 * before sanitisation; otherwise we'd persist the encoded form and the
 * detail-page renderer would show literal "&lt;" everywhere.
 */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Map Greenhouse's metadata "Workplace Type" entries to our WorkMode enum.
 * Common values seen in the wild: "Remote", "Hybrid", "On-site", "Onsite".
 */
function pickWorkMode(metadata: GhMetadata[] | undefined): $Enums.WorkMode {
  if (!metadata) return "unknown";
  for (const m of metadata) {
    if (!m.name || !m.value) continue;
    const name = m.name.toLowerCase();
    if (!/(workplace|remote|location)/.test(name)) continue;
    const value = String(m.value).toLowerCase();
    if (value.includes("remote")) return "remote";
    if (value.includes("hybrid")) return "hybrid";
    if (value.includes("onsite") || value.includes("on-site") || value.includes("in-office")) {
      return "onsite";
    }
  }
  return "unknown";
}

/**
 * Greenhouse boards API — public, unauthenticated read-only feed of every
 * company that uses Greenhouse as their ATS. Direct-from-employer data, no
 * scraping, no TOS friction. The catch is per-company configuration: each
 * company is one slug = one API call per cycle.
 *
 * Defaults to 10 well-known companies (~2000 jobs combined). Override with
 * GREENHOUSE_COMPANIES="stripe,airbnb,…" to expand or narrow.
 *
 * Notes on the data:
 *  - `content` field is HTML-encoded; we decode + sanitise before persisting.
 *  - `metadata[]` carries structured workplace-type info on most modern boards
 *    — that's what drives our workMode classification.
 *  - `absolute_url` is the canonical apply URL; Greenhouse appends a tracking
 *    `gh_jid` parameter that the employer's ATS uses for attribution. Pass
 *    through unmodified.
 *  - No salary fields in the API; the description sometimes mentions ranges.
 *  - No company logo URL either; pipeline's Logo.dev fallback resolves by name.
 */
class GreenhouseSource implements JobSource {
  readonly name = "greenhouse";
  readonly displayName = "Greenhouse";
  readonly attribution = "via the company's careers page";
  readonly providerUrl = "https://www.greenhouse.io";

  isEnabled(): boolean {
    return process.env.DISABLE_SOURCE_GREENHOUSE !== "1";
  }

  async fetch(): Promise<unknown> {
    const items: FetchedItem[] = [];
    for (const slug of configuredCompanies()) {
      try {
        const response = await fetch(
          `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`,
          {
            headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
          },
        );
        if (!response.ok) {
          console.warn(
            `Greenhouse fetch failed: ${slug} → ${response.status} ${response.statusText}`,
          );
          continue;
        }
        const data = (await response.json()) as GhResponse;
        for (const job of data.jobs ?? []) items.push({ job, slug });
      } catch (error) {
        console.warn(
          `Greenhouse fetch errored: ${slug} →`,
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

      const html = job.content ? decodeHtmlEntities(job.content) : "";
      const companyName = job.company_name?.trim() || slug;
      const locationText =
        job.location?.name?.trim() ||
        job.offices?.[0]?.name?.trim() ||
        "Unknown";
      const category = job.departments?.[0]?.name?.toLowerCase() ?? "other";

      out.push({
        source: this.name,
        sourceId: String(job.id),
        title: job.title.trim(),
        companyName,
        // The board slug is a stable hint; not a real domain but the
        // pipeline's Logo.dev brand-search uses companyName anyway.
        companyDomain: null,
        companyLogoUrl: null,
        locationText,
        applyUrl: job.absolute_url ?? `https://boards.greenhouse.io/${slug}/jobs/${job.id}`,
        descriptionHtml: cleanHtml(html),
        descriptionText: htmlToPlainText(html),
        postedDate: job.first_published
          ? new Date(job.first_published)
          : job.updated_at
            ? new Date(job.updated_at)
            : new Date(),
        closingDate: null,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        salaryPeriod: null,
        // Greenhouse rarely surfaces a clean job-type signal; default to
        // full_time and let outliers be wrong rather than misread metadata.
        jobType: "full_time",
        workMode: pickWorkMode(job.metadata),
        experienceLevel: "unknown",
        category,
        // Greenhouse customers skew tech / knowledge-worker — hint white,
        // pipeline classifier promotes any clearly-blue title that slips in.
        collarType: "white",
        skills: [],
        benefits: [],
        visaSponsorship: null,
      });
    }
    return out;
  }
}

export const greenhouse = new GreenhouseSource();
