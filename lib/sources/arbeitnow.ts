import type { JobSource, NormalizedJob } from "./types";
import type { $Enums } from "@/lib/generated/prisma/client";
import { cleanHtml, htmlToPlainText } from "./utils";

const ENDPOINT = "https://www.arbeitnow.com/api/job-board-api";
const USER_AGENT = "Toplisters/1.0 (+https://toplisters.xyz)";

interface ArbeitnowItem {
  slug?: string;
  company_name?: string;
  title?: string;
  description?: string;
  remote?: boolean | string;
  url?: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: number | string;
}

interface ArbeitnowResponse {
  data?: ArbeitnowItem[];
}

const JOB_TYPE_MAP: Record<string, $Enums.JobType> = {
  "full-time": "full_time",
  full_time: "full_time",
  fulltime: "full_time",
  "part-time": "part_time",
  part_time: "part_time",
  parttime: "part_time",
  contract: "contract",
  contractor: "contract",
  freelance: "contract",
  temp: "temp",
  temporary: "temp",
  internship: "internship",
  intern: "internship",
};

function isRemote(value: unknown): boolean {
  // The API uses string "True"/"False" rather than booleans.
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

function pickJobType(jobTypes: string[] | undefined): $Enums.JobType {
  if (!jobTypes || jobTypes.length === 0) return "full_time";
  for (const t of jobTypes) {
    const mapped = JOB_TYPE_MAP[t.toLowerCase()];
    if (mapped) return mapped;
  }
  return "full_time";
}

/**
 * Arbeitnow aggregates EU-focused tech roles (heavy DE / FR / NL / UK
 * coverage) with a generous public API — no auth, ~100 jobs per page,
 * paginated via `links` / `meta`. Phase 1 takes only the first page; an
 * extra step adds pagination once the cadence justifies the call budget.
 *
 * Caveats baked in:
 *  - `remote` is a string ("True" / "False") not a boolean.
 *  - `tags` is sometimes empty; `job_types` is the more reliable cue.
 *  - Most listings include city + country in `location`, so the geocoder
 *    has more to work with than RemoteOK's single-token "Worldwide".
 *  - No logo URL is shipped in the payload — the logo resolver fills that
 *    in via Logo.dev.
 */
class ArbeitnowSource implements JobSource {
  readonly name = "arbeitnow";
  readonly displayName = "Arbeitnow";

  isEnabled(): boolean {
    return process.env.DISABLE_SOURCE_ARBEITNOW !== "1";
  }

  async fetch(): Promise<unknown> {
    const response = await fetch(ENDPOINT, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Arbeitnow fetch failed: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  normalize(raw: unknown): NormalizedJob[] {
    const root = raw as ArbeitnowResponse | null;
    const items = root?.data;
    if (!Array.isArray(items)) return [];

    const out: NormalizedJob[] = [];
    for (const item of items) {
      if (!item.slug || !item.title || !item.company_name) continue;

      const html = item.description ?? "";
      const tags = (item.tags ?? []).map((t) => t.trim()).filter(Boolean);
      const remote = isRemote(item.remote);
      const epoch =
        typeof item.created_at === "number"
          ? item.created_at
          : Number.parseInt(String(item.created_at ?? ""), 10);
      const postedDate = Number.isFinite(epoch) ? new Date(epoch * 1000) : new Date();

      out.push({
        source: this.name,
        sourceId: item.slug,
        title: item.title.trim(),
        companyName: item.company_name.trim(),
        companyDomain: null,
        companyLogoUrl: null,
        locationText: (item.location ?? (remote ? "Remote — Worldwide" : "Unknown")).trim(),
        applyUrl: item.url ?? `https://www.arbeitnow.com/jobs/${item.slug}`,
        descriptionHtml: cleanHtml(html),
        descriptionText: htmlToPlainText(html),
        postedDate,
        closingDate: null,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        salaryPeriod: null,
        jobType: pickJobType(item.job_types),
        workMode: remote ? "remote" : "onsite",
        experienceLevel: "unknown",
        category: tags[0] ?? "tech",
        collarType: "white",
        skills: tags.slice(0, 20),
        benefits: [],
        visaSponsorship: null,
      });
    }
    return out;
  }
}

export const arbeitnow = new ArbeitnowSource();
