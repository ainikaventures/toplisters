import "server-only";
import { prisma } from "@/lib/db";
import { cityToSlug } from "@/lib/locations";
import type { Job } from "@/lib/generated/prisma/client";

const MIN_JOBS_FOR_PAGE = 5; // Spec line 167

export interface SiblingCity {
  name: string;
  slug: string;
  jobCount: number;
}

/**
 * Other cities in the same country that have their own landing page
 * (≥ MIN_JOBS_FOR_PAGE active roles), excluding the current one — TL-091
 * sibling interlinking. Ordered by volume so the busiest siblings lead.
 */
export async function fetchSiblingCities(
  countryCode: string,
  excludeCity: string,
  limit = 12,
): Promise<SiblingCity[]> {
  const groups = await prisma.job.groupBy({
    by: ["city"],
    where: { countryCode, isActive: true, city: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { city: "desc" } },
  });

  return groups
    .filter(
      (g) =>
        g.city && g.city !== excludeCity && g._count._all >= MIN_JOBS_FOR_PAGE,
    )
    .slice(0, limit)
    .map((g) => ({
      name: g.city!,
      slug: cityToSlug(g.city!),
      jobCount: g._count._all,
    }));
}

export interface LocationStats {
  totalJobs: number;
  topCategories: { name: string; count: number }[];
  topCompanies: { name: string; count: number }[];
  salaryMin: number | null;
  salaryMax: number | null;
}

export interface LocationPageData {
  countryCode: string;
  city: string;
  jobs: Job[];
  stats: LocationStats;
}

/**
 * Resolve a (countryCode, citySlug) pair to a canonical city display name
 * by slugifying every city we have on file in that country and matching.
 * Returns null when no DB row matches the slug.
 *
 * Cheap on Phase-1 scale (~50 cities total) and naturally caps the
 * available landing pages to "places we actually have jobs in" without
 * needing a separate sitemap-of-cities table.
 */
export async function resolveCity(countryCode: string, citySlug: string): Promise<string | null> {
  const cities = await prisma.job.findMany({
    where: { countryCode, isActive: true, city: { not: null } },
    select: { city: true },
    distinct: ["city"],
  });

  for (const row of cities) {
    if (row.city && cityToSlug(row.city) === citySlug.toLowerCase()) {
      return row.city;
    }
  }
  return null;
}

export async function fetchLocationPageData(
  countryCode: string,
  city: string,
): Promise<LocationPageData | null> {
  const where = { countryCode, city, isActive: true };

  const [total, jobs, categoryGroups, companyGroups, salaryAgg] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      orderBy: [
        { isFeatured: "desc" },
        { postedDate: "desc" },
      ],
      take: 24,
    }),
    prisma.job.groupBy({
      by: ["category"],
      where,
      _count: { _all: true },
      orderBy: { _count: { category: "desc" } },
      take: 3,
    }),
    prisma.job.groupBy({
      by: ["companyName"],
      where,
      _count: { _all: true },
      orderBy: { _count: { companyName: "desc" } },
      take: 3,
    }),
    prisma.job.aggregate({
      where: { ...where, salaryMin: { not: null } },
      _min: { salaryMin: true },
      _max: { salaryMax: true },
    }),
  ]);

  if (total < MIN_JOBS_FOR_PAGE) return null;

  return {
    countryCode,
    city,
    jobs,
    stats: {
      totalJobs: total,
      topCategories: categoryGroups.map((g) => ({ name: g.category, count: g._count._all })),
      topCompanies: companyGroups.map((g) => ({ name: g.companyName, count: g._count._all })),
      salaryMin: salaryAgg._min.salaryMin ?? null,
      salaryMax: salaryAgg._max.salaryMax ?? null,
    },
  };
}
