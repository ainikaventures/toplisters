import "server-only";
import { prisma } from "@/lib/db";

/**
 * Country options for the subscribe form. Drawn live from the dataset
 * (only show countries we actually have jobs in) and capped at 30. The
 * subscriber's `countries[]` filter only narrows their digest later, so
 * picking nothing is fine — equivalent to "all countries".
 */
export async function fetchCountryOptions(): Promise<string[]> {
  const groups = await prisma.job.groupBy({
    by: ["countryCode"],
    where: { isActive: true },
    _count: { _all: true },
    orderBy: { _count: { countryCode: "desc" } },
    take: 30,
  });
  return groups
    .filter((g) => g.countryCode && g.countryCode !== "ZZ")
    .map((g) => g.countryCode);
}
