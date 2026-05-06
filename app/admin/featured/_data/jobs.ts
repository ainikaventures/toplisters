import "server-only";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import type { Job } from "@/lib/generated/prisma/client";

export const PAGE_SIZE = 20;

export interface AdminJobListResult {
  jobs: Job[];
  total: number;
  featuredCount: number;
}

/**
 * Listing for /admin/featured. Featured jobs always come first regardless
 * of search filter — the admin needs to be able to see and unfeature
 * something even when typing an unrelated search. After that, ordering is
 * by recency.
 */
export async function fetchAdminJobs(args: {
  search: string | null;
  page: number;
}): Promise<AdminJobListResult> {
  const where: Prisma.JobWhereInput = { isActive: true };
  if (args.search) {
    where.OR = [
      { title: { contains: args.search, mode: "insensitive" } },
      { companyName: { contains: args.search, mode: "insensitive" } },
    ];
  }

  const [total, featuredCount, jobs] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.count({ where: { isActive: true, isFeatured: true } }),
    prisma.job.findMany({
      where,
      orderBy: [{ isFeatured: "desc" }, { postedDate: "desc" }],
      take: PAGE_SIZE,
      skip: (args.page - 1) * PAGE_SIZE,
    }),
  ]);

  return { jobs, total, featuredCount };
}
