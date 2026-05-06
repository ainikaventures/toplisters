/**
 * schema.org JobPosting → NormalizedJob mapping.
 *
 * The mapping is deliberately defensive: every field on a JobPosting node
 * is technically optional in schema.org, and real-world sites populate
 * different subsets. We return `null` only when the bare-minimum fields
 * (title, hiring org, source identifier) are missing.
 *
 * Reference: https://schema.org/JobPosting
 */

import type { NormalizedJob } from "../types";
import type { $Enums } from "@/lib/generated/prisma/client";
import type { JsonLdSiteConfig } from "./types";
import { cleanHtml, htmlToPlainText } from "../utils";

interface JobPostingNode {
  title?: unknown;
  description?: unknown;
  datePosted?: unknown;
  validThrough?: unknown;
  url?: unknown;
  identifier?: unknown;
  hiringOrganization?: unknown;
  jobLocation?: unknown;
  jobLocationType?: unknown;
  applicantLocationRequirements?: unknown;
  employmentType?: unknown;
  baseSalary?: unknown;
  occupationalCategory?: unknown;
  industry?: unknown;
  experienceRequirements?: unknown;
}

const EMPLOYMENT_TYPE_MAP: Record<string, $Enums.JobType> = {
  full_time: "full_time",
  full: "full_time",
  fulltime: "full_time",
  part_time: "part_time",
  part: "part_time",
  parttime: "part_time",
  contractor: "contract",
  contract: "contract",
  temporary: "temp",
  temp: "temp",
  intern: "internship",
  internship: "internship",
};

const SALARY_PERIOD_MAP: Record<string, $Enums.SalaryPeriod> = {
  hour: "hourly",
  hourly: "hourly",
  day: "daily",
  daily: "daily",
  week: "monthly", // closest fit; we don't have weekly
  month: "monthly",
  monthly: "monthly",
  year: "yearly",
  yearly: "yearly",
  annual: "yearly",
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Strips niche-board ornaments common in JSON-LD titles. Remotive prefixes
 * "[Hiring] …" and suffixes " @CompanyName"; other boards do similar things.
 * Only the trailing @-suffix is checked against the actual company name to
 * avoid eating legitimate title content (e.g. "Director @ Foo Inc" would
 * stay intact if @Foo doesn't match the company we extracted).
 */
function cleanTitle(rawTitle: string, companyName: string): string {
  let t = rawTitle.trim();
  // "[Hiring] Foo", "[NEW] Foo", "[REMOTE] Foo" → "Foo"
  t = t.replace(/^\[[\w\s-]{1,20}\]\s+/i, "");
  const match = /\s+@\S.*$/.exec(t);
  if (match) {
    const suffix = t.slice(match.index + 1).replace(/^@/, "");
    const norm = (s: string) => s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    if (norm(suffix) && norm(companyName) && norm(suffix) === norm(companyName)) {
      t = t.slice(0, match.index);
    }
  }
  return t.trim();
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickFirst<T>(value: T | T[] | undefined | null): T | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseDate(value: unknown): Date | null {
  const str = asString(value);
  if (!str) return null;
  const date = new Date(str);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractCompany(node: unknown): {
  name: string | null;
  logoUrl: string | null;
  domain: string | null;
} {
  const flat = pickFirst(node as unknown);
  if (typeof flat === "string") {
    return { name: asString(flat), logoUrl: null, domain: null };
  }
  const obj = asObject(flat);
  if (!obj) return { name: null, logoUrl: null, domain: null };
  const name = asString(obj.name);

  // logo: string URL or object {url, "@type": "ImageObject"}
  let logoUrl: string | null = null;
  const logoRaw = obj.logo;
  if (typeof logoRaw === "string") logoUrl = asString(logoRaw);
  else {
    const logoObj = asObject(logoRaw);
    if (logoObj) logoUrl = asString(logoObj.url) ?? asString(logoObj.contentUrl);
  }

  // companyDomain: prefer `url`, then first `sameAs` entry that looks like a homepage.
  let domain: string | null = null;
  const urlVal = asString(obj.url);
  if (urlVal) {
    try {
      domain = new URL(urlVal).hostname.replace(/^www\./, "");
    } catch {
      domain = null;
    }
  }
  if (!domain) {
    const sameAs = obj.sameAs;
    const sameAsList = Array.isArray(sameAs) ? sameAs : sameAs ? [sameAs] : [];
    for (const entry of sameAsList) {
      const s = asString(entry);
      if (!s) continue;
      try {
        const host = new URL(s).hostname.replace(/^www\./, "");
        // Skip social-profile URLs — these aren't the company domain.
        if (/(linkedin|twitter|facebook|github|crunchbase|x\.com)/i.test(host)) continue;
        domain = host;
        break;
      } catch {
        // Skip non-URL entries.
      }
    }
  }

  return { name, logoUrl, domain };
}

function extractCountryCode(addressCountry: unknown): string | null {
  const str = asString(addressCountry);
  if (str) return str.length === 2 ? str.toUpperCase() : str;
  const obj = asObject(addressCountry);
  if (obj) {
    const name = asString(obj.name) ?? asString(obj.identifier);
    if (name) return name.length === 2 ? name.toUpperCase() : name;
  }
  return null;
}

function extractLocationText(
  jobLocation: unknown,
  applicantRequirements: unknown,
  isRemote: boolean,
): string {
  const location = pickFirst(jobLocation);
  const obj = asObject(location);
  if (obj) {
    const address = asObject(obj.address);
    if (address) {
      const parts = [
        asString(address.addressLocality),
        asString(address.addressRegion),
        extractCountryCode(address.addressCountry),
      ].filter((s): s is string => Boolean(s));
      if (parts.length > 0) return parts.join(", ");
    }
    const flatName = asString(obj.name);
    if (flatName) return flatName;
  }

  if (isRemote) {
    const reqs = applicantRequirements as unknown[] | unknown;
    const reqList = Array.isArray(reqs) ? reqs : reqs ? [reqs] : [];
    const country = reqList
      .map((r) => extractCountryCode(asObject(r)?.name))
      .find((s): s is string => Boolean(s));
    return country ? `Remote — ${country}` : "Remote — Worldwide";
  }

  return "Unknown";
}

function pickJobType(employmentType: unknown): $Enums.JobType {
  const values = Array.isArray(employmentType) ? employmentType : [employmentType];
  for (const value of values) {
    const str = asString(value);
    if (!str) continue;
    const key = str.toLowerCase().replace(/[\s-]/g, "_");
    const mapped = EMPLOYMENT_TYPE_MAP[key];
    if (mapped) return mapped;
  }
  return "full_time";
}

function pickExperienceLevel(node: unknown): $Enums.ExperienceLevel {
  const obj = asObject(node);
  if (!obj) return "unknown";
  // Schema.org wraps the actual experience under `occupationalExperience`.
  const exp = asObject(obj.occupationalExperience) ?? obj;
  const months = asNumber(exp.monthsOfExperience);
  if (months !== null) {
    if (months <= 12) return "entry";
    if (months <= 60) return "mid";
    return "senior";
  }
  const description = asString(exp.description) ?? asString(obj.description);
  if (description) {
    const lower = description.toLowerCase();
    if (/(intern|entry|junior|graduate)/.test(lower)) return "entry";
    if (/\bmid\b/.test(lower)) return "mid";
    if (/(senior|sr\.|principal|staff|lead)/.test(lower)) return "senior";
    if (/(director|vp|chief|cxo|c-level|executive)/.test(lower)) return "exec";
  }
  return "unknown";
}

function extractSalary(baseSalary: unknown): {
  min: number | null;
  max: number | null;
  currency: string | null;
  period: $Enums.SalaryPeriod | null;
} {
  const obj = asObject(baseSalary);
  if (!obj) return { min: null, max: null, currency: null, period: null };
  const currency = asString(obj.currency) ?? asString(obj.currencyCode);
  const valueObj = asObject(obj.value);
  let min: number | null = null;
  let max: number | null = null;
  let unitText: string | null = null;
  if (valueObj) {
    min = asNumber(valueObj.minValue);
    max = asNumber(valueObj.maxValue);
    if (min === null && max === null) {
      const single = asNumber(valueObj.value);
      if (single !== null) {
        min = single;
        max = single;
      }
    }
    unitText = asString(valueObj.unitText);
  } else {
    const single = asNumber(obj.value);
    if (single !== null) {
      min = single;
      max = single;
    }
  }
  // Some sites store salary at the top level instead of under .value.
  if (min === null && max === null) {
    min = asNumber(obj.minValue);
    max = asNumber(obj.maxValue);
  }
  if (!unitText) unitText = asString(obj.unitText);
  // Reject placeholder zero salaries (e.g., Remotive emits {value:0, unitText:"YEAR"}
  // when a posting has no salary) — keeps the listing salary-free instead of
  // implying $0.
  if (min === 0 && max === 0) {
    min = null;
    max = null;
  }
  const period =
    unitText && SALARY_PERIOD_MAP[unitText.toLowerCase()]
      ? SALARY_PERIOD_MAP[unitText.toLowerCase()]
      : null;
  const hasSalary = min !== null || max !== null;
  return {
    min,
    max,
    currency: hasSalary ? (currency ?? null) : null,
    period: hasSalary ? period : null,
  };
}

function extractIdentifier(value: unknown): string | null {
  const str = asString(value);
  if (str) return str;
  const obj = asObject(value);
  if (obj) return asString(obj.value) ?? asString(obj.identifier);
  return null;
}

function deriveSourceId(jobPosting: JobPostingNode, pageUrl: string): string {
  const explicit = extractIdentifier(jobPosting.identifier);
  if (explicit) return explicit;
  // Fall back to the URL pathname so re-runs upsert the same row.
  try {
    const url = new URL(asString(jobPosting.url) ?? pageUrl);
    return (url.pathname + url.search).slice(0, 500);
  } catch {
    return pageUrl;
  }
}

export function normalizeJobPosting(
  raw: unknown,
  pageUrl: string,
  config: JsonLdSiteConfig,
): NormalizedJob | null {
  const node = asObject(raw) as JobPostingNode | null;
  if (!node) return null;
  const title = asString(node.title);
  const company = extractCompany(node.hiringOrganization);
  if (!title || !company.name) return null;

  const sourceId = deriveSourceId(node, pageUrl);
  const html = asString(node.description) ?? "";

  const jobLocationType = asString(node.jobLocationType);
  const isRemote =
    jobLocationType === "TELECOMMUTE" ||
    Boolean(node.applicantLocationRequirements);

  const locationText = extractLocationText(
    node.jobLocation,
    node.applicantLocationRequirements,
    isRemote,
  );

  const jobType = pickJobType(node.employmentType);
  // Treat "INTERN" employmentType as internship even if level metadata is absent.
  const isInternship = jobType === "internship";

  const salary = extractSalary(node.baseSalary);

  const category =
    asString(node.occupationalCategory)?.toLowerCase() ??
    asString(node.industry)?.toLowerCase() ??
    config.defaultCategory ??
    "other";

  return {
    source: config.name,
    sourceId,
    title: cleanTitle(title, company.name),
    companyName: company.name,
    companyDomain: company.domain,
    companyLogoUrl: company.logoUrl,
    locationText,
    applyUrl: asString(node.url) ?? pageUrl,
    descriptionHtml: cleanHtml(html),
    descriptionText: htmlToPlainText(html),
    postedDate: parseDate(node.datePosted) ?? new Date(),
    closingDate: parseDate(node.validThrough),
    salaryMin: salary.min !== null ? Math.round(salary.min) : null,
    salaryMax: salary.max !== null ? Math.round(salary.max) : null,
    salaryCurrency: salary.currency,
    salaryPeriod: salary.period,
    jobType,
    workMode: isRemote ? "remote" : "onsite",
    experienceLevel: isInternship ? "entry" : pickExperienceLevel(node.experienceRequirements),
    category,
    collarType: config.collarType ?? "unknown",
    skills: [],
    benefits: [],
    visaSponsorship: null,
  };
}
