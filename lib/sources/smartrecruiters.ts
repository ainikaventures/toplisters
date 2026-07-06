import type { JobSource, NormalizedJob } from "./types";
import type { $Enums } from "@/lib/generated/prisma/client";
import { cleanHtml, htmlToPlainText } from "./utils";

/**
 * SmartRecruiters — public, unauthenticated postings API per company.
 * Direct-from-employer data with a real apply URL (jobs.smartrecruiters.com),
 * no scraping, no ToS friction. The list endpoint omits the description, so we
 * fetch each posting's detail (capped per company) for the apply URL + body.
 *
 * Company identifiers are CASE-SENSITIVE (the path segment in
 * api.smartrecruiters.com/v1/companies/<id>/postings). Configure via
 * SMARTRECRUITERS_COMPANIES; defaults to a small live set.
 */

const USER_AGENT = "Toplisters/1.0 (+https://toplisters.xyz)";
const REQUEST_GAP_MS = 200;
const MAX_PER_COMPANY =
  Number.parseInt(process.env.SMARTRECRUITERS_MAX ?? "", 10) || 60;

const DEFAULT_COMPANIES: readonly string[] = [
  "Visa", "Bosch", "Square",
  // India — verified direct boards (Indian IT/product employers).
  "Freshworks", "Swiggy", "Whatfix",
];

interface SrLocation {
  city?: string;
  region?: string;
  country?: string;
  remote?: boolean;
  hybrid?: boolean;
  fullLocation?: string;
}
interface SrSection {
  text?: string;
}
interface SrDetail {
  id?: string;
  name?: string;
  company?: { name?: string };
  location?: SrLocation;
  releasedDate?: string;
  applyUrl?: string;
  postingUrl?: string;
  typeOfEmployment?: { label?: string };
  function?: { label?: string };
  department?: { label?: string };
  jobAd?: {
    sections?: {
      jobDescription?: SrSection;
      qualifications?: SrSection;
      additionalInformation?: SrSection;
    };
  };
}
interface SrListResponse {
  content?: { id?: string }[];
}
interface FetchedItem {
  detail: SrDetail;
  company: string;
}
interface FetchPayload {
  items: FetchedItem[];
}

const TYPE_MAP: Record<string, $Enums.JobType> = {
  "full-time": "full_time",
  permanent: "full_time",
  "part-time": "part_time",
  contract: "contract",
  contractor: "contract",
  temporary: "temp",
  intern: "internship",
  internship: "internship",
};

function pickJobType(label: string | undefined): $Enums.JobType {
  return TYPE_MAP[(label ?? "").toLowerCase().replace(/\s+/g, "-")] ?? "full_time";
}
function pickWorkMode(loc: SrLocation | undefined): $Enums.WorkMode {
  if (loc?.remote) return "remote";
  if (loc?.hybrid) return "hybrid";
  return loc ? "onsite" : "unknown";
}
function configuredCompanies(): string[] {
  // Curated defaults always run; SMARTRECRUITERS_COMPANIES extends (union).
  const extra = (process.env.SMARTRECRUITERS_COMPANIES ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_COMPANIES, ...extra])];
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class SmartRecruitersSource implements JobSource {
  readonly name = "smartrecruiters";
  readonly displayName = "SmartRecruiters";
  readonly attribution = "via the company's careers page";
  readonly providerUrl = "https://www.smartrecruiters.com";

  isEnabled(): boolean {
    return process.env.DISABLE_SOURCE_SMARTRECRUITERS !== "1";
  }

  async fetch(): Promise<unknown> {
    const items: FetchedItem[] = [];
    for (const company of configuredCompanies()) {
      try {
        const listRes = await fetch(
          `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings?limit=100`,
          { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } },
        );
        if (!listRes.ok) {
          console.warn(`SmartRecruiters list failed: ${company} → ${listRes.status}`);
          continue;
        }
        const list = (await listRes.json()) as SrListResponse;
        const ids = (list.content ?? [])
          .map((p) => p.id)
          .filter((x): x is string => Boolean(x))
          .slice(0, MAX_PER_COMPANY);
        for (const id of ids) {
          await sleep(REQUEST_GAP_MS);
          try {
            const dRes = await fetch(
              `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings/${id}`,
              { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } },
            );
            if (!dRes.ok) continue;
            items.push({ detail: (await dRes.json()) as SrDetail, company });
          } catch {
            /* skip one bad posting */
          }
        }
      } catch (error) {
        console.warn(
          `SmartRecruiters errored: ${company} →`,
          error instanceof Error ? error.message : error,
        );
      }
      await sleep(REQUEST_GAP_MS);
    }
    return { items } satisfies FetchPayload;
  }

  normalize(raw: unknown): NormalizedJob[] {
    const items = (raw as FetchPayload | null)?.items;
    if (!Array.isArray(items)) return [];
    const out: NormalizedJob[] = [];
    for (const { detail, company } of items) {
      if (!detail.id || !detail.name) continue;
      const sec = detail.jobAd?.sections ?? {};
      const html = [sec.jobDescription?.text, sec.qualifications?.text, sec.additionalInformation?.text]
        .filter(Boolean)
        .join("\n");
      const loc = detail.location;
      const locationText =
        loc?.fullLocation ||
        [loc?.city, loc?.region, loc?.country?.toUpperCase()].filter(Boolean).join(", ") ||
        "Unknown";

      out.push({
        source: this.name,
        sourceId: String(detail.id),
        title: detail.name.trim(),
        companyName: detail.company?.name?.trim() || company,
        companyDomain: null,
        companyLogoUrl: null,
        locationText,
        applyUrl:
          detail.applyUrl ||
          detail.postingUrl ||
          `https://jobs.smartrecruiters.com/${company}/${detail.id}`,
        descriptionHtml: cleanHtml(html),
        descriptionText: htmlToPlainText(html),
        postedDate: detail.releasedDate ? new Date(detail.releasedDate) : new Date(),
        closingDate: null,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        salaryPeriod: null,
        jobType: pickJobType(detail.typeOfEmployment?.label),
        workMode: pickWorkMode(loc),
        experienceLevel: "unknown",
        category:
          detail.function?.label?.toLowerCase() ??
          detail.department?.label?.toLowerCase() ??
          "other",
        collarType: "white",
        skills: [],
        benefits: [],
        visaSponsorship: null,
      });
    }
    return out;
  }
}

export const smartRecruiters = new SmartRecruitersSource();
