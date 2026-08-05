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

  // Descriptions are needed for the model stage, and 280k full bodies will
  // not fit in memory — page through by id and truncate to the 1,500 chars
  // the model actually reads.
  const updates: { id: string; from: string; to: string }[] = [];
  let scanned = 0;
  let before = 0;
  let after = 0;
  let cursor: string | null = null;

  for (;;) {
    const page: { id: string; title: string; category: string; descr: string | null }[] =
      await prisma.$queryRaw`
        SELECT id, title, category, left(description_text, 1500) AS descr
        FROM jobs
        WHERE is_active AND (${cursor}::text IS NULL OR id > ${cursor})
        ORDER BY id
        LIMIT 5000
      `;
    if (page.length === 0) break;
    cursor = page[page.length - 1].id;

    for (const job of page) {
      scanned++;
      if (job.category === OTHER_CATEGORY) before++;
      const next = classifyCategory({
        title: job.title,
        category: job.category,
        description: job.descr,
      });
      if (next === OTHER_CATEGORY) after++;
      if (next === job.category) continue;
      updates.push({ id: job.id, from: job.category, to: next });
    }
  }
  const jobs = { length: scanned };

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

  const BATCH = 50;
  for (let i = 0; i < updates.length; i += BATCH) {
    const chunk = updates.slice(i, i + BATCH);
    await prisma.$transaction(
      chunk.map((u) =>
        prisma.job.update({ where: { id: u.id }, data: { category: u.to } }),
      ),
    );
  }

  console.log(`✓ Updated ${updates.length} rows`);
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
