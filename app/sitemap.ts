import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { cityToSlug, countryToSlug } from "@/lib/locations";

// Render on demand, not at build time — DB isn't reachable during `docker build`.
// revalidate = 3600 lets Next cache the result for an hour so crawlers don't
// hammer Postgres.
export const dynamic = "force-dynamic";
export const revalidate = 3600;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const MIN_JOBS_PER_CITY = 5; // Same threshold as the city landing page itself
// Google's per-sitemap limit is 50k URLs + 50MB. 40k jobs per shard keeps
// us under both with margin for stretchy descriptions / future URL growth.
export const JOBS_PER_SHARD = 40000;

/**
 * Multi-file sitemap. Shard 0 carries the static + country + city
 * landing pages (a few hundred URLs total). Shards 1..N each carry
 * up to JOBS_PER_SHARD job-detail URLs, paginated by postedDate desc
 * so the freshest jobs cluster in the highest-numbered shards' bottom
 * and the lowest-numbered shards' top.
 *
 * Next.js metadata-file behaviour:
 *   - exporting generateSitemaps produces routes at /sitemap/<id>.xml
 *   - a sitemap *index* listing all shards lives at /sitemap.xml,
 *     served by app/sitemap.xml/route.ts
 */
export async function generateSitemaps(): Promise<{ id: number }[]> {
  const count = await prisma.job.count({ where: { isActive: true } });
  const jobShards = Math.max(1, Math.ceil(count / JOBS_PER_SHARD));
  // +1 for shard 0 (static + country + city)
  return Array.from({ length: jobShards + 1 }, (_, i) => ({ id: i }));
}

export default async function sitemap({
  id,
}: {
  id: number;
}): Promise<MetadataRoute.Sitemap> {
  if (id === 0) return metaShard();
  return jobShard(id - 1);
}

async function metaShard(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const [citiesByCountry, countriesWithJobs] = await Promise.all([
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
    {
      url: `${SITE_URL}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

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

  return [...staticEntries, ...countryEntries, ...cityEntries];
}

async function jobShard(shardIdx: number): Promise<MetadataRoute.Sitemap> {
  const jobs = await prisma.job.findMany({
    where: { isActive: true },
    select: { id: true, title: true, updatedAt: true },
    orderBy: { postedDate: "desc" },
    skip: shardIdx * JOBS_PER_SHARD,
    take: JOBS_PER_SHARD,
  });

  return jobs.map((j) => ({
    url: `${SITE_URL}/job/${j.id}/${slugify(j.title)}`,
    lastModified: j.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));
}
