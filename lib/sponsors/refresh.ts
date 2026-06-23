import { prisma } from "@/lib/db";
import { fetchRegisterRows } from "./register";
import { buildSponsorIndex, matchEmployer } from "./match";

/**
 * Core of the UK Licensed-Sponsor refresh (Task 8). Shared by the
 * `sponsors:refresh` script and the daily maintenance worker.
 *
 * Downloads the gov.uk register, builds the match index, and tags every active
 * GB job's employer. Matches by DISTINCT company name (far fewer than jobs) and
 * bulk-updates per company.
 */

export interface SponsorRefreshStats {
  registerRows: number;
  organisations: number;
  companiesChecked: number;
  licensed: number;
  unlisted: number;
  high: number;
  medium: number;
  low: number;
  jobsUpdated: number;
}

export async function runSponsorRefresh(
  opts: { dryRun?: boolean } = {},
): Promise<SponsorRefreshStats> {
  const rows = await fetchRegisterRows();
  const index = buildSponsorIndex(rows);

  const companies = await prisma.job.findMany({
    where: { isActive: true, countryCode: "GB" },
    distinct: ["companyName"],
    select: { companyName: true },
  });

  const stats: SponsorRefreshStats = {
    registerRows: rows.length,
    organisations: index.size,
    companiesChecked: companies.length,
    licensed: 0,
    unlisted: 0,
    high: 0,
    medium: 0,
    low: 0,
    jobsUpdated: 0,
  };
  const now = new Date();

  for (const { companyName } of companies) {
    const m = matchEmployer(index, companyName);
    if (m.licensed) {
      stats.licensed++;
      if (m.confidence) stats[m.confidence]++;
    } else {
      stats.unlisted++;
    }
    if (opts.dryRun) continue;
    const res = await prisma.job.updateMany({
      where: { companyName, countryCode: "GB", isActive: true },
      data: {
        employerLicensedSponsor: m.licensed,
        sponsorRoutes: m.routes,
        sponsorRating: m.rating,
        sponsorMatchConfidence: m.confidence,
        sponsorCheckedAt: now,
      },
    });
    stats.jobsUpdated += res.count;
  }

  return stats;
}
