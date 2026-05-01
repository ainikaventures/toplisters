/**
 * One-shot pipeline runner: fetch → normalize → geocode → dedupe → upsert.
 *
 * Usage:
 *   npm run source -- remoteok            # run a specific source
 *   npm run source -- remoteok --limit 5  # cap how many normalized jobs are processed
 *
 * This is the dev/debug entrypoint. Step 5 wraps the same logic in a BullMQ
 * worker with retries, rate limits, and per-source schedules.
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { geocode } from "../lib/geocoding/lookup";
import { getSource } from "../lib/sources";
import { computeDedupeHash } from "../lib/sources/utils";
import type { NormalizedJob } from "../lib/sources/types";

const UNKNOWN_COUNTRY = "ZZ";

interface RunStats {
  fetched: number;
  inserted: number;
  updated: number;
  crossSourceDupes: number;
  skippedNoLocation: number;
}

async function run(sourceName: string, limit: number | null): Promise<RunStats> {
  const source = getSource(sourceName);
  if (!source) throw new Error(`Unknown source: ${sourceName}`);
  if (!source.isEnabled()) throw new Error(`Source disabled via env: ${sourceName}`);

  console.log(`→ Fetching ${source.displayName}…`);
  const raw = await source.fetch();
  const normalized = source.normalize(raw);
  const slice = limit ? normalized.slice(0, limit) : normalized;
  console.log(`✓ Normalized ${normalized.length} jobs${limit ? ` (processing first ${slice.length})` : ""}`);

  const stats: RunStats = {
    fetched: slice.length,
    inserted: 0,
    updated: 0,
    crossSourceDupes: 0,
    skippedNoLocation: 0,
  };
  const now = new Date();

  for (const job of slice) {
    const geo = await geocode(job.locationText);

    // Spec lets us anchor remote jobs to a country if one was named (e.g.
    // "Remote, UK"); pure-worldwide remotes have no coords yet (we'll cluster
    // those separately when the globe gains a "worldwide" overlay). For now,
    // skip rather than pin them to (0, 0).
    if (!geo) {
      stats.skippedNoLocation++;
      continue;
    }

    const dedupeHash = computeDedupeHash(
      job.title,
      job.companyName,
      geo.countryCode ?? UNKNOWN_COUNTRY,
      geo.city,
    );

    // Cross-source dedupe: if any job already has this hash (regardless of
    // source), treat it as the same job — bump lastSeenAt + reactivate.
    const byHash = await prisma.job.findUnique({ where: { dedupeHash } });
    if (byHash) {
      if (byHash.source !== source.name) stats.crossSourceDupes++;
      await prisma.job.update({
        where: { id: byHash.id },
        data: { lastSeenAt: now, isActive: true },
      });
      stats.updated++;
      continue;
    }

    // Same-source upsert by (source, sourceId): a re-run that finds the same
    // posting (e.g. title edited so dedupeHash changed) updates in place.
    await prisma.job.upsert({
      where: {
        source_sourceId: { source: source.name, sourceId: job.sourceId },
      },
      create: {
        ...stripExtras(job),
        countryCode: geo.countryCode ?? UNKNOWN_COUNTRY,
        region: geo.region,
        city: geo.city,
        lat: geo.lat,
        lng: geo.lng,
        dedupeHash,
        lastSeenAt: now,
        isActive: true,
      },
      update: {
        title: job.title,
        companyName: job.companyName,
        companyDomain: job.companyDomain,
        locationText: job.locationText,
        applyUrl: job.applyUrl,
        descriptionHtml: job.descriptionHtml,
        descriptionText: job.descriptionText,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        salaryCurrency: job.salaryCurrency,
        salaryPeriod: job.salaryPeriod,
        skills: job.skills,
        benefits: job.benefits,
        countryCode: geo.countryCode ?? UNKNOWN_COUNTRY,
        region: geo.region,
        city: geo.city,
        lat: geo.lat,
        lng: geo.lng,
        dedupeHash,
        lastSeenAt: now,
        isActive: true,
      },
    });
    stats.inserted++;
  }

  return stats;
}

// Drop fields we set explicitly in the upsert create branch.
function stripExtras(j: NormalizedJob) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { ...rest } = j;
  return rest;
}

(async () => {
  const args = process.argv.slice(2);
  const sourceName = args.find((a) => !a.startsWith("--"));
  const limitArg = args.indexOf("--limit");
  const limit = limitArg >= 0 ? Number.parseInt(args[limitArg + 1] ?? "", 10) : null;

  if (!sourceName) {
    console.error("Usage: npm run source -- <source-name> [--limit N]");
    process.exit(1);
  }

  const start = Date.now();
  const stats = await run(sourceName, Number.isFinite(limit) ? limit : null);
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
