import type { JobSource, NormalizedJob } from "./types";
import type { $Enums } from "@/lib/generated/prisma/client";
import { cleanHtml, htmlToPlainText } from "./utils";

const ENDPOINT = "https://findwork.dev/api/jobs/";
const USER_AGENT = "Toplisters/1.0 (+https://toplisters.xyz)";

interface FindworkItem {
  id?: number | string;
  role?: string;
  company_name?: string;
  company_num_employees?: string;
  employment_type?: string;
  location?: string;
  remote?: boolean;
  logo?: string | null;
  url?: string;
  text?: string;
  date_posted?: string;
  keywords?: string[];
  source?: string;
}

interface FindworkResponse {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: FindworkItem[];
}

const TYPE_MAP: Record<string, $Enums.JobType> = {
  "full time": "full_time",
  "full-time": "full_time",
  full_time: "full_time",
  fulltime: "full_time",
  "part time": "part_time",
  "part-time": "part_time",
  part_time: "part_time",
  parttime: "part_time",
  contract: "contract",
  freelance: "contract",
  internship: "internship",
  intern: "internship",
  temporary: "temp",
  temp: "temp",
};

function pickJobType(typeText: string | undefined): $Enums.JobType {
  if (!typeText) return "full_time";
  return TYPE_MAP[typeText.toLowerCase()] ?? "full_time";
}

/**
 * Findwork.dev — tech-leaning global job board with a clean public
 * REST API. Free tier: 200 calls/day for registered keys; well within
 * our cadence (60 min × ~24 runs/day = 24 calls/day for a single-page
 * fetch). The dataset is heavily remote/tech but does include some
 * non-tech roles their crawlers pick up.
 *
 * Auth: Token header (NOT Bearer) — `Authorization: Token <key>`.
 *
 * Quirks:
 *  - Page size isn't documented but is ~30-50 results in practice.
 *    Pagination via `next` URL; we walk one page (configurable via
 *    FINDWORK_MAX_PAGES) to keep budget light.
 *  - `remote: true` is the work-mode signal; everything else gets
 *    workMode=onsite (true onsite roles are rare; this is conservative).
 *  - `logo` is sometimes a real CDN URL, sometimes null — pipeline's
 *    Logo.dev fallback handles the null case.
 *  - `keywords` map cleanly to skills.
 *  - `url` is the original posting; `source` names the underlying board
 *    when Findwork aggregated rather than scraped directly.
 */
class FindworkSource implements JobSource {
  readonly name = "findwork";
  readonly displayName = "Findwork";
  readonly attribution = "via Findwork";
  readonly providerUrl = "https://findwork.dev";

  isEnabled(): boolean {
    if (process.env.DISABLE_SOURCE_FINDWORK === "1") return false;
    return Boolean(process.env.FINDWORK_API_KEY);
  }

  async fetch(): Promise<unknown> {
    const apiKey = process.env.FINDWORK_API_KEY;
    if (!apiKey) throw new Error("FINDWORK_API_KEY is not set");

    const maxPages =
      Number.parseInt(process.env.FINDWORK_MAX_PAGES ?? "", 10) || 1;

    const all: FindworkItem[] = [];
    let url: string | null = ENDPOINT;
    for (let page = 0; page < maxPages && url; page++) {
      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
          Authorization: `Token ${apiKey}`,
        },
      });
      if (!response.ok) {
        throw new Error(
          `Findwork fetch failed at page=${page}: ${response.status} ${response.statusText}`,
        );
      }
      const data = (await response.json()) as FindworkResponse;
      all.push(...(data.results ?? []));
      url = data.next ?? null;
    }
    return { results: all } satisfies FindworkResponse;
  }

  normalize(raw: unknown): NormalizedJob[] {
    const root = raw as FindworkResponse | null;
    const items = root?.results;
    if (!Array.isArray(items)) return [];

    const out: NormalizedJob[] = [];
    for (const item of items) {
      if (!item.id || !item.role || !item.company_name) continue;

      const html = item.text ?? "";
      const isRemote = Boolean(item.remote);
      const locationText = (item.location ?? "").trim() ||
        (isRemote ? "Remote — Worldwide" : "Unknown");

      out.push({
        source: this.name,
        sourceId: String(item.id),
        title: item.role.trim(),
        companyName: item.company_name.trim(),
        companyDomain: null,
        companyLogoUrl: item.logo ?? null,
        locationText,
        applyUrl: item.url ?? `https://findwork.dev/jobs/${item.id}/`,
        descriptionHtml: cleanHtml(html),
        descriptionText: htmlToPlainText(html),
        postedDate: item.date_posted ? new Date(item.date_posted) : new Date(),
        closingDate: null,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        salaryPeriod: null,
        jobType: pickJobType(item.employment_type),
        workMode: isRemote ? "remote" : "onsite",
        experienceLevel: "unknown",
        category: item.keywords?.[0]?.toLowerCase() ?? "tech",
        // Findwork is overwhelmingly tech / knowledge work — hint white,
        // pipeline classifier can still promote a non-tech outlier.
        collarType: "white",
        skills: (item.keywords ?? []).map((k) => k.trim()).filter(Boolean).slice(0, 20),
        benefits: [],
        visaSponsorship: null,
      });
    }
    return out;
  }
}

export const findwork = new FindworkSource();
