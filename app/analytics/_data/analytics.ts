import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";

export interface AnalyticsFilters {
  /** ISO-2 country, or null for global */
  country: string | null;
  /** Window length, in days, ending now. Use Number.POSITIVE_INFINITY for "all time". */
  days: number;
}

export interface AnalyticsCounts {
  totalActive: number;
  filteredActive: number;
  uniqueCompanies: number;
  uniqueCities: number;
}

export interface AnalyticsBuckets {
  countries: { code: string; count: number }[];
  categories: { name: string; count: number }[];
  topCompanies: { name: string; count: number }[];
  topSkills: { name: string; count: number }[];
}

export interface AnalyticsTrendPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface AnalyticsData {
  counts: AnalyticsCounts;
  buckets: AnalyticsBuckets;
  trend: AnalyticsTrendPoint[];
  /** distinct ISO-2 codes available in `country` filter, ordered by activity */
  availableCountries: string[];
}

/** Start of the window, or null for "all time". */
function sinceOf(days: number): Date | null {
  if (!Number.isFinite(days)) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** Build the Prisma where clause shared by every aggregation. */
function whereOf(filters: AnalyticsFilters): Prisma.JobWhereInput {
  const where: Prisma.JobWhereInput = { isActive: true };
  if (filters.country) where.countryCode = filters.country;
  const since = sinceOf(filters.days);
  if (since) where.postedDate = { gte: since };
  return where;
}

/** The same predicates as `whereOf`, for the hand-written aggregates. */
function rawWhere(filters: AnalyticsFilters): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (filters.country) {
    parts.push(Prisma.sql`AND country_code = ${filters.country}`);
  }
  const since = sinceOf(filters.days);
  if (since) parts.push(Prisma.sql`AND posted_date >= ${since}`);
  return parts.length > 0 ? Prisma.join(parts, " ") : Prisma.empty;
}

/**
 * Fill in missing days with zero counts so the line chart doesn't jump
 * over gaps. Returns an array sorted oldest→newest, length = window days.
 */
function fillTrend(
  rows: { day: Date; count: bigint | number }[],
  windowDays: number,
): AnalyticsTrendPoint[] {
  const map = new Map<string, number>();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    map.set(d.toISOString().slice(0, 10), 0);
  }
  for (const row of rows) {
    const key =
      row.day instanceof Date
        ? row.day.toISOString().slice(0, 10)
        : new Date(row.day).toISOString().slice(0, 10);
    if (map.has(key)) {
      map.set(key, Number(row.count));
    }
  }
  return Array.from(map, ([date, count]) => ({ date, count }));
}

/**
 * Trend query is intentionally always windowed (capped at 90 days) — even
 * when the rest of the filters are "all time" — because a multi-year line
 * with mostly empty days reads as noise. Spec line 175 wires this to 90.
 */
async function fetchTrend(filters: AnalyticsFilters): Promise<AnalyticsTrendPoint[]> {
  const trendDays = Math.min(Number.isFinite(filters.days) ? filters.days : 90, 90);
  const since = new Date(Date.now() - trendDays * 24 * 60 * 60 * 1000);
  since.setUTCHours(0, 0, 0, 0);

  const filterSql = filters.country
    ? Prisma.sql` AND country_code = ${filters.country}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<{ day: Date; count: bigint }[]>`
    SELECT date_trunc('day', posted_date)::date AS day, COUNT(*)::bigint AS count
    FROM jobs
    WHERE is_active = true
      AND posted_date >= ${since}
      ${filterSql}
    GROUP BY day
    ORDER BY day ASC
  `;

  return fillTrend(rows, trendDays);
}

/**
 * Distinct companies/cities in one pass.
 *
 * This used to be two `findMany({ distinct })` calls, which Prisma applies
 * client-side: every matching row (200k+ on the default window) crossed the
 * wire twice per request just to be deduplicated in JS. Postgres can count
 * distinct values without shipping the rows.
 */
async function fetchDistinctCounts(
  filters: AnalyticsFilters,
): Promise<{ companies: number; cities: number }> {
  const rows = await prisma.$queryRaw<{ companies: bigint; cities: bigint }[]>`
    SELECT COUNT(DISTINCT company_name)::bigint AS companies,
           COUNT(DISTINCT city)::bigint AS cities
    FROM jobs
    WHERE is_active = true
      ${rawWhere(filters)}
  `;
  const row = rows[0];
  return {
    companies: Number(row?.companies ?? 0),
    cities: Number(row?.cities ?? 0),
  };
}

async function fetchTopSkills(filters: AnalyticsFilters): Promise<{ name: string; count: number }[]> {
  const rows = await prisma.$queryRaw<{ skill: string; count: bigint }[]>`
    SELECT lower(skill) AS skill, COUNT(*)::bigint AS count
    FROM jobs, UNNEST(skills) AS skill
    WHERE is_active = true
      AND skill <> ''
      ${rawWhere(filters)}
    GROUP BY lower(skill)
    ORDER BY count DESC
    LIMIT 20
  `;
  return rows.map((r) => ({ name: r.skill, count: Number(r.count) }));
}

async function computeAnalytics(filters: AnalyticsFilters): Promise<AnalyticsData> {
  const where = whereOf(filters);
  const baseActiveWhere: Prisma.JobWhereInput = { isActive: true };

  // Deliberately run in waves instead of one ten-wide Promise.all. Each of
  // these is a full-table aggregate; firing all of them at once put ten
  // concurrent scans (several of them parallel plans) on the same Postgres
  // box, which is what tipped the default 90-day view over into 500s.
  const [totalActive, filteredActive, distinct] = await Promise.all([
    prisma.job.count({ where: baseActiveWhere }),
    prisma.job.count({ where }),
    fetchDistinctCounts(filters),
  ]);

  const [countriesGroups, categoriesGroups, topCompaniesGroups, availableCountriesGroups] =
    await Promise.all([
      prisma.job.groupBy({
        by: ["countryCode"],
        where,
        _count: { _all: true },
        orderBy: { _count: { countryCode: "desc" } },
        take: 12,
      }),
      prisma.job.groupBy({
        by: ["category"],
        where,
        _count: { _all: true },
        orderBy: { _count: { category: "desc" } },
        take: 10,
      }),
      prisma.job.groupBy({
        by: ["companyName"],
        where,
        _count: { _all: true },
        orderBy: { _count: { companyName: "desc" } },
        take: 10,
      }),
      prisma.job.groupBy({
        by: ["countryCode"],
        where: baseActiveWhere,
        _count: { _all: true },
        orderBy: { _count: { countryCode: "desc" } },
        take: 30,
      }),
    ]);

  const [trend, topSkills] = await Promise.all([
    fetchTrend(filters),
    fetchTopSkills(filters),
  ]);

  return {
    counts: {
      totalActive,
      filteredActive,
      uniqueCompanies: distinct.companies,
      uniqueCities: distinct.cities,
    },
    buckets: {
      countries: countriesGroups.map((c) => ({
        code: c.countryCode,
        count: c._count._all,
      })),
      categories: categoriesGroups.map((c) => ({
        name: c.category,
        count: c._count._all,
      })),
      topCompanies: topCompaniesGroups.map((c) => ({
        name: c.companyName,
        count: c._count._all,
      })),
      topSkills,
    },
    trend,
    availableCountries: availableCountriesGroups
      .filter((c) => c.countryCode && c.countryCode !== "ZZ")
      .map((c) => c.countryCode),
  };
}

/**
 * Ten aggregates over 270k+ rows is not a per-request workload. Postings
 * move on the crawler's schedule, so a 10-minute window is far fresher than
 * the data itself — and it means a burst of traffic (or a crawler walking
 * the filter combinations) costs one computation, not one per hit.
 *
 * `filters` is part of the cache key, which is why `range`/`country` are
 * parsed against an allowlist before they get here.
 */
const getCachedAnalytics = unstable_cache(
  computeAnalytics,
  ["analytics-dashboard"],
  { revalidate: 600, tags: ["analytics"] },
);

export async function fetchAnalytics(filters: AnalyticsFilters): Promise<AnalyticsData> {
  return getCachedAnalytics(filters);
}
