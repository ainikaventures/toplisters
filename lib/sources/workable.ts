import type { JobSource, NormalizedJob } from "./types";
import type { $Enums } from "@/lib/generated/prisma/client";
import { cleanHtml, htmlToPlainText } from "./utils";

/**
 * Workable — public job board (jobs.workable.com), the syndication-friendly
 * aggregation of employers' Workable boards. We use the public board API
 * (jobs.workable.com/api/v1/jobs) rather than the per-company SPI, which
 * requires each employer's private API token (401 without it).
 *
 * Compliance: this is Workable's public, distribution-intended board (jobs are
 * published there by employers for max reach — Google Jobs, etc.); robots.txt
 * allows the API path and there's no bot-blocking. Undocumented endpoint, so we
 * attribute "via Workable", rate-limit, and ship a DISABLE_SOURCE_WORKABLE kill
 * switch. See info/COMPLIANCE.md.
 *
 * Per-location budget (paginate MAX_PAGES of ~50 across the default markets):
 *   ~8 locations × 2 pages = 16 calls/run — well within reason.
 */

const ENDPOINT = "https://jobs.workable.com/api/v1/jobs";
const USER_AGENT =
  "Mozilla/5.0 (compatible; ToplistersBot/1.0; +https://toplisters.xyz)";
const REQUEST_GAP_MS = 300;
const MAX_PAGES = Number.parseInt(process.env.WORKABLE_MAX_PAGES ?? "", 10) || 2;

// Location strings the board understands. Seeded toward our priority visa
// markets + large English-language ones; override with WORKABLE_LOCATIONS.
const DEFAULT_LOCATIONS: readonly string[] = [
  "United Kingdom",
  "United States",
  "Germany",
  "Netherlands",
  "Ireland",
  "United Arab Emirates",
  "Canada",
  "Australia",
  "India",
];

interface WorkableJob {
  id?: string;
  title?: string;
  description?: string;
  requirementsSection?: string;
  benefitsSection?: string;
  employmentType?: string;
  workplace?: string;
  url?: string;
  department?: string;
  created?: string;
  locations?: string[];
  location?: { city?: string; subregion?: string; countryName?: string };
  company?: { title?: string; website?: string; image?: string };
}
interface WorkableResponse {
  jobs?: WorkableJob[];
  nextPageToken?: string;
}
interface FetchedItem {
  job: WorkableJob;
  /** The location we queried — anchors remote ("TELECOMMUTE") rows to a country. */
  queriedLocation: string;
}
interface FetchPayload {
  items: FetchedItem[];
}

const TYPE_MAP: Record<string, $Enums.JobType> = {
  "full-time": "full_time",
  "part-time": "part_time",
  contract: "contract",
  temporary: "temp",
  internship: "internship",
  intern: "internship",
};
function pickJobType(t: string | undefined): $Enums.JobType {
  return TYPE_MAP[(t ?? "").toLowerCase().replace(/\s+/g, "-")] ?? "full_time";
}
function pickWorkMode(w: string | undefined): $Enums.WorkMode {
  const k = (w ?? "").toLowerCase();
  if (k === "remote") return "remote";
  if (k === "hybrid") return "hybrid";
  if (k === "on-site" || k === "onsite") return "onsite";
  return "unknown";
}
function domainFrom(website: string | undefined): string | null {
  if (!website) return null;
  try {
    return new URL(website).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}
function configuredLocations(): string[] {
  const raw = process.env.WORKABLE_LOCATIONS?.trim();
  if (!raw) return [...DEFAULT_LOCATIONS];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class WorkableSource implements JobSource {
  readonly name = "workable";
  readonly displayName = "Workable";
  readonly attribution = "via Workable";
  readonly providerUrl = "https://jobs.workable.com";

  isEnabled(): boolean {
    return process.env.DISABLE_SOURCE_WORKABLE !== "1";
  }

  async fetch(): Promise<unknown> {
    const items: FetchedItem[] = [];
    const seen = new Set<string>();
    for (const location of configuredLocations()) {
      let pageToken: string | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        const url =
          `${ENDPOINT}?query=&location=${encodeURIComponent(location)}` +
          (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
        try {
          const res = await fetch(url, {
            headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
          });
          if (!res.ok) {
            console.warn(`Workable fetch failed: ${location} p${page} → ${res.status}`);
            break;
          }
          const data = (await res.json()) as WorkableResponse;
          for (const j of data.jobs ?? []) {
            if (j.id && !seen.has(j.id)) {
              seen.add(j.id);
              items.push({ job: j, queriedLocation: location });
            }
          }
          if (!data.nextPageToken) break;
          pageToken = data.nextPageToken;
        } catch (error) {
          console.warn(
            `Workable fetch errored: ${location} →`,
            error instanceof Error ? error.message : error,
          );
          break;
        }
        await sleep(REQUEST_GAP_MS);
      }
      await sleep(REQUEST_GAP_MS);
    }
    return { items } satisfies FetchPayload;
  }

  normalize(raw: unknown): NormalizedJob[] {
    const items = (raw as FetchPayload | null)?.items;
    if (!Array.isArray(items)) return [];
    const out: NormalizedJob[] = [];
    for (const { job: j, queriedLocation } of items) {
      if (!j.id || !j.title || !j.company?.title || !j.url) continue;
      const html = [j.description, j.requirementsSection, j.benefitsSection]
        .filter(Boolean)
        .join("\n");
      // Workable marks remote rows "TELECOMMUTE" with no geo — anchor those to
      // the structured country, else the location we queried (for visa tags).
      const structured = [j.location?.city, j.location?.subregion, j.location?.countryName]
        .filter(Boolean)
        .join(", ");
      const rawLoc = j.locations?.[0];
      const locationText =
        rawLoc && rawLoc.toUpperCase() !== "TELECOMMUTE"
          ? rawLoc
          : structured || j.location?.countryName || queriedLocation || "Unknown";

      out.push({
        source: this.name,
        sourceId: String(j.id),
        title: j.title.trim(),
        companyName: j.company.title.trim(),
        companyDomain: domainFrom(j.company.website),
        companyLogoUrl: j.company.image || null,
        locationText,
        applyUrl: j.url,
        descriptionHtml: cleanHtml(html),
        descriptionText: htmlToPlainText(html),
        postedDate: j.created ? new Date(j.created) : new Date(),
        closingDate: null,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        salaryPeriod: null,
        jobType: pickJobType(j.employmentType),
        workMode: pickWorkMode(j.workplace),
        experienceLevel: "unknown",
        category: j.department?.toLowerCase() ?? "other",
        collarType: "white",
        skills: [],
        benefits: [],
        visaSponsorship: null,
      });
    }
    return out;
  }
}

export const workable = new WorkableSource();
