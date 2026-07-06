/**
 * Rebuild the company directory from active jobs.
 *
 * Usage:  npm run rebuild-companies
 *
 * The worker also runs this daily; use this to populate immediately after
 * deploy (run it AFTER an aggregation cycle so there are jobs to aggregate).
 */

import "dotenv/config";
import { prisma } from "../lib/db";
import { rebuildCompanies } from "../lib/companies/rebuild";

(async () => {
  const s = await rebuildCompanies();
  console.log(
    `Scanned ${s.jobs.toLocaleString()} active jobs → ${s.companies.toLocaleString()} companies (pruned ${s.pruned}).`,
  );
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
