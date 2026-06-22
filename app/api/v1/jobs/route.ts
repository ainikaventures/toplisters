import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import type { Job } from "@/lib/generated/prisma/client";
import { authenticate } from "@/lib/api/auth";
import { checkRateLimit } from "@/lib/api/ratelimit";
import { resolveCountryCode } from "@/lib/api/country";
import {
  sourceType,
  AGGREGATOR_SOURCES,
  EARTH_RADIUS_MI,
  haversineMi,
} from "@/lib/api/sources";
import {
  locationLabel,
  countryName,
  salaryRangeText,
  charSnippet,
} from "@/lib/format";
import { visaSponsorLabel } from "@/lib/classify/visa";
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

  const csv = (v: string | null) =>
    (v ?? "").split(",").map((t) => t.trim()).filter(Boolean);

  // title_include (preferred) / title — comma-separated, OR-matched.
  const titleTerms = csv(sp.get("title_include") ?? sp.get("title"));
  // title_exclude — comma-separated; drop the job if its title matches ANY.
  const excludeTerms = csv(sp.get("title_exclude"));

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

  // since (preferred) / posted_after — ISO-8601, for incremental scans.
  let postedAfter: Date | null = null;
  const sinceRaw = sp.get("since") ?? sp.get("posted_after");
  if (sinceRaw) {
    const d = new Date(sinceRaw);
    if (Number.isNaN(d.getTime())) {
      return err(400, "since/posted_after must be an ISO-8601 date/datetime", headers);
    }
    postedAfter = d;
  }

  // Geo gate: near=<lat,lng> + radius_mi=<n> — candidate-agnostic, no baked-in origin.
  let near: { lat: number; lng: number } | null = null;
  const nearRaw = sp.get("near")?.trim();
  if (nearRaw) {
    const m = nearRaw.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (!m) return err(400, 'near must be "lat,lng" (e.g. "52.4068,-1.5197")', headers);
    const lat = Number.parseFloat(m[1]);
    const lng = Number.parseFloat(m[2]);
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return err(400, "near lat/lng out of range", headers);
    }
    near = { lat, lng };
  }
  let radiusMi: number | null = null;
  const radiusRaw = sp.get("radius_mi");
  if (radiusRaw) {
    const n = Number.parseFloat(radiusRaw);
    if (!Number.isFinite(n) || n <= 0) {
      return err(400, "radius_mi must be a positive number", headers);
    }
    radiusMi = n;
  }
  if (radiusMi != null && !near) {
    return err(400, "radius_mi requires near=<lat,lng>", headers);
  }

  // Salary floor + optional period.
  let salaryFloor: number | null = null;
  const salaryMinRaw = sp.get("salary_min");
  if (salaryMinRaw) {
    const n = Number.parseInt(salaryMinRaw, 10);
    if (!Number.isFinite(n) || n < 0) {
      return err(400, "salary_min must be a non-negative integer", headers);
    }
    salaryFloor = n;
  }
  let salaryPeriod: string | null = null;
  const periodRaw = sp.get("salary_period")?.trim().toLowerCase();
  if (periodRaw) {
    if (!["hourly", "daily", "monthly", "yearly"].includes(periodRaw)) {
      return err(400, "salary_period must be hourly|daily|monthly|yearly", headers);
    }
    salaryPeriod = periodRaw;
  }

  // Filter by apply-link type: "direct" (employer/ATS) or "aggregator" (wrapper).
  let sourceTypeFilter: "direct" | "aggregator" | null = null;
  const stRaw = sp.get("source_type");
  if (stRaw !== null) {
    if (stRaw === "direct" || stRaw === "aggregator") sourceTypeFilter = stRaw;
    else return err(400, "source_type must be 'direct' or 'aggregator'", headers);
  }

  // Visa sponsorship filter: offered | not_offered | unknown.
  let visaFilter: "offered" | "not_offered" | "unknown" | null = null;
  const visaRaw = sp.get("visa_sponsor");
  if (visaRaw !== null) {
    if (visaRaw === "offered" || visaRaw === "not_offered" || visaRaw === "unknown") {
      visaFilter = visaRaw;
    } else {
      return err(400, "visa_sponsor must be offered|not_offered|unknown", headers);
    }
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
  if (excludeTerms.length) {
    const ors = excludeTerms.map((t) => Prisma.sql`title ILIKE ${"%" + t + "%"}`);
    cond.push(Prisma.sql`NOT (${Prisma.join(ors, " OR ")})`);
  }
  if (location) cond.push(Prisma.sql`location_text ILIKE ${"%" + location + "%"}`);
  if (countryCode) cond.push(Prisma.sql`country_code = ${countryCode}`);
  if (remote === true) cond.push(Prisma.sql`work_mode::text = 'remote'`);
  if (remote === false) cond.push(Prisma.sql`work_mode::text <> 'remote'`);
  if (postedAfter) cond.push(Prisma.sql`posted_date >= ${postedAfter}`);
  if (sourceTypeFilter === "direct") cond.push(Prisma.sql`source <> ALL(${AGGREGATOR_SOURCES})`);
  if (sourceTypeFilter === "aggregator") cond.push(Prisma.sql`source = ANY(${AGGREGATOR_SOURCES})`);
  if (visaFilter === "offered") cond.push(Prisma.sql`visa_sponsorship = true`);
  if (visaFilter === "not_offered") cond.push(Prisma.sql`visa_sponsorship = false`);
  if (visaFilter === "unknown") cond.push(Prisma.sql`visa_sponsorship IS NULL`);
  if (near && radiusMi != null) {
    // Haversine in SQL (no PostGIS dependency). Exclude ungeocoded/null-island rows.
    cond.push(Prisma.sql`(lat <> 0 OR lng <> 0)`);
    cond.push(
      Prisma.sql`${EARTH_RADIUS_MI} * 2 * asin(sqrt(power(sin(radians(lat - ${near.lat}) / 2), 2) + cos(radians(${near.lat})) * cos(radians(lat)) * power(sin(radians(lng - ${near.lng}) / 2), 2))) <= ${radiusMi}`,
    );
  }
  // Salary floor: keep jobs whose known salary clears the floor (unknown-salary
  // rows are excluded when a floor is set). Optionally constrain the period.
  if (salaryFloor != null) {
    cond.push(Prisma.sql`(salary_max >= ${salaryFloor} OR salary_min >= ${salaryFloor})`);
  }
  if (salaryPeriod) cond.push(Prisma.sql`salary_period::text = ${salaryPeriod}`);
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
    const distance_mi =
      near && !(j.lat === 0 && j.lng === 0)
        ? Math.round(haversineMi(near.lat, near.lng, j.lat, j.lng) * 10) / 10
        : null;
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
      // Distance from the `near` origin (miles); null when `near` not given.
      distance_mi,
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
      visa_sponsor: visaSponsorLabel(j.visaSponsorship),
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
