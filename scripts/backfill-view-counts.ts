/**
 * Rebuild Job.viewCount from the pageviews table.
 *
 *   npm run backfill:view-counts            # apply
 *   npm run backfill:view-counts -- --dry   # report only
 *
 * viewCount is a counter cache maintained by /api/track. Pageview rows are
 * the source of truth, so this recomputes the column from scratch — run it
 * once after deploying the counter (existing history predates it), and any
 * time you suspect drift.
 *
 * Idempotent: it SETs absolute counts rather than incrementing, so running
 * it twice is a no-op rather than a doubling.
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { jobIdFromPath } from "../lib/analytics/job-path";

const DRY = process.argv.includes("--dry");

async function main() {
  // Distinct job paths with their view totals. Grouping in SQL keeps this
  // to one scan even when pageviews is large.
  const rows = await prisma.$queryRaw<{ path: string; views: bigint }[]>`
    SELECT path, COUNT(*)::bigint AS views
    FROM pageviews
    WHERE path LIKE '/job/%'
    GROUP BY path
  `;

  // Several paths can map to one job (slug changed, or /job/<id> with no
  // slug), so fold them together before writing.
  const byJob = new Map<string, number>();
  let unparsed = 0;
  for (const r of rows) {
    const id = jobIdFromPath(r.path);
    if (!id) {
      unparsed++;
      continue;
    }
    byJob.set(id, (byJob.get(id) ?? 0) + Number(r.views));
  }

  console.log(
    `${rows.length} distinct job paths → ${byJob.size} jobs` +
      (unparsed ? ` (${unparsed} paths unparseable, skipped)` : ""),
  );

  if (DRY) {
    const top = [...byJob.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    console.log("\nTop 10 by views (dry run, nothing written):");
    for (const [id, views] of top) console.log(`  ${id}  ${views}`);
    return;
  }

  // Zero everything first so jobs whose pageviews were pruned don't keep a
  // stale count. Single UPDATE, no per-row round trip.
  const cleared = await prisma.job.updateMany({
    where: { viewCount: { not: 0 } },
    data: { viewCount: 0 },
  });

  let updated = 0;
  const entries = [...byJob.entries()];
  for (let i = 0; i < entries.length; i += 200) {
    const chunk = entries.slice(i, i + 200);
    const results = await prisma.$transaction(
      chunk.map(([id, views]) =>
        prisma.job.updateMany({ where: { id }, data: { viewCount: views } }),
      ),
    );
    updated += results.reduce((a, r) => a + r.count, 0);
  }

  console.log(
    `cleared ${cleared.count} stale counters, wrote ${updated} job view counts` +
      (updated < byJob.size
        ? ` (${byJob.size - updated} referenced jobs no longer exist)`
        : ""),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
