import type { JobSource, NormalizedJob } from "./types";
import type { $Enums } from "@/lib/generated/prisma/client";
import { cleanHtml, htmlToPlainText } from "./utils";

const ENDPOINT = "https://jooble.org/api";
const USER_AGENT = "Toplisters/1.0 (+https://toplisters.xyz)";
const DEFAULT_PAGE_SIZE = 50;
const REQUEST_GAP_MS = 250;

// Jooble doesn't expose a per-country API path the way Adzuna does —
// you tell it the location as free-text and their backend filters the
// underlying aggregated index. We seed with country names that map
// reliably to large coverage; override via env to narrow or expand.
const DEFAULT_LOCATIONS: readonly { label: string; iso2: string }[] = [
  { label: "United Kingdom", iso2: "GB" },
  { label: "United States", iso2: "US" },
  { label: "Germany", iso2: "DE" },
  { label: "France", iso2: "FR" },
  { label: "India", iso2: "IN" },
  { label: "Poland", iso2: "PL" },
  { label: "Russia", iso2: "RU" },
  { label: "Spain", iso2: "ES" },
  { label: "Italy", iso2: "IT" },
  { label: "Netherlands", iso2: "NL" },
];

interface JoobleItem {
  id?: number | string;
  title?: string;
  location?: string;
  snippet?: string;
  salary?: string;
  source?: string;
  type?: string;
  link?: string;
  company?: string;
  updated?: string;
}

interface JoobleResponse {
  totalCount?: number;
  jobs?: JoobleItem[];
}

interface FetchedItem {
  item: JoobleItem;
  iso2: string;
}

interface FetchPayload {
  items: FetchedItem[];
}

const TYPE_MAP: Record<string, $Enums.JobType> = {
  "full-time": "full_time",
  full_time: "full_time",
  fulltime: "full_time",
  "part-time": "part_time",
  part_time: "part_time",
  parttime: "part_time",
  contract: "contract",
  freelance: "contract",
  temporary: "temp",
  temp: "temp",
  internship: "internship",
  intern: "internship",
};

function pickJobType(typeText: string | undefined): $Enums.JobType {
  if (!typeText) return "full_time";
  const key = typeText.toLowerCase().replace(/\s+/g, "_");
  return TYPE_MAP[key] ?? "full_time";
}

function configuredLocations(): typeof DEFAULT_LOCATIONS {
  const raw = process.env.JOOBLE_LOCATIONS?.trim();
  if (!raw) return DEFAULT_LOCATIONS;
  // Format: "United Kingdom:GB,Germany:DE"
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [label, iso2] = entry.split(":").map((s) => s.trim());
      return { label, iso2: (iso2 || "").toUpperCase() };
    })
    .filter((e) => e.label && e.iso2.length === 2);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Jooble — global meta-aggregator with broad coverage in 70+ countries
 * and free API access (request a key at jooble.org/api/about). The
 * underlying data is sourced from many smaller boards, so attribution
 * varies per row (item.source) — we surface "via Jooble" as the
 * top-level credit and let the adapter pass the per-row source through
 * the description for transparency.
 *
 * Per-country budget at the 90-min cadence already in scheduler.ts
 * (jooble: 90):
 *   10 countries × 1 page × 50 results = 10 calls/run × 16 runs/day
 *   ≈ 160 calls/day — well under typical free-tier limits.
 *
 * Quirks:
 *  - POST endpoint with API key in the URL path: POST /api/<key>
 *  - Salary is a free-text string ("$50K - $80K", "£30,000 - £50,000")
 *    that's expensive to parse reliably; we drop it rather than risk
 *    misrepresenting numbers. Interested users see it in the snippet.
 *  - Country code isn't in the response — we tag rows with the country
 *    we queried (added to locationText so the geocoder anchors).
 *  - Some `link` values are Jooble-tracked redirects. Pass through
 *    unmodified to keep their referral attribution intact.
 */
class JoobleSource implements JobSource {
  readonly name = "jooble";
  readonly displayName = "Jooble";
  readonly attribution = "via Jooble";

  isEnabled(): boolean {
    if (process.env.DISABLE_SOURCE_JOOBLE === "1") return false;
    return Boolean(process.env.JOOBLE_API_KEY);
  }

  async fetch(): Promise<unknown> {
    const apiKey = process.env.JOOBLE_API_KEY;
    if (!apiKey) throw new Error("JOOBLE_API_KEY is not set");

    const items: FetchedItem[] = [];
    for (const { label, iso2 } of configuredLocations()) {
      try {
        const response = await fetch(`${ENDPOINT}/${apiKey}`, {
          method: "POST",
          headers: {
            "User-Agent": USER_AGENT,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            location: label,
            page: "1",
            ResultOnPage: DEFAULT_PAGE_SIZE,
          }),
        });
        if (!response.ok) {
          console.warn(
            `Jooble fetch failed: ${label} → ${response.status} ${response.statusText}`,
          );
          continue;
        }
        const data = (await response.json()) as JoobleResponse;
        for (const item of data.jobs ?? []) items.push({ item, iso2 });
      } catch (error) {
        console.warn(
          `Jooble fetch errored: ${label} →`,
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
    for (const { item, iso2 } of items) {
      if (!item.id || !item.title || !item.company) continue;

      const html = item.snippet ?? "";
      const baseLocation = item.location?.trim() || "";
      const locationText = baseLocation ? `${baseLocation}, ${iso2}` : iso2;

      out.push({
        source: this.name,
        sourceId: String(item.id),
        title: item.title.trim(),
        companyName: item.company.trim(),
        companyDomain: null,
        companyLogoUrl: null,
        locationText,
        applyUrl: item.link ?? `https://jooble.org/jdp/${item.id}`,
        descriptionHtml: cleanHtml(html),
        descriptionText: htmlToPlainText(html),
        postedDate: item.updated ? new Date(item.updated) : new Date(),
        closingDate: null,
        // Salary is a free-text string in the API; safer to drop than
        // misparse. Listed in the snippet for users who care.
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        salaryPeriod: null,
        jobType: pickJobType(item.type),
        workMode: "unknown",
        experienceLevel: "unknown",
        category: "other",
        // Jooble spans every collar — let the title classifier decide.
        collarType: "unknown",
        skills: [],
        benefits: [],
        visaSponsorship: null,
      });
    }
    return out;
  }
}

export const jooble = new JoobleSource();
