/**
 * Refresh the UK Licensed-Sponsor enrichment (Task 8).
 *
 * Downloads the current gov.uk Register of Licensed Sponsors (Workers) and tags
 * every active GB job's employer with whether it's on the register, the
 * sponsorship routes, and the rating. gov.uk republishes ~every business day —
 * run this DAILY (the worker also schedules it; see DEPLOY.md).
 *
 * Usage:
 *   npm run sponsors:refresh             # apply
 *   npm run sponsors:refresh -- --dry    # fetch + match, report, no writes
 */

import "dotenv/config";
import { prisma } from "../lib/db";
import { runSponsorRefresh } from "../lib/sponsors/refresh";

(async () => {
  const dryRun = process.argv.includes("--dry");
  console.log("Fetching gov.uk register + matching GB employers…");
  const s = await runSponsorRefresh({ dryRun });

  console.log(`  register rows:          ${s.registerRows.toLocaleString()}`);
  console.log(`  distinct organisations: ${s.organisations.toLocaleString()}`);
  console.log(`  GB companies checked:   ${s.companiesChecked.toLocaleString()}`);
  console.log(
    `  licensed: ${s.licensed} (high ${s.high} / medium ${s.medium} / low ${s.low}) · unlisted: ${s.unlisted}`,
  );
  if (dryRun) console.log("(dry run — no rows written)");
  else console.log(`✓ Updated ${s.jobsUpdated.toLocaleString()} job rows`);

  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
