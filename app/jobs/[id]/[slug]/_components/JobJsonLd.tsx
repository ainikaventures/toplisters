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
    hiringOrganization: {
      "@type": "Organization",
      name: job.companyName,
      ...(job.companyDomain ? { sameAs: `https://${job.companyDomain}` } : {}),
    },
    directApply: true,
    url: `${siteUrl}/jobs/${job.id}`,
  };

  if (job.closingDate) json.validThrough = job.closingDate.toISOString();
  if (employmentType) json.employmentType = employmentType;

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
