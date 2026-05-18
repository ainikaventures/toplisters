import type { JobSource, NormalizedJob } from "./types";
import type { $Enums } from "@/lib/generated/prisma/client";
import { cleanHtml, htmlToPlainText } from "./utils";
import { enrichMany, type JobPostingEnrichment } from "./enrich";

const USER_AGENT = "Toplisters/1.0 (+https://toplisters.xyz)";
const RESULTS_PER_PAGE = 50;
const DEFAULT_PAGES_PER_COUNTRY = 1;
const REQUEST_GAP_MS = 250;
const DEFAULT_ENRICH_CAP = 100;
const ENRICH_CONCURRENCY = 4;

// Adzuna country domains we'll query unless overridden via env. Covers
// every market where their free tier returns meaningful volume —
// notably brings real coverage in DE / FR / IN / BR / MX / NZ / PL / SG
// / ZA / IT / NL etc. that we have effectively zero of today.
//
// Override with `ADZUNA_COUNTRIES="gb,us,de,in"` (lowercase, comma-sep).
const DEFAULT_COUNTRIES = [
  "gb", "us", "au", "ca",
  "de", "fr", "it", "nl", "pl", "ch", "at", "be",
  "in", "sg", "br", "mx", "nz", "za",
] as const;

interface AdzunaItem {
  id?: string | number;
  title?: string;
  description?: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  category?: { label?: string; tag?: string };
  redirect_url?: string;
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string;
  contract_type?: string;
  contract_time?: string;
  created?: string;
}

interface AdzunaResponse {
  results?: AdzunaItem[];
  count?: number;
}

interface FetchedItem {
  item: AdzunaItem;
  /** Country we queried — drives the currency map; ISO-2 uppercased downstream. */
  country: string;
  /** Filled in by the enrichment pass (when enabled) — full description
   *  scraped from the JobPosting JSON-LD on the employer's careers page. */
  enrichment?: JobPostingEnrichment;
}

interface FetchPayload {
  items: FetchedItem[];
}

// Adzuna doesn't ship currency in the response — it's implicit by the
// /jobs/{country} path. Map covers every country in DEFAULT_COUNTRIES.
const COUNTRY_CURRENCY: Record<string, string> = {
  gb: "GBP", us: "USD", au: "AUD", ca: "CAD",
  de: "EUR", fr: "EUR", it: "EUR", nl: "EUR", pl: "PLN", ch: "CHF", at: "EUR", be: "EUR",
  in: "INR", sg: "SGD", br: "BRL", mx: "MXN", nz: "NZD", za: "ZAR",
};

// Normalise the user-facing country slug ("UK" -> "GB" because Adzuna's
// area[0] uses "UK" but our schema is ISO-2).
function countryToIso2(country: string): string {
  return (country === "uk" ? "gb" : country).toUpperCase();
}

const CONTRACT_TYPE_MAP: Record<string, $Enums.JobType> = {
  permanent: "full_time",
  contract: "contract",
  contractor: "contract",
  temporary: "temp",
  temp: "temp",
};

const CONTRACT_TIME_MAP: Record<string, $Enums.JobType> = {
  full_time: "full_time",
  part_time: "part_time",
};

function pickJobType(
  contractType: string | undefined,
  contractTime: string | undefined,
): $Enums.JobType {
  // Contract beats time — a contract that's also full-time is still a contract.
  const ct = (contractType ?? "").toLowerCase();
  if (CONTRACT_TYPE_MAP[ct]) return CONTRACT_TYPE_MAP[ct];
  const tt = (contractTime ?? "").toLowerCase();
  if (CONTRACT_TIME_MAP[tt]) return CONTRACT_TIME_MAP[tt];
  return "full_time";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function configuredCountries(): string[] {
  const raw = process.env.ADZUNA_COUNTRIES?.trim();
  if (!raw) return [...DEFAULT_COUNTRIES];
  return raw
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Adzuna — broad job aggregator with strong international coverage in
 * countries our existing sources barely touch (DE / FR / IN / BR / MX /
 * NZ / PL / SG / ZA / IT / NL). Uses HTTP query auth (app_id + app_key)
 * with a 1000-request/day free tier.
 *
 * TOS notes (per Adzuna's API terms):
 *  - Attribution required: "via Adzuna" is rendered next to Apply on the
 *    job detail page (the JobSource.attribution field handles this)
 *  - Apply links MUST go through the redirect_url — we use it as
 *    applyUrl unmodified so Adzuna's affiliate tracking + click counts
 *    remain intact
 *  - Respect rate limits + acknowledge salary-prediction caveat
 *    (salary_is_predicted="1" means inferred, not posted; we drop those
 *    from the salary fields rather than misrepresent)
 *
 * Budget at default cadence (90-min schedule, 16 runs/day):
 *   18 countries × 1 page × 1 request = 18 calls/run = 288 calls/day
 *   That's 29% of the free 1000/day tier — leaves room for retries,
 *   manual `npm run source -- adzuna` runs, and adding more countries.
 *
 * Per-country errors are caught + logged, not rethrown — one country
 * being temporarily flaky shouldn't sink an 18-country batch.
 */
class AdzunaSource implements JobSource {
  readonly name = "adzuna";
  readonly displayName = "Adzuna";
  readonly attribution = "via Adzuna";
  readonly providerUrl = "https://www.adzuna.com";

  isEnabled(): boolean {
    if (process.env.DISABLE_SOURCE_ADZUNA === "1") return false;
    return Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
  }

  async fetch(): Promise<unknown> {
    const appId = process.env.ADZUNA_APP_ID;
    const appKey = process.env.ADZUNA_APP_KEY;
    if (!appId || !appKey) {
      throw new Error("ADZUNA_APP_ID / ADZUNA_APP_KEY are not set");
    }

    const pages =
      Number.parseInt(process.env.ADZUNA_PAGES_PER_COUNTRY ?? "", 10) ||
      DEFAULT_PAGES_PER_COUNTRY;
    const countries = configuredCountries();

    const items: FetchedItem[] = [];
    for (const country of countries) {
      for (let page = 1; page <= pages; page++) {
        try {
          const url = new URL(
            `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}`,
          );
          url.searchParams.set("app_id", appId);
          url.searchParams.set("app_key", appKey);
          url.searchParams.set("results_per_page", String(RESULTS_PER_PAGE));
          url.searchParams.set("content-type", "application/json");

          const response = await fetch(url, {
            headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
          });
          if (!response.ok) {
            console.warn(
              `Adzuna fetch failed: ${country} page=${page} → ${response.status} ${response.statusText}`,
            );
            // Stop paging this country on first error but keep iterating others.
            break;
          }
          const data = (await response.json()) as AdzunaResponse;
          const page_items = data.results ?? [];
          for (const item of page_items) items.push({ item, country });
          // Last page when API returns fewer than the page size.
          if (page_items.length < RESULTS_PER_PAGE) break;
        } catch (error) {
          console.warn(
            `Adzuna fetch errored: ${country} page=${page} →`,
            error instanceof Error ? error.message : error,
          );
          break;
        }
        await sleep(REQUEST_GAP_MS);
      }
    }

    // Optional enrichment pass: Adzuna's API only returns description
    // snippets. For the N newest items we follow the redirect_url to the
    // employer's careers page and try to extract a full JobPosting JSON-LD
    // block. Failures (timeout, 4xx, no JSON-LD, JS-rendered page) silently
    // fall back to the snippet — see lib/sources/enrich.ts.
    if (process.env.DISABLE_ADZUNA_ENRICHMENT !== "1") {
      const cap =
        Number.parseInt(process.env.ADZUNA_ENRICH_CAP ?? "", 10) ||
        DEFAULT_ENRICH_CAP;
      const candidates = items
        .filter((f) => f.item.redirect_url)
        .map((f, idx) => ({ f, idx, ts: f.item.created ? Date.parse(f.item.created) : 0 }))
        .sort((a, b) => b.ts - a.ts)
        .slice(0, cap);
      const urls = candidates.map((c) => c.f.item.redirect_url as string);
      const enrichments = await enrichMany(urls, ENRICH_CONCURRENCY);
      for (let i = 0; i < candidates.length; i++) {
        const result = enrichments[i];
        if (result) candidates[i].f.enrichment = result;
      }
    }

    return { items } satisfies FetchPayload;
  }

  normalize(raw: unknown): NormalizedJob[] {
    const root = raw as FetchPayload | null;
    const items = root?.items;
    if (!Array.isArray(items)) return [];

    const out: NormalizedJob[] = [];
    for (const { item, country, enrichment } of items) {
      if (!item.id || !item.title || !item.company?.display_name) continue;

      const sourceId = String(item.id);
      const description = item.description ?? "";
      // Prefer the enriched description when it's substantially longer than
      // the API snippet. Adzuna snippets typically land at 400–600 chars;
      // the ">1.5×" gate guarantees we only swap when the win is real and
      // we never regress to a shorter description.
      const useEnriched =
        enrichment &&
        enrichment.descriptionHtml.length > description.length * 1.5;
      const isPredictedSalary = item.salary_is_predicted === "1";
      const hasSalary =
        !isPredictedSalary && Boolean(item.salary_min || item.salary_max);
      const currency = COUNTRY_CURRENCY[country] ?? null;

      // Always append the queried country's ISO-2 so the geocoder
      // anchors correctly. Without it, ambiguous town names like
      // "Delaware" (a UK village in Cornwall AND a US state) resolve
      // to whichever has the highest-population match (US wins). Even
      // if display_name already implies the country, appending again
      // is harmless — the parser scans right-to-left and dedupe
      // doesn't care.
      const iso2 = countryToIso2(country);
      const baseText =
        item.location?.display_name?.trim() ||
        item.location?.area?.slice().reverse().join(", ") ||
        "";
      const locationText = baseText ? `${baseText}, ${iso2}` : iso2;

      out.push({
        source: this.name,
        sourceId,
        title: item.title.trim(),
        companyName: item.company.display_name.trim(),
        // Filled by the enrichment pass when the redirect lands on a
        // non-aggregator employer host; null otherwise.
        companyDomain: enrichment?.companyDomain ?? null,
        // Adzuna doesn't ship logos; pipeline's Logo.dev fallback fills
        // companyLogoUrl by name.
        companyLogoUrl: null,
        locationText,
        // ToS-mandated: clicks must go through redirect_url. Fall back
        // to a minimal Adzuna search URL only if that's missing.
        applyUrl:
          item.redirect_url ??
          `https://www.adzuna.${country === "us" ? "com" : country}/search?adref=${sourceId}`,
        descriptionHtml: useEnriched ? enrichment.descriptionHtml : cleanHtml(description),
        descriptionText: useEnriched ? enrichment.descriptionText : htmlToPlainText(description),
        postedDate: item.created ? new Date(item.created) : new Date(),
        closingDate: null,
        salaryMin: hasSalary && item.salary_min ? Math.round(item.salary_min) : null,
        salaryMax: hasSalary && item.salary_max ? Math.round(item.salary_max) : null,
        salaryCurrency: hasSalary ? currency : null,
        salaryPeriod: hasSalary ? "yearly" : null,
        jobType: pickJobType(item.contract_type, item.contract_time),
        workMode: "unknown",
        experienceLevel: "unknown",
        category: item.category?.label?.toLowerCase() ?? "other",
        // Adzuna spans every collar; the pipeline classifier (lib/classify/collar.ts)
        // promotes blue/white based on title, so we hint "unknown" here.
        collarType: "unknown",
        skills: [],
        benefits: [],
        visaSponsorship: null,
      });
    }
    return out;
  }
}

export const adzuna = new AdzunaSource();
