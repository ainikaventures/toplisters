import type { Job } from "@/lib/generated/prisma/client";
import { countryName } from "@/lib/format";

const EMPLOYMENT_TYPE: Record<string, string> = {
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
  temp: "TEMPORARY",
  internship: "INTERN",
};

const SALARY_UNIT: Record<string, string> = {
  hourly: "HOUR",
  daily: "DAY",
  monthly: "MONTH",
  yearly: "YEAR",
};

// Conservative months-of-experience mapping. Google's schema validator
// accepts any non-negative integer; the values here are typical floors
// for each level so the rich result doesn't over-promise seniority.
const EXPERIENCE_MONTHS: Record<string, number> = {
  entry: 0,
  mid: 24,
  senior: 60,
  exec: 120,
};

/**
 * JSON-LD JobPosting (schema.org) — required for Google for Jobs eligibility.
 * Only fields we have are emitted; partial data is accepted, missing optional
 * fields are dropped. For remote jobs we also set jobLocationType=TELECOMMUTE
 * and applicantLocationRequirements per Google's remote-jobs guidance.
 */
export function JobJsonLd({ job, siteUrl }: { job: Job; siteUrl: string }) {
  const employmentType = EMPLOYMENT_TYPE[job.jobType] ?? null;
  const salaryUnit = job.salaryPeriod ? SALARY_UNIT[job.salaryPeriod] : null;
  const isRemote = job.workMode === "remote";

  const json: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: job.title,
    description: job.descriptionHtml || job.descriptionText,
    datePosted: job.postedDate.toISOString(),
    // Per Google: stable, source-attributable id. Helps consolidate
    // the same posting if it's also picked up from other indexers.
    identifier: {
      "@type": "PropertyValue",
      name: "Toplisters",
      value: job.id,
    },
    hiringOrganization: {
      "@type": "Organization",
      name: job.companyName,
      ...(job.companyDomain ? { sameAs: `https://${job.companyDomain}` } : {}),
    },
    directApply: true,
    url: `${siteUrl}/job/${job.id}`,
  };

  if (job.closingDate) json.validThrough = job.closingDate.toISOString();
  if (employmentType) json.employmentType = employmentType;

  // Industry — free-text string per schema.org; we send the category as-is.
  // Drops the value when it's our default "other" sentinel.
  if (job.category && job.category !== "other") {
    json.industry = job.category;
  }

  // experienceRequirements drives Google's "entry-level" / "5+ years" SERP
  // chip. Only emitted when we have a non-unknown signal so we don't
  // misrepresent.
  if (job.experienceLevel && job.experienceLevel !== "unknown") {
    const months = EXPERIENCE_MONTHS[job.experienceLevel];
    if (typeof months === "number") {
      json.experienceRequirements = {
        "@type": "OccupationalExperienceRequirements",
        monthsOfExperience: months,
      };
    }
  }

  // Skills — comma-separated string (schema.org accepts plain text or
  // DefinedTerm; the string form is what Google for Jobs documents).
  if (job.skills.length > 0) {
    json.skills = job.skills.join(", ");
  }

  // Location: if remote, declare TELECOMMUTE and use country as applicant
  // requirement. Otherwise emit a postal address.
  if (isRemote) {
    json.jobLocationType = "TELECOMMUTE";
    if (job.countryCode && job.countryCode !== "ZZ") {
      json.applicantLocationRequirements = {
        "@type": "Country",
        name: countryName(job.countryCode),
      };
    }
  } else if (job.countryCode) {
    json.jobLocation = {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        ...(job.city ? { addressLocality: job.city } : {}),
        ...(job.region ? { addressRegion: job.region } : {}),
        addressCountry: job.countryCode,
      },
    };
  }

  if (job.salaryCurrency && (job.salaryMin || job.salaryMax) && salaryUnit) {
    json.baseSalary = {
      "@type": "MonetaryAmount",
      currency: job.salaryCurrency,
      value: {
        "@type": "QuantitativeValue",
        ...(job.salaryMin ? { minValue: job.salaryMin } : {}),
        ...(job.salaryMax ? { maxValue: job.salaryMax } : {}),
        unitText: salaryUnit,
      },
    };
  }

  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}
