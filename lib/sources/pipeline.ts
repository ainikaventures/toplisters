import { prisma } from "@/lib/db";
import { geocode } from "@/lib/geocoding/lookup";
import { resolveCompanyLogo } from "@/lib/logos";
import { classifyCollar } from "@/lib/classify/collar";
import { classifyCategory } from "@/lib/classify/category";
import { detectVisaSponsorship } from "@/lib/classify/visa";
import { computeDedupeHash } from "./utils";
import { sourceType } from "@/lib/api/sources";
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
  let geo = await geocode(job.locationText);

  // No resolvable country. If the role is clearly remote/worldwide, keep it
  // (country ZZ, no coordinates) rather than dropping it — recovering a whole
  // class of remote jobs the pipeline used to discard. Truly unparseable
  // non-remote locations are still skipped as likely bad data.
  if (!geo) {
    const isRemote =
      job.workMode === "remote" ||
      /\b(remote|worldwide|anywhere|distributed|global)\b/i.test(job.locationText);
    if (!isRemote) {
      stats.skippedNoLocation++;
      return;
    }
    geo = { countryCode: null, region: null, city: null, lat: 0, lng: 0 };
  }

  // Logo fallback: if the source didn't ship a logo URL (RemoteOK no longer
  // does), look it up by company name via Logo.dev. Cached server-side, so
  // each unique company costs at most one API call per ~30 days.
  const companyLogoUrl =
    job.companyLogoUrl ?? (await resolveCompanyLogo(job.companyName));

  // Re-classify collar type from title + category. Adapters that hardcode
  // "white" (RemoteOK, Arbeitnow, The Muse, etc.) keep their default for
  // ambiguous titles; mixed sources like Reed (which hint "unknown") get
  // promoted to "blue" / "white" when the title clearly matches.
  const collarType = classifyCollar({
    title: job.title,
    category: job.category,
    hint: job.collarType,
  });

  // Normalise the free-text source category onto our canonical taxonomy so
  // the analytics/category facets don't fragment into a big "Other" bucket.
  const category = classifyCategory({ title: job.title, category: job.category });

  // Visa-sponsorship signal parsed from the description (offered/not/unknown),
  // stored in the visaSponsorship boolean. Prefer a non-null adapter hint.
  const visaSponsorship = job.visaSponsorship ?? detectVisaSponsorship(job.descriptionText);

  const dedupeHash = computeDedupeHash(
    job.title,
    job.companyName,
    geo.countryCode ?? UNKNOWN_COUNTRY,
    geo.city,
  );

  const byHash = await prisma.job.findUnique({ where: { dedupeHash } });
  if (byHash) {
    if (byHash.source !== sourceName) stats.crossSourceDupes++;
    // Don't downgrade descriptions on re-fetch. Adzuna's enrichment pass
    // only fires on the N newest items per run, so a job enriched on
    // cycle T may not be enriched on T+1 — without this guard, the
    // longer description would be silently overwritten by the snippet.
    // Same 1.5× threshold the adapter uses to gate enrichment: if the
    // existing description is meaningfully longer, keep it. Same rule
    // protects companyDomain (Adzuna only resolves it via enrichment).
    const keepExistingDescription =
      byHash.descriptionHtml.length > job.descriptionHtml.length * 1.5;

    // Direct-source precedence: when the same job reaches us from both a
    // direct employer/ATS source and an aggregator (Adzuna/Reed/Jooble/…),
    // prefer the direct apply link — our medium over the wrapper.
    const incomingDirect = sourceType(sourceName) === "direct";
    const existingDirect = sourceType(byHash.source) === "direct";
    // aggregator → direct: adopt the direct source + its real apply link.
    const upgradeToDirect = incomingDirect && !existingDirect;
    // direct already owns it, an aggregator is re-reporting: keep the direct
    // source, apply link, and description — don't let the wrapper clobber them.
    const protectDirect = existingDirect && !incomingDirect;

    // Adopt the direct source's identity on an upgrade so it owns the row —
    // unless a row already holds (source, sourceId) (a rare hash-drift case),
    // which would collide on the unique constraint. Then keep the direct apply
    // link but leave the row's identity as-is.
    let adopt = upgradeToDirect;
    if (adopt) {
      const owner = await prisma.job.findUnique({
        where: { source_sourceId: { source: sourceName, sourceId: job.sourceId } },
        select: { id: true },
      });
      if (owner && owner.id !== byHash.id) adopt = false;
    }

    await prisma.job.update({
      where: { id: byHash.id },
      data: {
        title: job.title,
        companyName: job.companyName,
        companyDomain: job.companyDomain ?? byHash.companyDomain,
        companyLogoUrl,
        locationText: job.locationText,
        applyUrl: protectDirect ? byHash.applyUrl : job.applyUrl,
        ...(adopt ? { source: sourceName, sourceId: job.sourceId } : {}),
        descriptionHtml:
          protectDirect || keepExistingDescription ? byHash.descriptionHtml : job.descriptionHtml,
        descriptionText:
          protectDirect || keepExistingDescription ? byHash.descriptionText : job.descriptionText,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        salaryCurrency: job.salaryCurrency,
        salaryPeriod: job.salaryPeriod,
        skills: job.skills,
        benefits: job.benefits,
        collarType,
        category,
        visaSponsorship,
        countryCode: geo.countryCode ?? UNKNOWN_COUNTRY,
        region: geo.region,
        city: geo.city,
        lat: geo.lat,
        lng: geo.lng,
        lastSeenAt: now,
        isActive: true,
      },
    });
    stats.updated++;
    return;
  }

  await prisma.job.upsert({
    where: { source_sourceId: { source: sourceName, sourceId: job.sourceId } },
    create: {
      ...job,
      collarType,
      category,
      visaSponsorship,
      companyLogoUrl,
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
      companyLogoUrl,
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
      collarType,
      category,
      visaSponsorship,
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
