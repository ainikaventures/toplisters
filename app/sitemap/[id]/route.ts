import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { cityToSlug, countryToSlug } from "@/lib/locations";
import { JOBS_PER_SHARD } from "@/lib/sitemap";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const MIN_JOBS_PER_CITY = 5;

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === "<" ? "&lt;" :
    c === ">" ? "&gt;" :
    c === "&" ? "&amp;" :
    c === "'" ? "&apos;" :
    "&quot;",
  );
}

function renderSitemap(urls: SitemapUrl[]): string {
  const body = urls
    .map((u) => {
      const parts = [`<loc>${escapeXml(u.loc)}</loc>`];
      if (u.lastmod) parts.push(`<lastmod>${u.lastmod}</lastmod>`);
      if (u.changefreq) parts.push(`<changefreq>${u.changefreq}</changefreq>`);
      if (u.priority !== undefined) parts.push(`<priority>${u.priority}</priority>`);
      return `  <url>${parts.join("")}</url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;
}

async function metaShard(): Promise<SitemapUrl[]> {
  const now = new Date().toISOString();

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

  const staticEntries: SitemapUrl[] = [
    { loc: `${SITE_URL}/`, lastmod: now, changefreq: "daily", priority: 1.0 },
    { loc: `${SITE_URL}/jobs`, lastmod: now, changefreq: "daily", priority: 0.9 },
    { loc: `${SITE_URL}/globe`, lastmod: now, changefreq: "daily", priority: 0.7 },
    { loc: `${SITE_URL}/about`, lastmod: now, changefreq: "yearly", priority: 0.4 },
    { loc: `${SITE_URL}/privacy`, lastmod: now, changefreq: "yearly", priority: 0.3 },
  ];

  const countryEntries: SitemapUrl[] = countriesWithJobs
    .filter((c) => c.countryCode && c.countryCode !== "ZZ")
    .map((c) => ({
      loc: `${SITE_URL}/jobs/${countryToSlug(c.countryCode)}`,
      lastmod: now,
      changefreq: "daily",
      priority: 0.6,
    }));

  const cityEntries: SitemapUrl[] = citiesByCountry
    .filter((c) => c.city && c._count._all >= MIN_JOBS_PER_CITY)
    .map((c) => ({
      loc: `${SITE_URL}/jobs/${countryToSlug(c.countryCode)}/${cityToSlug(c.city!)}`,
      lastmod: now,
      changefreq: "daily",
      priority: 0.65,
    }));

  return [...staticEntries, ...countryEntries, ...cityEntries];
}

async function jobShard(shardIdx: number): Promise<SitemapUrl[]> {
  const jobs = await prisma.job.findMany({
    where: { isActive: true },
    select: { id: true, title: true, updatedAt: true },
    orderBy: { postedDate: "desc" },
    skip: shardIdx * JOBS_PER_SHARD,
    take: JOBS_PER_SHARD,
  });

  return jobs.map((j) => ({
    loc: `${SITE_URL}/job/${j.id}/${slugify(j.title)}`,
    lastmod: j.updatedAt.toISOString(),
    changefreq: "weekly",
    priority: 0.7,
  }));
}

/**
 * Per-shard sitemap. id=0 → static + country + city pages; id=1..N → jobs
 * paginated by postedDate desc, JOBS_PER_SHARD per shard.
 *
 * Route handlers run only at request time, so DB unreachable during
 * `docker build` is fine — that's the bug that bit the earlier
 * `app/sitemap.ts` (metadata file) version.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: rawId } = await params;
  const id = Number.parseInt(rawId, 10);
  if (!Number.isFinite(id) || id < 0) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const urls = id === 0 ? await metaShard() : await jobShard(id - 1);
  // Empty shards are still valid XML — keep responding 200 so a crawler
  // that picks up a stale index entry doesn't see broken links.
  return new NextResponse(renderSitemap(urls), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
