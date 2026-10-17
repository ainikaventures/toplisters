import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { LICENCE_FREE_SOURCES } from "@/lib/sources/licence-free";

/**
 * Job counts for share cards. Counted ONLY over licence-free sources +
 * user-submitted jobs: a card is a public, shareable vacancy count, and
 * Adzuna's terms explicitly ban publishing vacancy counts from its data
 * (info/COMPLIANCE.md). So these numbers are deliberately lower than the
 * on-site totals.
 */
export async function licenceFreeCounts(
  scope: { countryCode: string } | { companyNames: string[] },
): Promise<{ today: number; active: number }> {
  const where: Prisma.JobWhereInput = {
    isActive: true,
    moderationStatus: "approved",
    OR: [{ source: { in: LICENCE_FREE_SOURCES } }, { isUserSubmitted: true }],
    ...("countryCode" in scope
      ? { countryCode: scope.countryCode }
      : { companyName: { in: scope.companyNames } }),
  };
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [today, active] = await Promise.all([
      prisma.job.count({ where: { ...where, postedDate: { gte: since } } }),
      prisma.job.count({ where }),
    ]);
    return { today, active };
  } catch {
    return { today: 0, active: 0 };
  }
}

/**
 * Companies with the most open licence-free roles in a country, most first.
 * `logoUrl` is the most common logo across their rows (null when none).
 */
export async function topHiringCompanies(
  countryCode: string,
  limit: number,
): Promise<{ name: string; logoUrl: string | null; count: number }[]> {
  try {
    const rows = await prisma.$queryRaw<{ name: string; logo_url: string | null; n: number }[]>`
      SELECT company_name AS name, mode() WITHIN GROUP (ORDER BY company_logo_url) AS logo_url, count(*)::int AS n
      FROM jobs
      WHERE is_active = true
        AND moderation_status = 'approved'
        AND country_code = ${countryCode}
        AND (source = ANY(${LICENCE_FREE_SOURCES}) OR is_user_submitted = true)
      GROUP BY company_name
      ORDER BY n DESC, company_name
      LIMIT ${limit}
    `;
    return rows.map((r) => ({ name: r.name, logoUrl: r.logo_url, count: r.n }));
  } catch {
    return [];
  }
}

/** 7 → "7", 57 → "50+", 380 → "350+", 1234 → "1,200+". */
export function roundedCount(n: number): string {
  if (n < 10) return String(n);
  const step = n < 100 ? 10 : n < 1000 ? 50 : 100;
  return `${(Math.floor(n / step) * step).toLocaleString("en-US")}+`;
}
