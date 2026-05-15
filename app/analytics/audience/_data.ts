import "server-only";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";

export interface AudienceFilters {
  /** Window length in days, ending now. */
  days: number;
}

export interface CountryAudience {
  countryCode: string;
  visitors: number;
  visits: number;
}

export interface AudienceData {
  windowDays: number;
  /** Total pageviews in window (raw row count). */
  totalVisits: number;
  /** Distinct visitor_hash in window. Cookieless rotation: same human across two days is two hashes (see [pageviews.ts](lib/pageviews.ts)). */
  totalVisitors: number;
  /** Distinct countries with at least one visit in window. */
  countryReach: number;
  /** Top countries by visitor count, descending. Limited to 60. */
  countries: CountryAudience[];
  /** Top paths by visit count, for an "Most-viewed pages" table. */
  topPaths: { path: string; visits: number }[];
  /** Per-day visit count over the window, oldest → newest, zero-filled. */
  trend: { date: string; visits: number; visitors: number }[];
}

const TREND_CAP_DAYS = 90;

function fillTrend(
  rows: { day: Date; visits: bigint; visitors: bigint }[],
  windowDays: number,
): { date: string; visits: number; visitors: number }[] {
  const map = new Map<string, { visits: number; visitors: number }>();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const days = Math.min(windowDays, TREND_CAP_DAYS);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    map.set(d.toISOString().slice(0, 10), { visits: 0, visitors: 0 });
  }
  for (const row of rows) {
    const key =
      row.day instanceof Date
        ? row.day.toISOString().slice(0, 10)
        : new Date(row.day).toISOString().slice(0, 10);
    if (map.has(key)) {
      map.set(key, { visits: Number(row.visits), visitors: Number(row.visitors) });
    }
  }
  return Array.from(map, ([date, v]) => ({ date, ...v }));
}

export async function fetchAudience(filters: AudienceFilters): Promise<AudienceData> {
  const since = new Date(Date.now() - filters.days * 24 * 60 * 60 * 1000);

  const [totals, countryRows, pathRows, trendRows] = await Promise.all([
    prisma.$queryRaw<{ total_visits: bigint; total_visitors: bigint; country_reach: bigint }[]>`
      SELECT
        COUNT(*)::bigint                                AS total_visits,
        COUNT(DISTINCT visitor_hash)::bigint            AS total_visitors,
        COUNT(DISTINCT NULLIF(country_code, ''))::bigint AS country_reach
      FROM pageviews
      WHERE occurred_at >= ${since}
    `,
    prisma.$queryRaw<{ country_code: string | null; visitors: bigint; visits: bigint }[]>`
      SELECT
        country_code,
        COUNT(DISTINCT visitor_hash)::bigint AS visitors,
        COUNT(*)::bigint                     AS visits
      FROM pageviews
      WHERE occurred_at >= ${since}
        AND country_code IS NOT NULL
      GROUP BY country_code
      ORDER BY visitors DESC, visits DESC
      LIMIT 60
    `,
    prisma.$queryRaw<{ path: string; visits: bigint }[]>`
      SELECT path, COUNT(*)::bigint AS visits
      FROM pageviews
      WHERE occurred_at >= ${since}
      GROUP BY path
      ORDER BY visits DESC
      LIMIT 12
    `,
    (async () => {
      const trendDays = Math.min(filters.days, TREND_CAP_DAYS);
      const trendSince = new Date(Date.now() - trendDays * 24 * 60 * 60 * 1000);
      trendSince.setUTCHours(0, 0, 0, 0);
      return prisma.$queryRaw<{ day: Date; visits: bigint; visitors: bigint }[]>`
        SELECT
          date_trunc('day', occurred_at)::date AS day,
          COUNT(*)::bigint                     AS visits,
          COUNT(DISTINCT visitor_hash)::bigint AS visitors
        FROM pageviews
        WHERE occurred_at >= ${trendSince}
        GROUP BY day
        ORDER BY day ASC
      `;
    })(),
  ]);

  const totalRow = totals[0] ?? {
    total_visits: BigInt(0),
    total_visitors: BigInt(0),
    country_reach: BigInt(0),
  };

  return {
    windowDays: filters.days,
    totalVisits: Number(totalRow.total_visits),
    totalVisitors: Number(totalRow.total_visitors),
    countryReach: Number(totalRow.country_reach),
    countries: countryRows
      .filter((r): r is { country_code: string; visitors: bigint; visits: bigint } => !!r.country_code)
      .map((r) => ({
        countryCode: r.country_code,
        visitors: Number(r.visitors),
        visits: Number(r.visits),
      })),
    topPaths: pathRows.map((r) => ({ path: r.path, visits: Number(r.visits) })),
    trend: fillTrend(trendRows, filters.days),
  };
}

// Touch the unused Prisma import so future migrations of this file can
// reach for it without re-adding the symbol.
export type { Prisma };
