import type { JobSource, NormalizedJob } from "./types";
import type { $Enums } from "@/lib/generated/prisma/client";
import { cleanHtml, htmlToPlainText } from "./utils";

const ENDPOINT = "https://remotive.com/api/remote-jobs";
const USER_AGENT = "Toplisters/1.0 (+https://toplisters.xyz)";

interface RemotiveItem {
  id?: number;
  url?: string;
  title?: string;
  company_name?: string;
  company_logo?: string;
  company_logo_url?: string;
  category?: string;
  tags?: string[];
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}

interface RemotiveResponse {
  "job-count"?: number;
  "total-job-count"?: number;
  jobs?: RemotiveItem[];
}

const JOB_TYPE_MAP: Record<string, $Enums.JobType> = {
  full_time: "full_time",
  "full-time": "full_time",
  fulltime: "full_time",
  part_time: "part_time",
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

function pickJobType(jobType: string | undefined): $Enums.JobType {
  if (!jobType) return "full_time";
  return JOB_TYPE_MAP[jobType.toLowerCase()] ?? "full_time";
}

/**
 * Remotive — remote-only tech / non-tech aggregator. Public JSON API at
 * /api/remote-jobs returns the entire current feed in one shot, similar
 * to RemoteOK, so the adapter is simple: one fetch, one normalize pass.
 *
 * Every Remotive listing is, by definition, remote — workMode is
 * hardcoded to "remote" and the `candidate_required_location` string
 * (free-text like "USA Only" or "Americas, Europe, Asia, Oceania")
 * goes straight into locationText. The geocoder handles those
 * country-list strings reasonably; cases it can't resolve fall back
 * to "Remote — Worldwide" via the pipeline.
 *
 * No salary parsing: Remotive's `salary` field is free-text and
 * inconsistent ("$75k - $95k", "75000-95000 USD", "$120K", ""). Not
 * worth the parsing maintenance burden — the listing still shows the
 * raw range in the description body.
 */
class RemotiveSource implements JobSource {
  readonly name = "remotive";
  readonly displayName = "Remotive";
  readonly providerUrl = "https://remotive.com";

  isEnabled(): boolean {
    return process.env.DISABLE_SOURCE_REMOTIVE !== "1";
  }

  async fetch(): Promise<unknown> {
    const response = await fetch(ENDPOINT, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(
        `Remotive fetch failed: ${response.status} ${response.statusText}`,
      );
    }
    return response.json();
  }

  normalize(raw: unknown): NormalizedJob[] {
    const root = raw as RemotiveResponse | null;
    const jobs = root?.jobs;
    if (!Array.isArray(jobs)) return [];

    const out: NormalizedJob[] = [];
    for (const item of jobs) {
      if (!item.id || !item.title || !item.company_name) continue;

      const sourceId = String(item.id);
      const html = item.description ?? "";
      const tags = (item.tags ?? []).map((t) => t.trim()).filter(Boolean);
      const locationText = item.candidate_required_location?.trim() || "Remote — Worldwide";

      out.push({
        source: this.name,
        sourceId,
        title: item.title.trim(),
        companyName: item.company_name.trim(),
        companyDomain: null,
        companyLogoUrl: item.company_logo_url?.trim() || item.company_logo?.trim() || null,
        locationText,
        applyUrl: item.url ?? `https://remotive.com/remote-jobs/${sourceId}`,
        descriptionHtml: cleanHtml(html),
        descriptionText: htmlToPlainText(html),
        postedDate: item.publication_date ? new Date(item.publication_date) : new Date(),
        closingDate: null,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        salaryPeriod: null,
        jobType: pickJobType(item.job_type),
        workMode: "remote",
        experienceLevel: "unknown",
        category: item.category?.toLowerCase() ?? "other",
        // Remotive skews tech / knowledge-worker. The pipeline classifier
        // promotes any clearly-blue title (warehouse, driver, etc.) that
        // slips in; hinting white is the right default.
        collarType: "white",
        skills: tags.slice(0, 20),
        benefits: [],
        visaSponsorship: null,
      });
    }
    return out;
  }
}

export const remotive = new RemotiveSource();
