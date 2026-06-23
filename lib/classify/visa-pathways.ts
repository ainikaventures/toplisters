import { normalizedSalaryUsd } from "@/lib/format";

/**
 * Freedom-oriented visa-pathway tagging (Task 9).
 *
 * Most work-visa schemes are COUNTRY-level: if a role is in country X, scheme Y
 * is in principle available. So this is mostly a per-country map plus, where the
 * scheme has one, a salary-threshold check (compared via the Task-7 USD
 * normalisation so it works regardless of the posting's currency) and, for the
 * UK, an employer-licence gate from the Register of Licensed Sponsors (Task 8).
 *
 * "freedom" ranks how untethered the route is from a single employer:
 *   high   — PR / self-sponsored / quickly-portable (Express Entry, 189,
 *            Green Visa, Scale-up). These drive `flexible_visa`.
 *   medium — sponsor-tied but a real settlement pathway (Skilled Worker,
 *            Critical Skills, Blue Card, Opportunity Card).
 *
 * CAVEAT: occupation-eligibility gates (Ireland CSEP list, Australia 189 skilled
 * list, German shortage occupations) are NOT applied — we don't classify
 * occupations yet — so those schemes are tagged country-wide. Country + salary
 * is the reliable part; treat the tag as "scheme available", not "you qualify".
 */

export type VisaFreedom = "high" | "medium";

interface SchemeDef {
  name: string;
  country: string;
  freedom: VisaFreedom;
  /** Short human blurb for the UI badge. */
  blurb: string;
  /** Annual salary floor in the scheme's native currency, if any. */
  threshold?: { amount: number; currency: string };
  /** Employer-licence gate sourced from Task 8. */
  requires?: "licensed_sponsor" | "scaleup_sponsor";
}

const COUNTRY_SCHEMES: Record<string, SchemeDef[]> = {
  GB: [
    {
      name: "Scale-up Worker",
      country: "United Kingdom",
      freedom: "high",
      blurb: "6mo tied, then free",
      requires: "scaleup_sponsor",
    },
    {
      name: "Skilled Worker",
      country: "United Kingdom",
      freedom: "medium",
      blurb: "tied to sponsor",
      threshold: { amount: 38700, currency: "GBP" },
      requires: "licensed_sponsor",
    },
  ],
  IE: [
    {
      name: "Critical Skills Employment Permit",
      country: "Ireland",
      freedom: "medium",
      blurb: "9mo tied, then free; Stamp 4 @21mo",
      threshold: { amount: 38000, currency: "EUR" },
    },
  ],
  CA: [
    {
      name: "Express Entry (FSW)",
      country: "Canada",
      freedom: "high",
      blurb: "PR day one, no employer",
    },
  ],
  AU: [
    {
      name: "Skilled Independent 189",
      country: "Australia",
      freedom: "high",
      blurb: "PR, no sponsor",
    },
  ],
  AE: [
    {
      name: "Green Visa (self-sponsored)",
      country: "United Arab Emirates",
      freedom: "high",
      blurb: "self-sponsored, no tie",
      threshold: { amount: 360000, currency: "AED" }, // ~AED 30k/mo
    },
    {
      name: "Golden Visa",
      country: "United Arab Emirates",
      freedom: "high",
      blurb: "10-yr, self-sponsored, family",
      threshold: { amount: 360000, currency: "AED" }, // skilled-professional route, ~AED 30k/mo
    },
  ],
  DE: [
    {
      name: "EU Blue Card",
      country: "Germany",
      freedom: "medium",
      blurb: "tied; settle 21–33mo",
      threshold: { amount: 48300, currency: "EUR" },
    },
    {
      name: "Opportunity Card",
      country: "Germany",
      freedom: "medium",
      blurb: "enter to job-hunt",
    },
  ],
};

export interface VisaPathway {
  name: string;
  country: string;
  freedom: VisaFreedom;
  blurb: string;
  threshold_met: boolean | null;
}

export interface VisaPathwaysResult {
  pathways: VisaPathway[];
  flexible_visa: boolean;
  schemes: string[];
}

export interface PathwayJobInput {
  countryCode: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  employerLicensedSponsor?: boolean | null;
  sponsorRoutes?: string[];
}

const SCALEUP_ROUTE_RE = /scale[\s-]?up/i;

function thresholdUsd(t: { amount: number; currency: string }): number | null {
  return (
    normalizedSalaryUsd({
      salaryMin: t.amount,
      salaryMax: null,
      salaryCurrency: t.currency,
      salaryPeriod: "yearly",
    })?.min ?? null
  );
}

function jobUsd(j: PathwayJobInput): number | null {
  const n = normalizedSalaryUsd(j);
  if (!n) return null;
  return n.max ?? n.min;
}

export function computeVisaPathways(j: PathwayJobInput): VisaPathwaysResult {
  const schemes = j.countryCode ? COUNTRY_SCHEMES[j.countryCode.toUpperCase()] ?? [] : [];
  const pathways: VisaPathway[] = [];

  for (const s of schemes) {
    if (s.requires === "licensed_sponsor" && j.employerLicensedSponsor !== true) continue;
    if (
      s.requires === "scaleup_sponsor" &&
      !(j.sponsorRoutes ?? []).some((r) => SCALEUP_ROUTE_RE.test(r))
    ) {
      continue;
    }

    let thresholdMet: boolean | null = null;
    if (s.threshold) {
      const tu = thresholdUsd(s.threshold);
      const ju = jobUsd(j);
      thresholdMet = tu != null && ju != null ? ju >= tu : null;
    }

    pathways.push({
      name: s.name,
      country: s.country,
      freedom: s.freedom,
      blurb: s.blurb,
      threshold_met: thresholdMet,
    });
  }

  // High-freedom + not salary-failed ⇒ this role can lead to a flexible visa.
  const flexible = pathways.some((p) => p.freedom === "high" && p.threshold_met !== false);
  return { pathways, flexible_visa: flexible, schemes: pathways.map((p) => p.name) };
}
