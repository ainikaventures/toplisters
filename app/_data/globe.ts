import "server-only";
import { prisma } from "@/lib/db";

export interface GlobeCluster {
  /** stable key, "<countryCode>:<city||"_">". Doubles as the API query key. */
  id: string;
  lat: number;
  lng: number;
  city: string | null;
  countryCode: string;
  jobCount: number;
}

export interface GlobeData {
  clusters: GlobeCluster[];
  totalJobs: number;
}

/**
 * Returns one cluster per (country, city) — bar height ∝ job count on the
 * globe. Cluster centroids are computed in Postgres via groupBy+_avg, so
 * we ship ~5k clusters of ~80 bytes each (≈400 KB) instead of the
 * previous all-jobs payload (~32 MB at current scale).
 *
 * Jobs for a clicked cluster are fetched on demand from
 * /api/globe/cluster — see app/api/globe/cluster/route.ts.
 */
export async function fetchGlobeData(): Promise<GlobeData> {
  const groups = await prisma.job.groupBy({
    by: ["countryCode", "city"],
    where: { isActive: true },
    _count: { _all: true },
    _avg: { lat: true, lng: true },
  });

  let totalJobs = 0;
  const clusters: GlobeCluster[] = [];
  for (const g of groups) {
    if (g._avg.lat === null || g._avg.lng === null) continue;
    totalJobs += g._count._all;
    clusters.push({
      id: `${g.countryCode}:${g.city ?? "_"}`,
      lat: g._avg.lat,
      lng: g._avg.lng,
      city: g.city,
      countryCode: g.countryCode,
      jobCount: g._count._all,
    });
  }
  return { clusters, totalJobs };
}
