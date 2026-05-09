import "server-only";
import { prisma } from "@/lib/db";
import { cityToSlug } from "@/lib/locations";
import type { Job } from "@/lib/generated/prisma/client";

const MIN_JOBS_PER_CITY = 5; // Same threshold as the city pages
const COUNTRY_JOB_PREVIEW = 24;

export interface CountryCity {
  name: string;
  slug: string;
  jobCount: number;
}

export interface CountryPageData {
  countryCode: string;
  totalJobs: number;
  cities: CountryCity[];
  jobs: Job[];
}

/**
 * Country landing page data: the city directory + a preview job grid.
 *
 * Cities are filtered to ≥5 jobs (matches the city-page threshold so the
 * index never links to a page that 404s). The job grid covers the whole
 * country including country-centroid (city=null) rows — without it, a
 * country whose jobs are spread thin across many small cities would
 * render "X jobs across 0 cities" with no actual postings on the page.
 * Pagination beyond the preview lives at /jobs?country=XX, which the
 * "View all" CTA on the page links to.
 */
export async function fetchCountryPageData(
  countryCode: string,
): Promise<CountryPageData | null> {
  const [groups, totalJobs, jobs] = await Promise.all([
    prisma.job.groupBy({
      by: ["city"],
      where: { countryCode, isActive: true, city: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { city: "desc" } },
    }),
    prisma.job.count({
      where: { countryCode, isActive: true },
    }),
    prisma.job.findMany({
      where: { countryCode, isActive: true },
      orderBy: [
        { isFeatured: "desc" },
        { postedDate: "desc" },
      ],
      take: COUNTRY_JOB_PREVIEW,
    }),
  ]);

  if (totalJobs === 0) return null;

  const cities = groups
    .filter((g) => g.city && g._count._all >= MIN_JOBS_PER_CITY)
    .map((g) => ({
      name: g.city!,
      slug: cityToSlug(g.city!),
      jobCount: g._count._all,
    }));

  return { countryCode, totalJobs, cities, jobs };
}
