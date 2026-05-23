import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

export const dynamic = "force-dynamic";

/**
 * Public, read-only discovery index for the TailWright product.
 *
 * Exposes ONLY direct-from-employer ATS rows (Greenhouse / Lever / Ashby) —
 * never the licensed aggregator sources (Adzuna / Reed / Jooble / Findwork /
 * The Muse), whose terms forbid commercial reuse and (Adzuna specifically)
 * "vacancy counts". The fields here — company, title, and the apply URL,
 * which for these sources IS the employer's own posting — let TailWright
 * navigate straight to the source and fetch the real job there.
 *
 * See info/COMPLIANCE.md. Cached an hour (data changes slowly); robots.ts
 * already disallows /api/ so this won't be crawled.
 */
const SAFE_SOURCES = ["greenhouse", "lever", "ashby"] as const;

const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 200;

function clampInt(value: string | null, def: number, min: number, max: number): number {
  const n = value ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const view = url.searchParams.get("view") === "companies" ? "companies" : "jobs";
  const country = url.searchParams.get("country");
  const category = url.searchParams.get("category");

  const where: Prisma.JobWhereInput = {
    isActive: true,
    moderationStatus: "approved",
    source: { in: [...SAFE_SOURCES] },
    ...(country && /^[A-Za-z]{2}$/.test(country)
      ? { countryCode: country.toUpperCase() }
      : {}),
    ...(category ? { category } : {}),
  };

  const meta = {
    index: "TailWright discovery index — direct-from-employer ATS only",
    sources: SAFE_SOURCES,
    note: "Greenhouse/Lever/Ashby public board data. Apply URLs point to the employer's own posting.",
  };

  if (view === "companies") {
    const groups = await prisma.job.groupBy({
      by: ["companyName"],
      where,
      _count: { _all: true },
      orderBy: { _count: { companyName: "desc" } },
    });
    const companies = groups.map((g) => ({
      company: g.companyName,
      jobCount: g._count._all,
    }));
    return NextResponse.json(
      { ...meta, total: companies.length, companies },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
    );
  }

  const limit = clampInt(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);

  const [total, jobs] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      select: {
        id: true,
        companyName: true,
        title: true,
        city: true,
        countryCode: true,
        applyUrl: true,
        source: true,
        postedDate: true,
      },
      orderBy: { postedDate: "desc" },
      take: limit,
      skip: offset,
    }),
  ]);

  return NextResponse.json(
    {
      ...meta,
      total,
      limit,
      offset,
      jobs: jobs.map((j) => ({
        id: j.id,
        company: j.companyName,
        title: j.title,
        city: j.city,
        country: j.countryCode,
        applyUrl: j.applyUrl, // direct-to-employer (ATS) posting
        source: j.source,
        postedDate: j.postedDate.toISOString(),
      })),
    },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
  );
}
