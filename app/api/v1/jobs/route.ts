import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import type { Job } from "@/lib/generated/prisma/client";
import { authenticate } from "@/lib/api/auth";
import { checkRateLimit } from "@/lib/api/ratelimit";
import { resolveCountryCode } from "@/lib/api/country";
import {
  sourceType,
  distanceFromCv1Mi,
  AGGREGATOR_SOURCES,
  CV1,
  EARTH_RADIUS_MI,
} from "@/lib/api/sources";
import {
  locationLabel,
  countryName,
  salaryRangeText,
  charSnippet,
} from "@/lib/format";
import { slugify } from "@/lib/slug";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://toplisters.xyz";

const DEFAULT_PER_PAGE = 100;
const MAX_PER_PAGE = 200;

/**
 * Read-only JSON search API for an external scanner (server-to-server).
 *
 *   GET /api/v1/jobs
 *   Authorization: Bearer <key>      (or)   x-api-key: <key>
 *
 * Params (all optional, AND-combined): q, title (CSV, OR-matched), location,
 * country (name or ISO-2), remote (true|false), posted_after (ISO-8601),
 * page (1-based), per_page (<=200).
 *
 * Source scope: this is the OWNER's personal-use scanner (key-gated,
 * single consumer), so all active sources are returned and each row carries
 * its `source`. If this endpoint is ever made public or the key shared,
 * scope SOURCE_ALLOWLIST to redistributable sources per info/COMPLIANCE.md
 * (licensed aggregators forbid commercial redistribution).
 */
const SOURCE_ALLOWLIST: string[] | null = null;

function err(status: number, message: string, headers?: HeadersInit) {
  return NextResponse.json({ error: message }, { status, headers });
}

function rateHeaders(r: {
  limit: number;
  remaining: number;
  reset: number;
}): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(r.limit),
    "X-RateLimit-Remaining": String(r.remaining),
    "X-RateLimit-Reset": String(r.reset),
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  // ── Auth ──
  const auth = await authenticate(request);
  if (!auth) {
    return err(401, "Invalid or missing API key", {
      "WWW-Authenticate": "Bearer",
      "Access-Control-Allow-Origin": "*",
    });
  }

  // ── Rate limit ──
  const rl = await checkRateLimit(auth.keyId);
  if (rl.limited) {
    return err(429, "Rate limit exceeded", {
      ...rateHeaders(rl),
      "Retry-After": String(Math.max(1, rl.reset - Math.floor(Date.now() / 1000))),
    });
  }
  const headers = rateHeaders(rl);

  // ── Parse + validate params ──
  const sp = new URL(request.url).searchParams;

  const q = sp.get("q")?.trim() || null;

  const titleTerms = (sp.get("title") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const location = sp.get("location")?.trim() || null;

  let countryCode: string | null = null;
  const countryRaw = sp.get("country")?.trim();
  if (countryRaw) {
    countryCode = resolveCountryCode(countryRaw);
    if (!countryCode) return err(400, `Unrecognized country: "${countryRaw}"`, headers);
  }

  let remote: boolean | null = null;
  const remoteRaw = sp.get("remote");
  if (remoteRaw !== null) {
    if (remoteRaw === "true") remote = true;
    else if (remoteRaw === "false") remote = false;
    else return err(400, "remote must be 'true' or 'false'", headers);
  }

  let postedAfter: Date | null = null;
  const postedAfterRaw = sp.get("posted_after");
  if (postedAfterRaw) {
    const d = new Date(postedAfterRaw);
    if (Number.isNaN(d.getTime())) {
      return err(400, "posted_after must be an ISO-8601 date/datetime", headers);
    }
    postedAfter = d;
  }

  // Commute gate: only jobs within N miles of CV1 (Coventry).
  let maxDistanceMi: number | null = null;
  const maxDistRaw = sp.get("max_distance_mi");
  if (maxDistRaw) {
    const n = Number.parseFloat(maxDistRaw);
    if (!Number.isFinite(n) || n <= 0) {
      return err(400, "max_distance_mi must be a positive number", headers);
    }
    maxDistanceMi = n;
  }

  // Filter by apply-link type: "direct" (employer/ATS) or "aggregator" (wrapper).
  let sourceTypeFilter: "direct" | "aggregator" | null = null;
  const stRaw = sp.get("source_type");
  if (stRaw !== null) {
    if (stRaw === "direct" || stRaw === "aggregator") sourceTypeFilter = stRaw;
    else return err(400, "source_type must be 'direct' or 'aggregator'", headers);
  }

  const page = Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1);
  const perPageRaw = Number.parseInt(sp.get("per_page") ?? "", 10);
  const perPage = Math.min(
    MAX_PER_PAGE,
    Math.max(1, Number.isFinite(perPageRaw) ? perPageRaw : DEFAULT_PER_PAGE),
  );

  // ── Build WHERE (parameterised raw SQL — combines FTS + filters) ──
  const cond: Prisma.Sql[] = [
    Prisma.sql`is_active = true`,
    Prisma.sql`moderation_status = 'approved'`,
  ];
  if (SOURCE_ALLOWLIST) cond.push(Prisma.sql`source = ANY(${SOURCE_ALLOWLIST})`);
  if (q) cond.push(Prisma.sql`search_vector @@ plainto_tsquery('english', ${q})`);
  if (titleTerms.length) {
    const ors = titleTerms.map((t) => Prisma.sql`title ILIKE ${"%" + t + "%"}`);
    cond.push(Prisma.sql`(${Prisma.join(ors, " OR ")})`);
  }
  if (location) cond.push(Prisma.sql`location_text ILIKE ${"%" + location + "%"}`);
  if (countryCode) cond.push(Prisma.sql`country_code = ${countryCode}`);
  if (remote === true) cond.push(Prisma.sql`work_mode::text = 'remote'`);
  if (remote === false) cond.push(Prisma.sql`work_mode::text <> 'remote'`);
  if (postedAfter) cond.push(Prisma.sql`posted_date >= ${postedAfter}`);
  if (sourceTypeFilter === "direct") cond.push(Prisma.sql`source <> ALL(${AGGREGATOR_SOURCES})`);
  if (sourceTypeFilter === "aggregator") cond.push(Prisma.sql`source = ANY(${AGGREGATOR_SOURCES})`);
  if (maxDistanceMi != null) {
    // Haversine in SQL (no PostGIS dependency). Exclude ungeocoded/null-island rows.
    cond.push(Prisma.sql`(lat <> 0 OR lng <> 0)`);
    cond.push(
      Prisma.sql`${EARTH_RADIUS_MI} * 2 * asin(sqrt(power(sin(radians(lat - ${CV1.lat}) / 2), 2) + cos(radians(${CV1.lat})) * cos(radians(lat)) * power(sin(radians(lng - ${CV1.lng}) / 2), 2))) <= ${maxDistanceMi}`,
    );
  }
  const whereSql = Prisma.join(cond, " AND ");

  // ── Count + page of ids, then materialise typed rows in order ──
  const totalRows = await prisma.$queryRaw<{ count: bigint }[]>(
    Prisma.sql`SELECT COUNT(*)::bigint AS count FROM jobs WHERE ${whereSql}`,
  );
  const total = Number(totalRows[0]?.count ?? 0);

  const idRows = await prisma.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT id FROM jobs WHERE ${whereSql}
      ORDER BY posted_date DESC
      LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`,
  );
  const ids = idRows.map((r) => r.id);

  let jobs: Job[] = [];
  if (ids.length) {
    const unordered = await prisma.job.findMany({ where: { id: { in: ids } } });
    const order = new Map(ids.map((id, i) => [id, i]));
    jobs = unordered.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  const items = jobs.map((j) => {
    const st = sourceType(j.source);
    const hasSalary = j.salaryMin != null || j.salaryMax != null;
    return {
      id: j.id,
      title: j.title,
      company: j.companyName,
      location: locationLabel({ city: j.city, countryCode: j.countryCode }),
      // Structured location so the commute gate / mapping is enforceable.
      location_structured: {
        city: j.city,
        region: j.region,
        country: countryName(j.countryCode),
        country_code: j.countryCode,
        lat: j.lat,
        lng: j.lng,
      },
      distance_from_cv1_mi: distanceFromCv1Mi(j.lat, j.lng),
      country: countryName(j.countryCode),
      remote: j.workMode === "remote",
      // The toplisters post page — always present.
      url: `${SITE_URL}/job/${j.id}/${slugify(j.title)}`,
      // The apply link as ingested (the wrapper for aggregator sources).
      apply_url: j.applyUrl ?? null,
      // The DIRECT employer/source apply link — present for direct sources
      // (ATS, Recruitment Revolution, open feeds); null for aggregator
      // wrappers (their APIs don't return the employer URL).
      apply_url_direct: st === "direct" ? (j.applyUrl ?? null) : null,
      source: j.source,
      source_type: st,
      posted_at: j.postedDate ? j.postedDate.toISOString() : null,
      // Structured salary {min,max,currency,period} + a human display string.
      salary: hasSalary
        ? {
            min: j.salaryMin,
            max: j.salaryMax,
            currency: j.salaryCurrency,
            period: j.salaryPeriod,
          }
        : null,
      salary_display: salaryRangeText(j),
      // Full post body (text + HTML) so the consumer can extract deeper links.
      description: j.descriptionText ?? null,
      description_html: j.descriptionHtml ?? null,
      description_snippet: charSnippet(j.descriptionText, 300),
    };
  });

  return NextResponse.json(
    {
      total,
      page,
      per_page: perPage,
      count: items.length,
      jobs: items,
      next_cursor: null,
    },
    { headers },
  );
}
