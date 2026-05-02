import type { JobSource, NormalizedJob } from "./types";
import { cleanHtml, htmlToPlainText } from "./utils";

const nonEmpty = (s: string | undefined | null) =>
  s && s.trim() ? s.trim() : null;

const ENDPOINT = "https://remoteok.com/api";
const USER_AGENT = "Toplisters/1.0 (+https://toplisters.xyz)";

interface RemoteOKItem {
  legal?: string;
  id?: string | number;
  slug?: string;
  epoch?: number;
  date?: string;
  company?: string;
  company_logo?: string;
  position?: string;
  tags?: string[];
  logo?: string;
  description?: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
  apply_url?: string;
  url?: string;
}

/**
 * RemoteOK aggregates remote-friendly tech jobs and exposes a single JSON
 * endpoint with the entire current feed. The first array element is a legal
 * notice (skipped). All listings are remote, so `workMode` is always remote
 * and `locationText` defaults to "Remote — Worldwide" when the source omits
 * a region.
 *
 * Caveats baked in:
 *  - No company domain in the payload — Logo.dev fallback (initials avatar)
 *    will handle this until we add an enrichment step.
 *  - Salary range is in USD/year by convention; we annotate accordingly only
 *    when at least one bound is present.
 *  - `tags` doubles as our skills list; the first tag becomes the category.
 */
class RemoteOKSource implements JobSource {
  readonly name = "remoteok";
  readonly displayName = "RemoteOK";

  isEnabled(): boolean {
    return process.env.DISABLE_SOURCE_REMOTEOK !== "1";
  }

  async fetch(): Promise<unknown> {
    const response = await fetch(ENDPOINT, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`RemoteOK fetch failed: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  normalize(raw: unknown): NormalizedJob[] {
    if (!Array.isArray(raw)) return [];

    const out: NormalizedJob[] = [];
    for (const item of raw as RemoteOKItem[]) {
      // Skip the legal/metadata header item.
      if (item.legal || !item.id || !item.position || !item.company) continue;

      const sourceId = String(item.id);
      const tags = (item.tags ?? []).map((t) => t.trim()).filter(Boolean);
      const html = item.description ?? "";
      const hasSalary = Boolean(item.salary_min || item.salary_max);

      out.push({
        source: this.name,
        sourceId,
        title: item.position.trim(),
        companyName: item.company.trim(),
        companyDomain: null,
        // RemoteOK has stopped shipping logos in their public API as of mid-2025
        // (their TOS forbids logo redistribution). Empty strings come through
        // as falsy on render so the UI falls back to InitialsAvatar — but
        // we normalise to null here so the column reflects the truth.
        companyLogoUrl: nonEmpty(item.company_logo) ?? nonEmpty(item.logo) ?? null,
        locationText: (item.location ?? "Remote — Worldwide").trim(),
        applyUrl: item.apply_url ?? item.url ?? `https://remoteok.com/remote-jobs/${sourceId}`,
        descriptionHtml: cleanHtml(html),
        descriptionText: htmlToPlainText(html),
        postedDate: item.epoch ? new Date(item.epoch * 1000) : new Date(),
        closingDate: null,
        salaryMin: item.salary_min ?? null,
        salaryMax: item.salary_max ?? null,
        salaryCurrency: hasSalary ? "USD" : null,
        salaryPeriod: hasSalary ? "yearly" : null,
        jobType: "full_time",
        workMode: "remote",
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

export const remoteOK = new RemoteOKSource();
