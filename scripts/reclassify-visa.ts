/**
 * Backfill: parse visa-sponsorship from every active job's description and set
 * the visaSponsorship boolean (offered=true / not_offered=false / unknown=null).
 * Idempotent. Use it so ?visa_sponsor= filters work on existing rows now,
 * instead of waiting for each source to re-ingest.
 *
 * Usage:
 *   npm run reclassify-visa             # apply
 *   npm run reclassify-visa -- --dry    # preview
 *
 * Same parser the pipeline calls on insert/update (lib/classify/visa.ts).
 */

import "dotenv/config";
import { prisma } from "../lib/db";
import { detectVisaSponsorship, visaSponsorLabel } from "../lib/classify/visa";

(async () => {
  const dryRun = process.argv.includes("--dry");

  const jobs = await prisma.job.findMany({
    where: { isActive: true },
    select: { id: true, descriptionText: true, visaSponsorship: true },
  });

  const updates: { id: string; to: boolean | null }[] = [];
  for (const job of jobs) {
    const next = detectVisaSponsorship(job.descriptionText);
    if (next === job.visaSponsorship) continue;
    updates.push({ id: job.id, to: next });
  }

  const counts = { offered: 0, not_offered: 0, unknown: 0 } as Record<string, number>;
  for (const u of updates) counts[visaSponsorLabel(u.to)]++;

  console.log(`Scanned ${jobs.length} active jobs`);
  console.log(`Would update ${updates.length}:`, counts);

  if (dryRun || updates.length === 0) {
    await prisma.$disconnect();
    return;
  }

  // Group by target value → a handful of bulk updateMany calls instead of
  // 200k+ per-row updates wrapped in short 5s $transaction batches (which hit
  // Prisma's P2028 transaction timeout on the heavily-indexed jobs table).
  const groups = new Map<boolean | null, string[]>();
  for (const u of updates) {
    const arr = groups.get(u.to);
    if (arr) arr.push(u.id);
    else groups.set(u.to, [u.id]);
  }
  let done = 0;
  for (const [to, ids] of groups) {
    for (let i = 0; i < ids.length; i += 1000) {
      const slice = ids.slice(i, i + 1000);
      await prisma.job.updateMany({
        where: { id: { in: slice } },
        data: { visaSponsorship: to },
      });
      done += slice.length;
    }
  }

  console.log(`✓ Updated ${done} rows`);
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
