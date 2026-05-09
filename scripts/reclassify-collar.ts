/**
 * Backfill: re-run the collar-type classifier over every active job and
 * update the rows whose label changes. Idempotent — running it twice
 * does nothing the second time.
 *
 * Usage:
 *   npm run reclassify-collar             # apply
 *   npm run reclassify-collar -- --dry    # preview without writing
 *
 * The classifier is the same one the aggregation pipeline calls on
 * insert/update going forward (lib/classify/collar.ts), so this just
 * catches up the rows that landed before the classifier existed.
 */

import "dotenv/config";
import { prisma } from "../lib/db";
import { classifyCollar } from "../lib/classify/collar";

(async () => {
  const dryRun = process.argv.includes("--dry");

  const jobs = await prisma.job.findMany({
    where: { isActive: true },
    select: { id: true, title: true, category: true, collarType: true, source: true },
  });

  const transitions: Record<string, number> = {};
  const updates: { id: string; from: string; to: string }[] = [];

  for (const job of jobs) {
    // The "hint" passed to the classifier is what the source originally
    // produced for the row — we can't recover that from the DB without
    // ambiguity, so we use the current collar as the fallback. That makes
    // a fully-classified-as-"white" RemoteOK row stay white when the
    // title doesn't match anything specific (correct), and an "unknown"
    // Reed row stay unknown when no patterns hit (also correct).
    const next = classifyCollar({
      title: job.title,
      category: job.category,
      hint: job.collarType,
    });
    if (next === job.collarType) continue;
    const key = `${job.collarType} → ${next}`;
    transitions[key] = (transitions[key] ?? 0) + 1;
    updates.push({ id: job.id, from: job.collarType, to: next });
  }

  console.log(`Scanned ${jobs.length} active jobs`);
  console.log(`Would update ${updates.length}`);
  for (const [k, count] of Object.entries(transitions)) {
    console.log(`  ${k}: ${count}`);
  }

  if (dryRun || updates.length === 0) {
    await prisma.$disconnect();
    return;
  }

  // Update in batches to avoid one giant transaction. 50 is plenty for a
  // few hundred rows; raise if backfilling 100k+.
  const BATCH = 50;
  for (let i = 0; i < updates.length; i += BATCH) {
    const chunk = updates.slice(i, i + BATCH);
    await prisma.$transaction(
      chunk.map((u) =>
        prisma.job.update({
          where: { id: u.id },
          data: { collarType: u.to as never },
        }),
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
