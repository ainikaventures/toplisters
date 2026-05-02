import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { cityToSlug, countryToSlug } from "@/lib/locations";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const MIN_JOBS_PER_CITY = 5; // Same threshold as the city landing page itself

/**
 * Composite sitemap. Static pages first (highest priority), then every
 * active job detail (one URL each), country index pages, and city landing
 * pages. The query budget is intentionally tiny — three findMany/groupBy
 * calls in parallel — so this still works at Phase-2 scale (~5–10k jobs).
 *
 * For >50k URLs we'd need to split into a sitemap index + per-shard files.
 * Defer until traffic justifies it.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const [jobs, citiesByCountry, countriesWithJobs] = await Promise.all([
    prisma.job.findMany({
      where: { isActive: true },
      select: { id: true, title: true, updatedAt: true },
      orderBy: { postedDate: "desc" },
    }),
    prisma.job.groupBy({
      by: ["countryCode", "city"],
      where: { isActive: true, city: { not: null } },
      _count: { _all: true },
    }),
    prisma.job.groupBy({
      by: ["countryCode"],
      where: { isActive: true },
      _count: { _all: true },
    }),
  ]);

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/jobs`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
  ];

  const jobEntries: MetadataRoute.Sitemap = jobs.map((j) => ({
    url: `${SITE_URL}/job/${j.id}/${slugify(j.title)}`,
    lastModified: j.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const countryEntries: MetadataRoute.Sitemap = countriesWithJobs
    .filter((c) => c.countryCode && c.countryCode !== "ZZ")
    .map((c) => ({
      url: `${SITE_URL}/jobs/${countryToSlug(c.countryCode)}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.6,
    }));

  const cityEntries: MetadataRoute.Sitemap = citiesByCountry
    .filter((c) => c.city && c._count._all >= MIN_JOBS_PER_CITY)
    .map((c) => ({
      url: `${SITE_URL}/jobs/${countryToSlug(c.countryCode)}/${cityToSlug(c.city!)}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.65,
    }));

  return [...staticEntries, ...countryEntries, ...cityEntries, ...jobEntries];
}
