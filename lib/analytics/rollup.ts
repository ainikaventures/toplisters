/**
 * Analytics rollup computation.
 *
 * IMPORTANT: no `server-only`, no `next/*` imports anywhere in this file's
 * graph. It runs inside the BullMQ worker (lib/jobs/stale.ts dispatches
 * "refresh-analytics"), which boots without Next — `npm run check:worker`
 * enforces this. Keep it pure Prisma + plain TS.
 *
 * Why this exists: /analytics runs ~10 aggregates across the full jobs
 * table on every request, which is ~2s TTFB at 270k+ rows. These rollups
 * are computed on the worker's schedule and stored in analytics_snapshots,
 * so the dashboards read one indexed row instead.
 */
import { prisma } from "@/lib/db";
import { OTHER_CATEGORY } from "@/lib/classify/category";
import { slugify } from "@/lib/slug";

/** Snapshot keys. Also the primary key in analytics_snapshots. */
export const SNAPSHOT_KEYS = {
  pipeline: "pipeline-health",
  market: "market-intel",
  engagement: "engagement",
} as const;

export type SnapshotKey = (typeof SNAPSHOT_KEYS)[keyof typeof SNAPSHOT_KEYS];

// ─── Shared shapes ────────────────────────────────────────────────────────

export interface CoverageStat {
  label: string;
  /** Rows where the field carries real information. */
  known: number;
  /** Rows in the denominator (always total active jobs). */
  total: number;
  /** What "unknown" means for this field, shown in the UI. */
  note: string;
}

export interface SourceStat {
  source: string;
  jobs: number;
  /** Median age in days of that source's active rows. */
  medianAgeDays: number | null;
  /** Most recent `lastSeenAt` across the source's rows. */
  lastSeenAt: string | null;
}

export interface TrendPoint {
  date: string;
  count: number;
}

export interface PipelinePayload {
  totalActive: number;
  totalRows: number;
  inactiveRows: number;
  distinctCompanies: number;
  distinctCities: number;
  sources: SourceStat[];
  coverage: CoverageStat[];
  ingestTrend: TrendPoint[];
  geocode: {
    cachedLocations: number;
    totalHits: number;
    /** Lookups served from cache instead of an external geocoder. */
    hitsSaved: number;
    hitRatePct: number | null;
  };
  freshness: {
    seenLast24h: number;
    seenLast7d: number;
    olderThan7d: number;
  };
}

export interface SalaryBucket {
  label: string;
  count: number;
  p25: number;
  p50: number;
  p75: number;
}

export interface MarketPayload {
  /** Denominator context — salary is only present on a minority of rows. */
  salaryCoverage: { withSalary: number; total: number; currency: string };
  /** Percentiles across every comparable salaried listing, ungrouped. */
  salaryOverall: { p25: number; p50: number; p75: number } | null;
  salaryByCategory: SalaryBucket[];
  salaryByExperience: SalaryBucket[];
  categoryMix: { name: string; count: number }[];
  collarByCountry: {
    countryCode: string;
    white: number;
    blue: number;
    grey: number;
    unknown: number;
  }[];
  topSkills: { name: string; count: number }[];
  /** postedDate → lastSeenAt, i.e. how long listings stay live. */
  velocity: { label: string; days: number; count: number }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function pct(known: number, total: number): number | null {
  return total > 0 ? Math.round((known / total) * 1000) / 10 : null;
}

function num(v: bigint | number | null): number {
  return v === null ? 0 : Number(v);
}

// ─── Pipeline health ──────────────────────────────────────────────────────

/**
 * Ingestion + data-quality rollup. Every coverage number is reported
 * against the same denominator (total active jobs) so the percentages are
 * directly comparable, and each carries a note explaining what the gap
 * means — an unclassified row is a classifier miss, an unknown work mode
 * is usually a source that simply doesn't publish the field.
 */
export async function computePipelineHealth(): Promise<PipelinePayload> {
  const [totalActive, totalRows] = await Promise.all([
    prisma.job.count({ where: { isActive: true } }),
    prisma.job.count(),
  ]);

  const [
    sourceRows,
    coverageRow,
    ingestRows,
    geocodeRow,
    freshnessRow,
    distinctRow,
  ] = await Promise.all([
    prisma.$queryRaw<
      { source: string; jobs: bigint; median_age: number | null; last_seen: Date | null }[]
    >`
      SELECT source,
             COUNT(*)::bigint AS jobs,
             PERCENTILE_CONT(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM (NOW() - posted_date)) / 86400
             ) AS median_age,
             MAX(last_seen_at) AS last_seen
      FROM jobs
      WHERE is_active = true
      GROUP BY source
      ORDER BY jobs DESC
    `,
    prisma.$queryRaw<
      {
        category_known: bigint;
        work_mode_known: bigint;
        experience_known: bigint;
        collar_known: bigint;
        salary_known: bigint;
        skills_known: bigint;
        city_known: bigint;
        company_domain_known: bigint;
      }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE category <> ${OTHER_CATEGORY})::bigint      AS category_known,
        COUNT(*) FILTER (WHERE work_mode <> 'unknown')::bigint             AS work_mode_known,
        COUNT(*) FILTER (WHERE experience_level <> 'unknown')::bigint      AS experience_known,
        COUNT(*) FILTER (WHERE collar_type <> 'unknown')::bigint           AS collar_known,
        COUNT(*) FILTER (WHERE salary_min IS NOT NULL
                            OR salary_max IS NOT NULL)::bigint             AS salary_known,
        COUNT(*) FILTER (WHERE COALESCE(array_length(skills, 1), 0) > 0)::bigint AS skills_known,
        COUNT(*) FILTER (WHERE city IS NOT NULL)::bigint                   AS city_known,
        COUNT(*) FILTER (WHERE company_domain IS NOT NULL)::bigint         AS company_domain_known
      FROM jobs
      WHERE is_active = true
    `,
    prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::bigint AS count
      FROM jobs
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY day
      ORDER BY day ASC
    `,
    prisma.$queryRaw<{ locations: bigint; total_hits: bigint }[]>`
      SELECT COUNT(*)::bigint AS locations, COALESCE(SUM(hits), 0)::bigint AS total_hits
      FROM geocode_cache
    `,
    prisma.$queryRaw<{ last24h: bigint; last7d: bigint; older: bigint }[]>`
      SELECT
        COUNT(*) FILTER (WHERE last_seen_at >= NOW() - INTERVAL '24 hours')::bigint AS last24h,
        COUNT(*) FILTER (WHERE last_seen_at >= NOW() - INTERVAL '7 days')::bigint   AS last7d,
        COUNT(*) FILTER (WHERE last_seen_at <  NOW() - INTERVAL '7 days')::bigint   AS older
      FROM jobs
      WHERE is_active = true
    `,
    prisma.$queryRaw<{ companies: bigint; cities: bigint }[]>`
      SELECT COUNT(DISTINCT company_name)::bigint AS companies,
             COUNT(DISTINCT city)::bigint         AS cities
      FROM jobs
      WHERE is_active = true
    `,
  ]);

  const c = coverageRow[0];
  const geo = geocodeRow[0];
  const fresh = freshnessRow[0];
  const distinct = distinctRow[0];

  // Every geocode_cache row is written once and then re-read; hits counts
  // total lookups, so hits - rows is the number of external calls avoided.
  const cachedLocations = num(geo?.locations);
  const totalHits = num(geo?.total_hits);
  const hitsSaved = Math.max(0, totalHits - cachedLocations);

  return {
    totalActive,
    totalRows,
    inactiveRows: totalRows - totalActive,
    distinctCompanies: num(distinct?.companies),
    distinctCities: num(distinct?.cities),
    sources: sourceRows.map((r) => ({
      source: r.source,
      jobs: num(r.jobs),
      medianAgeDays:
        r.median_age === null ? null : Math.round(Number(r.median_age) * 10) / 10,
      lastSeenAt: r.last_seen ? r.last_seen.toISOString() : null,
    })),
    coverage: [
      {
        label: "Category classified",
        known: num(c?.category_known),
        total: totalActive,
        note: `Rows the classifier could not place fall back to "${OTHER_CATEGORY}".`,
      },
      {
        label: "Salary parsed",
        known: num(c?.salary_known),
        total: totalActive,
        note: "Most sources publish no salary at all; this is an upstream gap, not a parse failure.",
      },
      {
        label: "Collar type",
        known: num(c?.collar_known),
        total: totalActive,
        note: "Derived from title and category heuristics.",
      },
      {
        label: "Experience level",
        known: num(c?.experience_known),
        total: totalActive,
        note: "Inferred from title seniority markers.",
      },
      {
        label: "Work mode",
        known: num(c?.work_mode_known),
        total: totalActive,
        note: "Remote / hybrid / on-site is rarely stated in a structured field upstream.",
      },
      {
        label: "Skills extracted",
        known: num(c?.skills_known),
        total: totalActive,
        note: "Keyword extraction over the description body.",
      },
      {
        label: "City resolved",
        known: num(c?.city_known),
        total: totalActive,
        note: "Geocoded from free-text location; country-only rows have no city.",
      },
      {
        label: "Company domain",
        known: num(c?.company_domain_known),
        total: totalActive,
        note: "Needed for logo lookup and employer de-duplication.",
      },
    ],
    ingestTrend: ingestRows.map((r) => ({
      date: r.day.toISOString().slice(0, 10),
      count: num(r.count),
    })),
    geocode: {
      cachedLocations,
      totalHits,
      hitsSaved,
      hitRatePct: totalHits > 0 ? pct(hitsSaved, totalHits) : null,
    },
    freshness: {
      seenLast24h: num(fresh?.last24h),
      seenLast7d: num(fresh?.last7d),
      olderThan7d: num(fresh?.older),
    },
  };
}

// ─── Market intelligence ──────────────────────────────────────────────────

/**
 * Labour-market rollup.
 *
 * Salary figures are restricted to a single currency (default GBP) and to
 * yearly-period rows. Mixing currencies without an FX feed would produce a
 * meaningless distribution, and mixing hourly with annual figures produces
 * a bimodal one — so both are filtered rather than silently blended.
 */
export async function computeMarketIntel(
  currency = "GBP",
): Promise<MarketPayload> {
  const salaryWhere = `
    is_active = true
    AND salary_currency = $1
    AND salary_period = 'yearly'
    AND salary_min IS NOT NULL
    AND salary_min > 0
  `;

  const [
    coverageRow,
    overallRow,
    byCategory,
    byExperience,
    categoryMix,
    collarRows,
    skillRows,
    velocityRow,
  ] = await Promise.all([
    prisma.$queryRaw<{ with_salary: bigint; total: bigint }[]>`
      SELECT COUNT(*) FILTER (
               WHERE salary_currency = ${currency}
                 AND salary_period = 'yearly'
                 AND salary_min IS NOT NULL
                 AND salary_min > 0
             )::bigint AS with_salary,
             COUNT(*)::bigint AS total
      FROM jobs
      WHERE is_active = true
    `,
    prisma.$queryRaw<{ p25: number | null; p50: number | null; p75: number | null }[]>`
      SELECT PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY salary_min) AS p25,
             PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY salary_min) AS p50,
             PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY salary_min) AS p75
      FROM jobs
      WHERE is_active = true
        AND salary_currency = ${currency}
        AND salary_period = 'yearly'
        AND salary_min IS NOT NULL
        AND salary_min > 0
    `,
    prisma.$queryRawUnsafe<
      { label: string; count: bigint; p25: number; p50: number; p75: number }[]
    >(
      `SELECT category AS label,
              COUNT(*)::bigint AS count,
              PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY salary_min) AS p25,
              PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY salary_min) AS p50,
              PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY salary_min) AS p75
       FROM jobs
       WHERE ${salaryWhere} AND category <> $2
       GROUP BY category
       HAVING COUNT(*) >= 25
       ORDER BY p50 DESC
       LIMIT 14`,
      currency,
      OTHER_CATEGORY,
    ),
    prisma.$queryRawUnsafe<
      { label: string; count: bigint; p25: number; p50: number; p75: number }[]
    >(
      `SELECT experience_level::text AS label,
              COUNT(*)::bigint AS count,
              PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY salary_min) AS p25,
              PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY salary_min) AS p50,
              PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY salary_min) AS p75
       FROM jobs
       WHERE ${salaryWhere} AND experience_level <> 'unknown'
       GROUP BY experience_level
       HAVING COUNT(*) >= 10
       ORDER BY p50 ASC`,
      currency,
    ),
    prisma.job.groupBy({
      by: ["category"],
      where: { isActive: true },
      _count: { _all: true },
      orderBy: { _count: { category: "desc" } },
      take: 15,
    }),
    prisma.$queryRaw<
      {
        country_code: string;
        white: bigint;
        blue: bigint;
        grey: bigint;
        unknown: bigint;
      }[]
    >`
      SELECT country_code,
             COUNT(*) FILTER (WHERE collar_type = 'white')::bigint   AS white,
             COUNT(*) FILTER (WHERE collar_type = 'blue')::bigint    AS blue,
             COUNT(*) FILTER (WHERE collar_type = 'grey')::bigint    AS grey,
             COUNT(*) FILTER (WHERE collar_type = 'unknown')::bigint AS unknown
      FROM jobs
      WHERE is_active = true AND country_code <> 'ZZ'
      GROUP BY country_code
      ORDER BY COUNT(*) DESC
      LIMIT 12
    `,
    prisma.$queryRaw<{ skill: string; count: bigint }[]>`
      SELECT lower(skill) AS skill, COUNT(*)::bigint AS count
      FROM jobs, UNNEST(skills) AS skill
      WHERE is_active = true AND skill <> ''
      GROUP BY lower(skill)
      ORDER BY count DESC
      LIMIT 20
    `,
    prisma.$queryRaw<{ bucket: string; days: number; count: bigint }[]>`
      SELECT bucket, days, COUNT(*)::bigint AS count FROM (
        SELECT
          CASE
            WHEN age_days < 7  THEN 'Under a week'
            WHEN age_days < 14 THEN '1–2 weeks'
            WHEN age_days < 30 THEN '2–4 weeks'
            WHEN age_days < 60 THEN '1–2 months'
            ELSE 'Over 2 months'
          END AS bucket,
          CASE
            WHEN age_days < 7  THEN 7
            WHEN age_days < 14 THEN 14
            WHEN age_days < 30 THEN 30
            WHEN age_days < 60 THEN 60
            ELSE 61
          END AS days,
          age_days
        FROM (
          SELECT EXTRACT(EPOCH FROM (last_seen_at - posted_date)) / 86400 AS age_days
          FROM jobs
          WHERE is_active = true AND last_seen_at > posted_date
        ) t
      ) b
      GROUP BY bucket, days
      ORDER BY days ASC
    `,
  ]);

  const cov = coverageRow[0];
  const overall = overallRow[0];

  const toBucket = (r: {
    label: string;
    count: bigint;
    p25: number;
    p50: number;
    p75: number;
  }): SalaryBucket => ({
    label: r.label,
    count: num(r.count),
    p25: Math.round(Number(r.p25)),
    p50: Math.round(Number(r.p50)),
    p75: Math.round(Number(r.p75)),
  });

  return {
    salaryCoverage: {
      withSalary: num(cov?.with_salary),
      total: num(cov?.total),
      currency,
    },
    salaryOverall:
      overall?.p50 == null
        ? null
        : {
            p25: Math.round(Number(overall.p25)),
            p50: Math.round(Number(overall.p50)),
            p75: Math.round(Number(overall.p75)),
          },
    salaryByCategory: byCategory.map(toBucket),
    salaryByExperience: byExperience.map(toBucket),
    categoryMix: categoryMix.map((c) => ({
      name: c.category,
      count: c._count._all,
    })),
    collarByCountry: collarRows.map((r) => ({
      countryCode: r.country_code,
      white: num(r.white),
      blue: num(r.blue),
      grey: num(r.grey),
      unknown: num(r.unknown),
    })),
    topSkills: skillRows.map((r) => ({ name: r.skill, count: num(r.count) })),
    velocity: velocityRow.map((r) => ({
      label: r.bucket,
      days: Number(r.days),
      count: num(r.count),
    })),
  };
}

// ─── Engagement ───────────────────────────────────────────────────────────

export interface FunnelSlice {
  label: string;
  views: number;
  clicks: number;
  /** clicks / views as a percentage, null when views == 0. */
  ctrPct: number | null;
}

export interface TopListing {
  id: string;
  title: string;
  companyName: string;
  countryCode: string;
  category: string;
  slug: string;
  views: number;
  clicks: number;
  ctrPct: number | null;
}

export interface EngagementPayload {
  totals: {
    views: number;
    clicks: number;
    ctrPct: number | null;
    listingsWithViews: number;
    listingsWithClicks: number;
    totalListings: number;
  };
  bySource: FunnelSlice[];
  byCategory: FunnelSlice[];
  byCountry: FunnelSlice[];
  /** Highest raw view counts. */
  mostViewed: TopListing[];
  /** Best click-through, floored at a minimum view count so a 1-view,
   *  1-click listing doesn't top the table at 100%. */
  bestConverting: TopListing[];
  /** The floor applied to `bestConverting`. Surfaced so the UI can say so. */
  minViewsForCtr: number;
}

/** Below this, CTR is noise rather than signal. */
const MIN_VIEWS_FOR_CTR = 20;

function ctr(clicks: number, views: number): number | null {
  return views > 0 ? Math.round((clicks / views) * 1000) / 10 : null;
}

function toSlice(r: {
  label: string | null;
  views: bigint | number;
  clicks: bigint | number;
}): FunnelSlice {
  const views = num(r.views);
  const clicks = num(r.clicks);
  return { label: r.label ?? "unknown", views, clicks, ctrPct: ctr(clicks, views) };
}

/**
 * View → apply-click funnel.
 *
 * Reads the denormalised Job.viewCount / Job.clickCount counters rather
 * than joining pageviews to job_clicks, which keeps every cut here a
 * single grouped scan of one table.
 *
 * Caveat worth repeating wherever this is displayed: viewCount counts
 * views, not people. The cookieless visitor hash rotates daily
 * (lib/pageviews.ts), so there is no honest per-listing "unique viewers"
 * figure over a multi-day window — only views.
 */
export async function computeEngagement(): Promise<EngagementPayload> {
  const [totalsRow, bySource, byCategory, byCountry, mostViewed, bestConverting] =
    await Promise.all([
      prisma.$queryRaw<
        {
          views: bigint;
          clicks: bigint;
          with_views: bigint;
          with_clicks: bigint;
          total: bigint;
        }[]
      >`
        SELECT COALESCE(SUM(view_count), 0)::bigint          AS views,
               COALESCE(SUM(click_count), 0)::bigint         AS clicks,
               COUNT(*) FILTER (WHERE view_count > 0)::bigint  AS with_views,
               COUNT(*) FILTER (WHERE click_count > 0)::bigint AS with_clicks,
               COUNT(*)::bigint                               AS total
        FROM jobs
        WHERE is_active = true
      `,
      prisma.$queryRaw<{ label: string; views: bigint; clicks: bigint }[]>`
        SELECT source AS label,
               COALESCE(SUM(view_count), 0)::bigint  AS views,
               COALESCE(SUM(click_count), 0)::bigint AS clicks
        FROM jobs
        WHERE is_active = true
        GROUP BY source
        HAVING COALESCE(SUM(view_count), 0) > 0
        ORDER BY views DESC
        LIMIT 12
      `,
      prisma.$queryRaw<{ label: string; views: bigint; clicks: bigint }[]>`
        SELECT category AS label,
               COALESCE(SUM(view_count), 0)::bigint  AS views,
               COALESCE(SUM(click_count), 0)::bigint AS clicks
        FROM jobs
        WHERE is_active = true
        GROUP BY category
        HAVING COALESCE(SUM(view_count), 0) > 0
        ORDER BY views DESC
        LIMIT 12
      `,
      prisma.$queryRaw<{ label: string; views: bigint; clicks: bigint }[]>`
        SELECT country_code AS label,
               COALESCE(SUM(view_count), 0)::bigint  AS views,
               COALESCE(SUM(click_count), 0)::bigint AS clicks
        FROM jobs
        WHERE is_active = true AND country_code <> 'ZZ'
        GROUP BY country_code
        HAVING COALESCE(SUM(view_count), 0) > 0
        ORDER BY views DESC
        LIMIT 12
      `,
      prisma.job.findMany({
        where: { isActive: true, viewCount: { gt: 0 } },
        orderBy: { viewCount: "desc" },
        take: 10,
        select: {
          id: true,
          title: true,
          companyName: true,
          countryCode: true,
          category: true,
          viewCount: true,
          clickCount: true,
        },
      }),
      prisma.$queryRaw<
        {
          id: string;
          title: string;
          company_name: string;
          country_code: string;
          category: string;
          view_count: number;
          click_count: number;
        }[]
      >`
        SELECT id, title, company_name, country_code, category,
               view_count, click_count
        FROM jobs
        WHERE is_active = true
          AND view_count >= ${MIN_VIEWS_FOR_CTR}
          AND click_count > 0
        ORDER BY click_count::float / NULLIF(view_count, 0) DESC
        LIMIT 10
      `,
    ]);

  const t = totalsRow[0];
  const totalViews = num(t?.views);
  const totalClicks = num(t?.clicks);

  return {
    totals: {
      views: totalViews,
      clicks: totalClicks,
      ctrPct: ctr(totalClicks, totalViews),
      listingsWithViews: num(t?.with_views),
      listingsWithClicks: num(t?.with_clicks),
      totalListings: num(t?.total),
    },
    bySource: bySource.map(toSlice),
    byCategory: byCategory.map(toSlice),
    byCountry: byCountry.map(toSlice),
    mostViewed: mostViewed.map((j) => ({
      id: j.id,
      title: j.title,
      companyName: j.companyName,
      countryCode: j.countryCode,
      category: j.category,
      slug: slugify(j.title),
      views: j.viewCount,
      clicks: j.clickCount,
      ctrPct: ctr(j.clickCount, j.viewCount),
    })),
    bestConverting: bestConverting.map((j) => ({
      id: j.id,
      title: j.title,
      companyName: j.company_name,
      countryCode: j.country_code,
      category: j.category,
      slug: slugify(j.title),
      views: j.view_count,
      clicks: j.click_count,
      ctrPct: ctr(j.click_count, j.view_count),
    })),
    minViewsForCtr: MIN_VIEWS_FOR_CTR,
  };
}

// ─── Refresh ──────────────────────────────────────────────────────────────

export interface RefreshResult {
  key: string;
  computeMs: number;
  rowsScanned: number | null;
}

/**
 * Recompute every snapshot and upsert it. Each section is timed
 * independently — that number is what the dashboards display as the
 * per-request cost the snapshot is avoiding.
 */
export async function refreshAnalyticsSnapshots(): Promise<RefreshResult[]> {
  const results: RefreshResult[] = [];

  const sections: {
    key: SnapshotKey;
    compute: () => Promise<PipelinePayload | MarketPayload | EngagementPayload>;
    rows: (p: never) => number | null;
  }[] = [
    {
      key: SNAPSHOT_KEYS.pipeline,
      compute: computePipelineHealth,
      rows: (p: never) => (p as unknown as PipelinePayload).totalRows,
    },
    {
      key: SNAPSHOT_KEYS.market,
      compute: computeMarketIntel,
      rows: (p: never) => (p as unknown as MarketPayload).salaryCoverage.total,
    },
    {
      key: SNAPSHOT_KEYS.engagement,
      compute: computeEngagement,
      rows: (p: never) => (p as unknown as EngagementPayload).totals.totalListings,
    },
  ];

  for (const section of sections) {
    const startedAt = Date.now();
    const payload = await section.compute();
    const computeMs = Date.now() - startedAt;
    const rowsScanned = section.rows(payload as never);

    await prisma.analyticsSnapshot.upsert({
      where: { key: section.key },
      create: {
        key: section.key,
        payload: payload as never,
        computeMs,
        rowsScanned,
      },
      update: {
        payload: payload as never,
        computeMs,
        rowsScanned,
        computedAt: new Date(),
      },
    });

    results.push({ key: section.key, computeMs, rowsScanned });
  }

  return results;
}
