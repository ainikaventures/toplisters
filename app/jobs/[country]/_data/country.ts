import "server-only";
import { prisma } from "@/lib/db";
import { cityToSlug } from "@/lib/locations";

const MIN_JOBS_PER_CITY = 5; // Same threshold as the city pages

export interface CountryCity {
  name: string;
  slug: string;
  jobCount: number;
}

export interface CountryPageData {
  countryCode: string;
  totalJobs: number;
  cities: CountryCity[];
}

/**
 * Country index: every city we have a landing page for, ordered by job
 * volume. Same ≥5-jobs threshold as the city pages so the index never
 * links to something that 404s. Total counts include jobs without a
 * resolved city (country-centroid fallback rows).
 */
export async function fetchCountryPageData(
  countryCode: string,
): Promise<CountryPageData | null> {
  const groups = await prisma.job.groupBy({
    by: ["city"],
    where: { countryCode, isActive: true, city: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { city: "desc" } },
  });

  const cities = groups
    .filter((g) => g.city && g._count._all >= MIN_JOBS_PER_CITY)
    .map((g) => ({
      name: g.city!,
      slug: cityToSlug(g.city!),
      jobCount: g._count._all,
    }));

  const totalJobs = await prisma.job.count({
    where: { countryCode, isActive: true },
  });

  if (totalJobs === 0) return null;

  return { countryCode, totalJobs, cities };
}
