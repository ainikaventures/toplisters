import type { JobSource, NormalizedJob } from "./types";
import type { $Enums } from "@/lib/generated/prisma/client";
import { cleanHtml, htmlToPlainText } from "./utils";

const ENDPOINT = "https://www.themuse.com/api/public/jobs";
const USER_AGENT = "Toplisters/1.0 (+https://toplisters.xyz)";
// 20 results / page is the API's fixed page size; we walk a bounded number
// of pages so a single run doesn't blow the unauthenticated 60 req/hr cap
// (default schedule is 90 min, well under the budget at 5 pages = 5 calls).
const DEFAULT_MAX_PAGES = 5;

interface MuseNamed {
  name?: string;
  short_name?: string;
}

interface MuseCompany {
  name?: string;
  short_name?: string;
}

interface MuseRefs {
  landing_page?: string;
}

interface MuseItem {
  id?: number;
  type?: string;
  name?: string;
  contents?: string;
  publication_date?: string;
  locations?: MuseNamed[];
  categories?: MuseNamed[];
  levels?: MuseNamed[];
  tags?: MuseNamed[];
  company?: MuseCompany;
  refs?: MuseRefs;
  short_name?: string;
}

interface MuseResponse {
  page?: number;
  page_count?: number;
  results?: MuseItem[];
}

const LEVEL_MAP: Record<string, $Enums.ExperienceLevel> = {
  internship: "entry",
  intern: "entry",
  entry_level: "entry",
  entry: "entry",
  mid_level: "mid",
  mid: "mid",
  senior_level: "senior",
  senior: "senior",
  director: "exec",
  executive: "exec",
  exec: "exec",
};

// "Flexible / Remote" is The Muse's house phrasing; "Anywhere" shows up on
// fully-remote postings. Match on whole words to avoid false positives like
// "remote villages" appearing inside city names.
const REMOTE_REGEX = /\b(remote|flexible|anywhere)\b/i;

function levelKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function pickLevel(levels: MuseNamed[] | undefined): $Enums.ExperienceLevel {
  if (!levels) return "unknown";
  for (const l of levels) {
    for (const candidate of [l.short_name, l.name]) {
      if (!candidate) continue;
      const mapped = LEVEL_MAP[levelKey(candidate)];
      if (mapped) return mapped;
    }
  }
  return "unknown";
}

function isInternship(levels: MuseNamed[] | undefined): boolean {
  if (!levels) return false;
  return levels.some((l) =>
    `${l.short_name ?? ""} ${l.name ?? ""}`.toLowerCase().includes("intern"),
  );
}

/**
 * The Muse — curated, US-leaning white-collar board with a generous public
 * API. No API key strictly required (60 req/hr unauthenticated; 500 req/hr
 * if `THE_MUSE_API_KEY` is set). Pagination is 0-indexed at 20 results per
 * page; the adapter walks `THE_MUSE_MAX_PAGES` (default 5).
 *
 * Caveats baked in:
 *  - Salary is not in the API; we leave salary fields null.
 *  - The payload doesn't ship a logo URL — Logo.dev fills it in by company
 *    name in the pipeline.
 *  - "Internship" comes through as a level; we surface it as both
 *    jobType=internship and experienceLevel=entry.
 *  - Multi-location postings keep the first location for geocoding; the
 *    rest stay implicit in the listing's location text.
 */
class TheMuseSource implements JobSource {
  readonly name = "the_muse";
  readonly displayName = "The Muse";
  readonly attribution = "via The Muse";
  readonly providerUrl = "https://www.themuse.com";

  isEnabled(): boolean {
    return process.env.DISABLE_SOURCE_THE_MUSE !== "1";
  }

  async fetch(): Promise<unknown> {
    const apiKey = process.env.THE_MUSE_API_KEY;
    const maxPages =
      Number.parseInt(process.env.THE_MUSE_MAX_PAGES ?? "", 10) || DEFAULT_MAX_PAGES;

    const all: MuseItem[] = [];
    for (let page = 0; page < maxPages; page++) {
      const url = new URL(ENDPOINT);
      url.searchParams.set("page", String(page));
      if (apiKey) url.searchParams.set("api_key", apiKey);

      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(
          `The Muse fetch failed at page=${page}: ${response.status} ${response.statusText}`,
        );
      }
      const data = (await response.json()) as MuseResponse;
      const items = data.results ?? [];
      all.push(...items);

      if (items.length === 0) break;
      const totalPages = data.page_count ?? 0;
      if (totalPages > 0 && page + 1 >= totalPages) break;
    }
    return { results: all } satisfies MuseResponse;
  }

  normalize(raw: unknown): NormalizedJob[] {
    const root = raw as MuseResponse | null;
    const items = root?.results;
    if (!Array.isArray(items)) return [];

    const out: NormalizedJob[] = [];
    for (const item of items) {
      if (!item.id || !item.name || !item.company?.name) continue;

      const sourceId = String(item.id);
      const html = item.contents ?? "";
      const locationText = (item.locations?.[0]?.name ?? "Remote").trim();
      const remote = REMOTE_REGEX.test(locationText);
      const intern = isInternship(item.levels);

      const tagNames = (item.tags ?? [])
        .map((t) => (t.name ?? "").trim())
        .filter(Boolean);
      const category = item.categories?.[0]?.name?.trim().toLowerCase() ?? "other";

      const postedDate = item.publication_date
        ? new Date(item.publication_date)
        : new Date();

      const applyUrl =
        item.refs?.landing_page ??
        `https://www.themuse.com/jobs/${item.company.short_name ?? ""}/${item.short_name ?? sourceId}`;

      out.push({
        source: this.name,
        sourceId,
        title: item.name.trim(),
        companyName: item.company.name.trim(),
        companyDomain: null,
        companyLogoUrl: null,
        locationText,
        applyUrl,
        descriptionHtml: cleanHtml(html),
        descriptionText: htmlToPlainText(html),
        postedDate,
        closingDate: null,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        salaryPeriod: null,
        jobType: intern ? "internship" : "full_time",
        workMode: remote ? "remote" : "onsite",
        experienceLevel: pickLevel(item.levels),
        category,
        collarType: "white",
        skills: tagNames.slice(0, 20),
        benefits: [],
        visaSponsorship: null,
      });
    }
    return out;
  }
}

export const theMuse = new TheMuseSource();
