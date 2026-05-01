/**
 * One-shot pipeline runner. Useful for ad-hoc dev runs and CI smoke tests.
 *
 * Usage:
 *   npm run source -- remoteok            # full feed
 *   npm run source -- remoteok --limit 5  # cap to first N normalised jobs
 *
 * The same fetch→normalize→geocode→dedupe→upsert flow runs in production
 * via the BullMQ worker (lib/jobs/aggregate.ts) — both call into
 * `runAggregation` from lib/sources/pipeline.ts.
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { getSource } from "../lib/sources";
import { runAggregation } from "../lib/sources/pipeline";

(async () => {
  const args = process.argv.slice(2);
  const sourceName = args.find((a) => !a.startsWith("--"));
  const limitArg = args.indexOf("--limit");
  const limit = limitArg >= 0 ? Number.parseInt(args[limitArg + 1] ?? "", 10) : NaN;

  if (!sourceName) {
    console.error("Usage: npm run source -- <source-name> [--limit N]");
    process.exit(1);
  }

  const source = getSource(sourceName);
  if (!source) {
    console.error(`Unknown source: ${sourceName}`);
    process.exit(1);
  }
  if (!source.isEnabled()) {
    console.error(`Source disabled via env: ${sourceName}`);
    process.exit(1);
  }

  console.log(`→ Fetching ${source.displayName}…`);
  const start = Date.now();
  const stats = await runAggregation(source, {
    limit: Number.isFinite(limit) ? limit : undefined,
  });
  const seconds = ((Date.now() - start) / 1000).toFixed(1);

  console.log(
    `✓ Done in ${seconds}s · fetched=${stats.fetched} inserted=${stats.inserted} updated=${stats.updated} skipped_no_location=${stats.skippedNoLocation} cross_source_dupes=${stats.crossSourceDupes}`,
  );

  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
