import "server-only";
import { prisma } from "@/lib/db";
import { cityToSlug } from "@/lib/locations";

const MIN_JOBS_FOR_CITY_PAGE = 5; // Same threshold the city page itself enforces

export interface CountrySummary {
  countryCode: string;
  totalJobs: number;
  cities: { name: string; slug: string; jobCount: number }[];
}

/**
 * Build the data backing the /jobs/locations directory: every country with
 * any active jobs, with the top 5 cities (≥5 active roles each) inline so
 * users can jump straight to a city without bouncing through the country
 * index. Any country whose only rows are country-centroid (city=null) shows
 * up but has an empty `cities` array.
 */
export async function fetchLocationsDirectory(): Promise<CountrySummary[]> {
  const [countryGroups, cityGroups] = await Promise.all([
    prisma.job.groupBy({
      by: ["countryCode"],
      where: { isActive: true },
      _count: { _all: true },
      orderBy: { _count: { countryCode: "desc" } },
    }),
    prisma.job.groupBy({
      by: ["countryCode", "city"],
      where: { isActive: true, city: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const citiesByCountry = new Map<string, { name: string; slug: string; jobCount: number }[]>();
  for (const g of cityGroups) {
    if (!g.city || g._count._all < MIN_JOBS_FOR_CITY_PAGE) continue;
    const list = citiesByCountry.get(g.countryCode) ?? [];
    list.push({
      name: g.city,
      slug: cityToSlug(g.city),
      jobCount: g._count._all,
    });
    citiesByCountry.set(g.countryCode, list);
  }
  // Order each country's cities by job count desc, cap at 5 inline.
  for (const list of citiesByCountry.values()) {
    list.sort((a, b) => b.jobCount - a.jobCount);
    list.splice(5);
  }

  return countryGroups
    .filter((c) => c.countryCode && c.countryCode !== "ZZ")
    .map((c) => ({
      countryCode: c.countryCode,
      totalJobs: c._count._all,
      cities: citiesByCountry.get(c.countryCode) ?? [],
    }));
}
