import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { JOBS_PER_SHARD } from "../sitemap";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Sitemap index. Crawlers (Google, Bing) fetch /sitemap.xml first and
 * follow the listed shards. Each shard at /sitemap/<id>.xml is generated
 * by app/sitemap.ts via generateSitemaps(); we match the same shard-count
 * calculation here so the index stays in sync.
 *
 * Cache window matches the shard route (revalidate = 3600). When the job
 * count crosses a shard boundary, this index may be stale by up to an
 * hour — acceptable for a daily-crawled file.
 */
export async function GET() {
  const count = await prisma.job.count({ where: { isActive: true } });
  const jobShards = Math.max(1, Math.ceil(count / JOBS_PER_SHARD));
  const totalShards = jobShards + 1; // +1 for the meta shard
  const lastmod = new Date().toISOString();

  const entries = Array.from({ length: totalShards }, (_, i) =>
    `  <sitemap><loc>${SITE_URL}/sitemap/${i}.xml</loc><lastmod>${lastmod}</lastmod></sitemap>`,
  ).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
