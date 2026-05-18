import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slug";

export const dynamic = "force-dynamic";

const MAX_JOBS_PER_CLUSTER = 50;

export interface ClusterJob {
  id: string;
  title: string;
  companyName: string;
  companyLogoUrl: string | null;
  city: string | null;
  countryCode: string;
  postedDate: string;
  slug: string;
}

/**
 * Lazy-load endpoint for the home-page globe. On marker click, the client
 * fetches /api/globe/cluster?country=GB&city=London to populate the slide-in
 * panel. Limited to MAX_JOBS_PER_CLUSTER rows so a click on a busy bar
 * (London, Bangalore, NYC) doesn't ship megabytes of payload.
 *
 * city="" is the no-city / country-only bucket (matches the cluster id's
 * "_" sentinel in the server data layer).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const country = url.searchParams.get("country")?.trim();
  const cityParam = url.searchParams.get("city")?.trim() ?? "";
  if (!country) {
    return NextResponse.json({ error: "country required" }, { status: 400 });
  }

  const rows = await prisma.job.findMany({
    where: {
      isActive: true,
      countryCode: country,
      city: cityParam ? cityParam : null,
    },
    select: {
      id: true,
      title: true,
      companyName: true,
      companyLogoUrl: true,
      city: true,
      countryCode: true,
      postedDate: true,
    },
    orderBy: { postedDate: "desc" },
    take: MAX_JOBS_PER_CLUSTER,
  });

  const jobs: ClusterJob[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    companyName: r.companyName,
    companyLogoUrl: r.companyLogoUrl,
    city: r.city,
    countryCode: r.countryCode,
    postedDate: r.postedDate.toISOString(),
    slug: slugify(r.title),
  }));

  return NextResponse.json(
    { jobs },
    {
      headers: {
        // Cluster contents drift as jobs come/go, but a 60s cache stops
        // a hot marker (e.g. London) from hammering the DB on rapid clicks.
        "Cache-Control": "public, max-age=60, s-maxage=60",
      },
    },
  );
}
