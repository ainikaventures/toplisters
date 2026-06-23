import { prisma } from "@/lib/db";
import { computeVisaPathways } from "@/lib/classify/visa-pathways";

/**
 * Recompute the flexible_visa + visa_schemes FILTER columns for active jobs
 * (Task 9). The API computes the rich visa_pathways array fresh on read; these
 * columns exist only so ?flexible_visa / ?visa_scheme can filter + paginate in
 * SQL. Idempotent; only writes rows whose tags changed.
 *
 * Run daily (the worker schedules it after the sponsor refresh, since UK
 * pathways depend on Task-8 sponsor data) and as a post-deploy backfill.
 */

export interface VisaPathwayRecomputeStats {
  scanned: number;
  flexible: number;
  updated: number;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

export async function recomputeVisaPathways(): Promise<VisaPathwayRecomputeStats> {
  const jobs = await prisma.job.findMany({
    where: { isActive: true },
    select: {
      id: true,
      countryCode: true,
      salaryMin: true,
      salaryMax: true,
      salaryCurrency: true,
      salaryPeriod: true,
      employerLicensedSponsor: true,
      sponsorRoutes: true,
      flexibleVisa: true,
      visaSchemes: true,
    },
  });

  let flexible = 0;
  const updates: { id: string; flexibleVisa: boolean; visaSchemes: string[] }[] = [];
  for (const j of jobs) {
    const r = computeVisaPathways(j);
    if (r.flexible_visa) flexible++;
    if (r.flexible_visa !== j.flexibleVisa || !sameSet(r.schemes, j.visaSchemes)) {
      updates.push({ id: j.id, flexibleVisa: r.flexible_visa, visaSchemes: r.schemes });
    }
  }

  const BATCH = 50;
  for (let i = 0; i < updates.length; i += BATCH) {
    await prisma.$transaction(
      updates.slice(i, i + BATCH).map((u) =>
        prisma.job.update({
          where: { id: u.id },
          data: { flexibleVisa: u.flexibleVisa, visaSchemes: u.visaSchemes },
        }),
      ),
    );
  }

  return { scanned: jobs.length, flexible, updated: updates.length };
}
