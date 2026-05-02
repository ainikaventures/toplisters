import "server-only";
import { prisma } from "@/lib/db";
import type { Job } from "@/lib/generated/prisma/client";

/**
 * Spec line 154: "Similar jobs" — same category + same/nearby country.
 *
 * Phase-1 simplification: any active job sharing either the category OR the
 * country of the source job, ordered by recency. We oversample to 8 so the
 * UI can show a tidy two-row strip; the caller can slice further. A more
 * sophisticated relevance score (category-and-country > category > country)
 * is a future tweak — bundling both as an OR keeps the query indexable
 * via the existing (category, is_active) and (country_code, is_active)
 * composite indexes.
 */
export async function fetchSimilarJobs(currentJob: Job, take = 8): Promise<Job[]> {
  return prisma.job.findMany({
    where: {
      id: { not: currentJob.id },
      isActive: true,
      OR: [
        { category: currentJob.category },
        { countryCode: currentJob.countryCode },
      ],
    },
    orderBy: { postedDate: "desc" },
    take,
  });
}
