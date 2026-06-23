/**
 * Backfill / refresh the flexible_visa + visa_schemes filter columns (Task 9).
 *
 * Usage:
 *   npm run visa-pathways:refresh
 *
 * The worker also runs this daily after the sponsor refresh; use this for an
 * immediate populate after deploy (run it AFTER `npm run sponsors:refresh` so
 * UK Scale-up / Skilled Worker pathways pick up the licence data).
 */

import "dotenv/config";
import { prisma } from "../lib/db";
import { recomputeVisaPathways } from "../lib/jobs/recompute-visa-pathways";

(async () => {
  const s = await recomputeVisaPathways();
  console.log(
    `Scanned ${s.scanned.toLocaleString()} active jobs · flexible_visa: ${s.flexible.toLocaleString()} · updated ${s.updated.toLocaleString()} rows`,
  );
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
