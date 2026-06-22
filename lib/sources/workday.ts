import type { JobSource, NormalizedJob } from "./types";
import type { $Enums } from "@/lib/generated/prisma/client";
import { cleanHtml, htmlToPlainText } from "./utils";

/**
 * Workday — the enterprise ATS behind a huge share of large-company careers
 * sites (and roles that never reach reed/Adzuna). Each tenant exposes a public
 * CXS endpoint; the list gives titles + paths, and a per-posting detail call
 * gives the description + a direct apply URL (externalUrl).
 *
 * Configure tenants via WORKDAY_TENANTS as "tenant:wdN:site" (comma-sep), e.g.
 *   WORKDAY_TENANTS="nvidia:wd5:NVIDIAExternalCareerSite,cba:wd3:CommBank"
 * The three parts are the path segments of
 *   https://<tenant>.<wdN>.myworkdayjobs.com/wday/cxs/<tenant>/<site>/jobs
 */

const USER_AGENT = "Toplisters/1.0 (+https://toplisters.xyz)";
const REQUEST_GAP_MS = 250;
const PAGE = 20;
const MAX_PER_TENANT = Number.parseInt(process.env.WORKDAY_MAX ?? "", 10) || 60;

const DEFAULT_TENANTS: readonly string[] = ["nvidia:wd5:NVIDIAExternalCareerSite"];

interface WdConfig {
  tenant: string;
  wd: string;
  site: string;
}
interface WdListResponse {
  jobPostings?: { externalPath?: string }[];
}
interface WdDetail {
  jobPostingInfo?: {
    title?: string;
    jobDescription?: string;
    location?: string;
    startDate?: string;
    jobReqId?: string;
    externalUrl?: string;
    timeType?: string;
  };
}
interface FetchedItem {
  detail: WdDetail;
  cfg: WdConfig;
}
interface FetchPayload {
  items: FetchedItem[];
}

const TYPE_MAP: Record<string, $Enums.JobType> = {
  "full time": "full_time",
  "part time": "part_time",
  contract: "contract",
  temporary: "temp",
  intern: "internship",
};

function pickJobType(timeType: string | undefined): $Enums.JobType {
  return TYPE_MAP[(timeType ?? "").toLowerCase()] ?? "full_time";
}
function configuredTenants(): WdConfig[] {
  const raw = process.env.WORKDAY_TENANTS?.trim();
  const list = raw ? raw.split(",") : [...DEFAULT_TENANTS];
  return list
    .map((s) => {
      const [tenant, wd, site] = s.split(":").map((x) => x?.trim());
      return { tenant, wd, site } as WdConfig;
    })
    .filter((c) => c.tenant && c.wd && c.site);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class WorkdaySource implements JobSource {
  readonly name = "workday";
  readonly displayName = "Workday";
  readonly attribution = "via the company's careers page";
  readonly providerUrl = "https://www.workday.com";

  isEnabled(): boolean {
    return process.env.DISABLE_SOURCE_WORKDAY !== "1";
  }

  async fetch(): Promise<unknown> {
    const items: FetchedItem[] = [];
    for (const cfg of configuredTenants()) {
      const base = `https://${cfg.tenant}.${cfg.wd}.myworkdayjobs.com/wday/cxs/${cfg.tenant}/${cfg.site}`;
      try {
        const paths: string[] = [];
        for (let offset = 0; offset < MAX_PER_TENANT; offset += PAGE) {
          const res = await fetch(`${base}/jobs`, {
            method: "POST",
            headers: { "User-Agent": USER_AGENT, "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ limit: PAGE, offset, searchText: "", appliedFacets: {} }),
          });
          if (!res.ok) {
            console.warn(`Workday list failed: ${cfg.tenant} → ${res.status}`);
            break;
          }
          const data = (await res.json()) as WdListResponse;
          const jp = data.jobPostings ?? [];
          for (const j of jp) if (j.externalPath) paths.push(j.externalPath);
          if (jp.length < PAGE) break;
          await sleep(REQUEST_GAP_MS);
        }
        for (const p of paths.slice(0, MAX_PER_TENANT)) {
          await sleep(REQUEST_GAP_MS);
          try {
            const dRes = await fetch(`${base}${p}`, {
              headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
            });
            if (!dRes.ok) continue;
            items.push({ detail: (await dRes.json()) as WdDetail, cfg });
          } catch {
            /* skip one bad posting */
          }
        }
      } catch (error) {
        console.warn(`Workday errored: ${cfg.tenant} →`, error instanceof Error ? error.message : error);
      }
      await sleep(REQUEST_GAP_MS);
    }
    return { items } satisfies FetchPayload;
  }

  normalize(raw: unknown): NormalizedJob[] {
    const items = (raw as FetchPayload | null)?.items;
    if (!Array.isArray(items)) return [];
    const out: NormalizedJob[] = [];
    for (const { detail, cfg } of items) {
      const info = detail.jobPostingInfo;
      if (!info?.title) continue;
      const html = info.jobDescription ?? "";
      const applyUrl =
        info.externalUrl || `https://${cfg.tenant}.${cfg.wd}.myworkdayjobs.com/${cfg.site}`;
      out.push({
        source: this.name,
        sourceId: info.jobReqId || applyUrl,
        title: info.title.trim(),
        companyName: cfg.tenant.charAt(0).toUpperCase() + cfg.tenant.slice(1),
        companyDomain: null,
        companyLogoUrl: null,
        locationText: info.location?.trim() || "Unknown",
        applyUrl,
        descriptionHtml: cleanHtml(html),
        descriptionText: htmlToPlainText(html),
        postedDate: info.startDate ? new Date(info.startDate) : new Date(),
        closingDate: null,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        salaryPeriod: null,
        jobType: pickJobType(info.timeType),
        workMode: "unknown",
        experienceLevel: "unknown",
        category: "other",
        collarType: "white",
        skills: [],
        benefits: [],
        visaSponsorship: null,
      });
    }
    return out;
  }
}

export const workday = new WorkdaySource();
