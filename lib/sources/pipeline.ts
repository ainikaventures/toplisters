import { prisma } from "@/lib/db";
import { geocode } from "@/lib/geocoding/lookup";
import { computeDedupeHash } from "./utils";
import type { JobSource, NormalizedJob } from "./types";

const UNKNOWN_COUNTRY = "ZZ";

export interface RunStats {
  fetched: number;
  inserted: number;
  updated: number;
  crossSourceDupes: number;
  skippedNoLocation: number;
}

export interface RunOptions {
  limit?: number;
}

/**
 * Fetch → normalize → geocode → dedupe → upsert. Shared by:
 *  - `scripts/run-source.ts` (one-shot manual run)
 *  - `lib/jobs/aggregate.ts` (BullMQ scheduled worker)
 *
 * Cross-source dedupe is by `dedupe_hash`; an existing match (regardless of
 * source) just bumps `lastSeenAt` + reactivates. Same-source idempotency is
 * handled by upserting on the (source, source_id) composite unique.
 */
export async function runAggregation(
  source: JobSource,
  options: RunOptions = {},
): Promise<RunStats> {
  const raw = await source.fetch();
  const normalized = source.normalize(raw);
  const slice = options.limit ? normalized.slice(0, options.limit) : normalized;

  const stats: RunStats = {
    fetched: slice.length,
    inserted: 0,
    updated: 0,
    crossSourceDupes: 0,
    skippedNoLocation: 0,
  };
  const now = new Date();

  for (const job of slice) {
    await processJob(source.name, job, now, stats);
  }

  return stats;
}

async function processJob(
  sourceName: string,
  job: NormalizedJob,
  now: Date,
  stats: RunStats,
): Promise<void> {
  const geo = await geocode(job.locationText);

  // Pure-worldwide remotes with no resolvable country are skipped here
  // rather than pinned to (0, 0); a "worldwide" globe overlay will pick
  // them up in a later step.
  if (!geo) {
    stats.skippedNoLocation++;
    return;
  }

  const dedupeHash = computeDedupeHash(
    job.title,
    job.companyName,
    geo.countryCode ?? UNKNOWN_COUNTRY,
    geo.city,
  );

  const byHash = await prisma.job.findUnique({ where: { dedupeHash } });
  if (byHash) {
    if (byHash.source !== sourceName) stats.crossSourceDupes++;
    await prisma.job.update({
      where: { id: byHash.id },
      data: { lastSeenAt: now, isActive: true },
    });
    stats.updated++;
    return;
  }

  await prisma.job.upsert({
    where: { source_sourceId: { source: sourceName, sourceId: job.sourceId } },
    create: {
      ...job,
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
