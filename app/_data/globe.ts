import "server-only";
import { prisma } from "@/lib/db";

export interface GlobeCluster {
  /** stable key, "<countryCode>:<city||"_">". Used for click-target lookups. */
  id: string;
  lat: number;
  lng: number;
  city: string | null;
  countryCode: string;
  jobCount: number;
}

export interface GlobeJob {
  id: string;
  title: string;
  companyName: string;
  companyLogoUrl: string | null;
  city: string | null;
  countryCode: string;
  postedDate: Date;
  /** Pre-computed slug to skip work on the client. */
  slug: string;
}

export interface GlobeData {
  clusters: GlobeCluster[];
  jobs: GlobeJob[];
}

/**
 * Phase-1 simplification: instead of rendering one marker per job (jobs in
 * the same city would visually stack at the globe's typical zoom anyway),
 * we group by (countryCode, city) and emit one cluster per location with
 * a height proportional to job count. The globe renders these as 3-D bars.
 *
 * For ~5k jobs this is fine. When we cross that, we'll add a true grid
 * cluster step (the existing skipped-no-location path keeps the cluster
 * count further down).
 */
export async function fetchGlobeData(): Promise<GlobeData> {
  const rows = await prisma.job.findMany({
    where: { isActive: true },
    select: {
      id: true,
      title: true,
      companyName: true,
      companyLogoUrl: true,
      city: true,
      countryCode: true,
      lat: true,
      lng: true,
      postedDate: true,
    },
    orderBy: { postedDate: "desc" },
  });

  const groups = new Map<string, { sumLat: number; sumLng: number; count: number; city: string | null; countryCode: string }>();

  for (const r of rows) {
    const key = `${r.countryCode}:${r.city ?? "_"}`;
    const existing = groups.get(key);
    if (existing) {
      existing.sumLat += r.lat;
      existing.sumLng += r.lng;
      existing.count += 1;
    } else {
      groups.set(key, {
        sumLat: r.lat,
        sumLng: r.lng,
        count: 1,
        city: r.city,
        countryCode: r.countryCode,
      });
    }
  }

  const clusters: GlobeCluster[] = Array.from(groups, ([id, g]) => ({
    id,
    lat: g.sumLat / g.count,
    lng: g.sumLng / g.count,
    city: g.city,
    countryCode: g.countryCode,
    jobCount: g.count,
  }));

  const jobs: GlobeJob[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    companyName: r.companyName,
    companyLogoUrl: r.companyLogoUrl,
    city: r.city,
    countryCode: r.countryCode,
    postedDate: r.postedDate,
    slug: slugify(r.title),
  }));

  return { clusters, jobs };
}

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
