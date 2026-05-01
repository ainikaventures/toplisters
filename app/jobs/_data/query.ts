import "server-only";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import type { Job, $Enums } from "@/lib/generated/prisma/client";

export const PAGE_SIZE = 24;

export interface JobFilters {
  q: string | null;
  country: string | null;
  category: string | null;
  workMode: $Enums.WorkMode | null;
  jobType: $Enums.JobType | null;
  collarType: $Enums.CollarType | null;
  salaryMin: number | null;
  salaryMax: number | null;
}

export interface JobListResult {
  jobs: Job[];
  total: number;
}

/**
 * Build the Prisma where filter for the non-FTS path. Returns an object the
 * generated client validates; same filters are mirrored as raw SQL fragments
 * in `buildSqlAndClauses` for the FTS path.
 */
function buildPrismaWhere(filters: JobFilters): Prisma.JobWhereInput {
  const where: Prisma.JobWhereInput = { isActive: true };
  if (filters.country) where.countryCode = filters.country;
  if (filters.category) where.category = filters.category;
  if (filters.workMode) where.workMode = filters.workMode;
  if (filters.jobType) where.jobType = filters.jobType;
  if (filters.collarType) where.collarType = filters.collarType;
  if (filters.salaryMin) where.salaryMin = { gte: filters.salaryMin };
  if (filters.salaryMax) where.salaryMax = { lte: filters.salaryMax };
  return where;
}

/**
 * Same filters, expressed as raw SQL fragments to AND onto an FTS query.
 * Each fragment uses parameterised values so callers don't need to worry
 * about SQL injection. Enum columns are cast to text for the comparison.
 */
function buildSqlAndClauses(filters: JobFilters): Prisma.Sql {
  const clauses: Prisma.Sql[] = [];
  if (filters.country)
    clauses.push(Prisma.sql`country_code = ${filters.country}`);
  if (filters.category)
    clauses.push(Prisma.sql`category = ${filters.category}`);
  if (filters.workMode)
    clauses.push(Prisma.sql`work_mode::text = ${filters.workMode}`);
  if (filters.jobType)
    clauses.push(Prisma.sql`job_type::text = ${filters.jobType}`);
  if (filters.collarType)
    clauses.push(Prisma.sql`collar_type::text = ${filters.collarType}`);
  if (filters.salaryMin)
    clauses.push(Prisma.sql`salary_min >= ${filters.salaryMin}`);
  if (filters.salaryMax)
    clauses.push(Prisma.sql`salary_max <= ${filters.salaryMax}`);
  if (clauses.length === 0) return Prisma.empty;
  return Prisma.sql` AND ${Prisma.join(clauses, " AND ")}`;
}

/** Listing without a search term: Prisma findMany ordered by featured + recency. */
async function fetchRanked(
  filters: JobFilters,
  page: number,
): Promise<JobListResult> {
  const where = buildPrismaWhere(filters);
  const [total, jobs] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      orderBy: [
        { isFeatured: "desc" },
        { postedDate: "desc" },
      ],
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
  ]);
  return { jobs, total };
}

/** Listing with FTS: rank by ts_rank then recency, then materialise via Prisma. */
async function fetchFts(
  filters: JobFilters,
  page: number,
): Promise<JobListResult> {
  const q = filters.q ?? "";
  const filterSql = buildSqlAndClauses(filters);

  const totalRows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM jobs
    WHERE is_active = true
      AND search_vector @@ plainto_tsquery('english', ${q})
      ${filterSql}
  `;
  const total = Number(totalRows[0]?.count ?? 0);

  const ids = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM jobs
    WHERE is_active = true
      AND search_vector @@ plainto_tsquery('english', ${q})
      ${filterSql}
    ORDER BY
      ts_rank(search_vector, plainto_tsquery('english', ${q})) DESC,
      is_featured DESC,
      posted_date DESC
    LIMIT ${PAGE_SIZE}
    OFFSET ${(page - 1) * PAGE_SIZE}
  `;

  if (ids.length === 0) return { jobs: [], total };

  const idOrder = new Map(ids.map((row, i) => [row.id, i]));
  const jobs = await prisma.job.findMany({
    where: { id: { in: ids.map((r) => r.id) } },
  });
  jobs.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));

  return { jobs, total };
}

export async function fetchJobs(
  filters: JobFilters,
  page: number,
): Promise<JobListResult> {
  return filters.q ? fetchFts(filters, page) : fetchRanked(filters, page);
}

export interface JobsFacets {
  countries: { value: string; count: number }[];
  categories: { value: string; count: number }[];
}

/** Filter-dropdown options sourced from active rows. Cheap on small DBs. */
export async function fetchFacets(): Promise<JobsFacets> {
  const [countries, categories] = await Promise.all([
    prisma.job.groupBy({
      by: ["countryCode"],
      where: { isActive: true },
      _count: { _all: true },
      orderBy: { _count: { countryCode: "desc" } },
      take: 30,
    }),
    prisma.job.groupBy({
      by: ["category"],
      where: { isActive: true },
      _count: { _all: true },
      orderBy: { _count: { category: "desc" } },
      take: 50,
    }),
  ]);
  return {
    countries: countries.map((c) => ({ value: c.countryCode, count: c._count._all })),
    categories: categories.map((c) => ({ value: c.category, count: c._count._all })),
  };
}
