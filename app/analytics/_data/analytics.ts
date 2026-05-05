import "server-only";
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

/** Build the Prisma where clause shared by every aggregation. */
function whereOf(filters: AnalyticsFilters): Prisma.JobWhereInput {
  const where: Prisma.JobWhereInput = { isActive: true };
  if (filters.country) where.countryCode = filters.country;
  if (Number.isFinite(filters.days)) {
    const since = new Date(Date.now() - filters.days * 24 * 60 * 60 * 1000);
    where.postedDate = { gte: since };
  }
  return where;
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

async function fetchTopSkills(filters: AnalyticsFilters): Promise<{ name: string; count: number }[]> {
  const filterSql = filters.country
    ? Prisma.sql` AND country_code = ${filters.country}`
    : Prisma.empty;
  const since = Number.isFinite(filters.days)
    ? new Date(Date.now() - filters.days * 24 * 60 * 60 * 1000)
    : null;
  const sinceSql = since
    ? Prisma.sql` AND posted_date >= ${since}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<{ skill: string; count: bigint }[]>`
    SELECT lower(skill) AS skill, COUNT(*)::bigint AS count
    FROM jobs, UNNEST(skills) AS skill
    WHERE is_active = true
      AND skill <> ''
      ${filterSql}
      ${sinceSql}
    GROUP BY lower(skill)
    ORDER BY count DESC
    LIMIT 20
  `;
  return rows.map((r) => ({ name: r.skill, count: Number(r.count) }));
}

export async function fetchAnalytics(filters: AnalyticsFilters): Promise<AnalyticsData> {
  const where = whereOf(filters);
  const baseActiveWhere: Prisma.JobWhereInput = { isActive: true };

  const [
    totalActive,
    filteredActive,
    uniqueCompanies,
    uniqueCities,
    countriesGroups,
    categoriesGroups,
    topCompaniesGroups,
    availableCountriesGroups,
    trend,
    topSkills,
  ] = await Promise.all([
    prisma.job.count({ where: baseActiveWhere }),
    prisma.job.count({ where }),
    prisma.job.findMany({ where, distinct: ["companyName"], select: { companyName: true } }),
    prisma.job.findMany({
      where: { ...where, city: { not: null } },
      distinct: ["city"],
      select: { city: true },
    }),
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
    fetchTrend(filters),
    fetchTopSkills(filters),
  ]);

  return {
    counts: {
      totalActive,
      filteredActive,
      uniqueCompanies: uniqueCompanies.length,
      uniqueCities: uniqueCities.length,
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
