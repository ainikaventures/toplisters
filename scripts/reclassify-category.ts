/**
 * Backfill: re-run the category classifier over every active job and update
 * the rows whose category changes. Idempotent — running it twice does nothing
 * the second time. Use it to fix the existing "Other" pile-up immediately,
 * instead of waiting for each source to re-ingest.
 *
 * Usage:
 *   npm run reclassify-category             # apply
 *   npm run reclassify-category -- --dry    # preview without writing
 *
 * Same classifier the aggregation pipeline now calls on insert/update
 * (lib/classify/category.ts).
 */

import "dotenv/config";
import { prisma } from "../lib/db";
import { classifyCategory, OTHER_CATEGORY } from "../lib/classify/category";

(async () => {
  const dryRun = process.argv.includes("--dry");

  const jobs = await prisma.job.findMany({
    where: { isActive: true },
    select: { id: true, title: true, category: true },
  });

  const updates: { id: string; from: string; to: string }[] = [];
  for (const job of jobs) {
    const next = classifyCategory({ title: job.title, category: job.category });
    if (next === job.category) continue;
    updates.push({ id: job.id, from: job.category, to: next });
  }

  const before = jobs.filter((j) => j.category === OTHER_CATEGORY).length;
  const after = jobs.length - jobs.filter((j) => {
    const next = classifyCategory({ title: j.title, category: j.category });
    return next !== OTHER_CATEGORY;
  }).length;

  const newCounts: Record<string, number> = {};
  for (const u of updates) newCounts[u.to] = (newCounts[u.to] ?? 0) + 1;

  console.log(`Scanned ${jobs.length} active jobs`);
  console.log(`Would update ${updates.length}`);
  console.log(`"Other" rows: ${before} → ${after}`);
  console.log("Top destinations:");
  for (const [k, v] of Object.entries(newCounts).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${k}: ${v}`);
  }

  if (dryRun || updates.length === 0) {
    await prisma.$disconnect();
    return;
  }

  // Apply grouped by target category via updateMany, so the whole backfill is
  // a few dozen bulk UPDATEs instead of 200k+ per-row updates wrapped in short
  // 5s $transaction batches (which hit Prisma's P2028 transaction timeout on
  // the heavily-indexed jobs table).
  const byTarget = new Map<string, string[]>();
  for (const u of updates) {
    const arr = byTarget.get(u.to);
    if (arr) arr.push(u.id);
    else byTarget.set(u.to, [u.id]);
  }
  let done = 0;
  for (const [to, ids] of byTarget) {
    for (let i = 0; i < ids.length; i += 1000) {
      const slice = ids.slice(i, i + 1000);
      await prisma.job.updateMany({
        where: { id: { in: slice } },
        data: { category: to },
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
