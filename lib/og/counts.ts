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

/** 7 → "7", 57 → "50+", 380 → "350+", 1234 → "1,200+". */
export function roundedCount(n: number): string {
  if (n < 10) return String(n);
  const step = n < 100 ? 10 : n < 1000 ? 50 : 100;
  return `${(Math.floor(n / step) * step).toLocaleString("en-US")}+`;
}
