import { aggregateQueue } from "./aggregate";
import { maintenanceQueue } from "./stale";
import { sources } from "@/lib/sources";

/**
 * Default cadence per source, in minutes. Override via env vars like
 * `INTERVAL_MIN_REMOTEOK=15`. Staggering across sources keeps total
 * outbound load steady and avoids thundering-herd at the top of the hour.
 */
const DEFAULT_INTERVAL_MIN: Record<string, number> = {
  remoteok: 60,
  arbeitnow: 60,
  adzuna: 90,
  jooble: 90,
  reed: 60,
  the_muse: 90,
  findwork: 60,
  recruitmentrevolution: 180,
};

/**
 * Optional offsets so registered schedules don't all fire on the same minute.
 * Applied as the `startDate` for each scheduler — BullMQ then continues the
 * `every` cadence from there.
 */
const STAGGER_OFFSET_MIN: Record<string, number> = {
  remoteok: 0,
  arbeitnow: 5,
  adzuna: 10,
  jooble: 15,
  reed: 20,
  the_muse: 25,
  findwork: 30,
  recruitmentrevolution: 35,
};

export function intervalFor(sourceName: string): number {
  const envKey = `INTERVAL_MIN_${sourceName.toUpperCase()}`;
  const fromEnv = Number.parseInt(process.env[envKey] ?? "", 10);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return DEFAULT_INTERVAL_MIN[sourceName] ?? 60;
}

/**
 * Idempotently register the production schedule. BullMQ's `upsertJobScheduler`
 * replaces an existing scheduler with the same id, so re-running this on
 * worker boot keeps things in sync with code changes.
 */
export async function registerSchedules(): Promise<void> {
  const summary: { id: string; everyMin: number }[] = [];

  for (const source of sources) {
    const everyMin = intervalFor(source.name);
    const offsetMs = (STAGGER_OFFSET_MIN[source.name] ?? 0) * 60 * 1000;
    const schedulerId = `aggregate:${source.name}`;
    await aggregateQueue.upsertJobScheduler(
      schedulerId,
      { every: everyMin * 60 * 1000, startDate: new Date(Date.now() + offsetMs) },
      {
        name: "aggregate",
        data: { sourceName: source.name },
      },
    );
    summary.push({ id: schedulerId, everyMin });
  }

  // Daily stale-marking at 03:15 UTC (off-peak for most regions we serve).
  await maintenanceQueue.upsertJobScheduler(
    "maintenance:mark-stale",
    { pattern: "15 3 * * *" },
    { name: "mark-stale" },
  );
  summary.push({ id: "maintenance:mark-stale", everyMin: 24 * 60 });

  // Daily digest emails at 09:00 UTC. Aimed roughly at the start of the
  // London / European working day; the runDigest internal throttle (20 h
  // gap) prevents accidental double-sends if the scheduler ever fires
  // twice. Subscribers with no new matching jobs are silently skipped.
  await maintenanceQueue.upsertJobScheduler(
    "maintenance:send-digests",
    { pattern: "0 9 * * *" },
    { name: "send-digests" },
  );
  summary.push({ id: "maintenance:send-digests", everyMin: 24 * 60 });

  // Social auto-posting fires three times a day (08:30, 12:30, 17:30
  // UTC — morning EU, mid-EU/morning-US, end-of-EU-day). Each tick
  // picks one job per enabled platform, so the default daily caps
  // (FB:3, Telegram:5, Twitter:3) line up with this cadence. A
  // platform with no creds (SOCIAL_*_ENABLED!=1) is a silent no-op,
  // so this schedule is safe to register before any tokens exist.
  await maintenanceQueue.upsertJobScheduler(
    "maintenance:post-to-social",
    { pattern: "30 8,12,17 * * *" },
    { name: "post-to-social" },
  );
  summary.push({ id: "maintenance:post-to-social", everyMin: 8 * 60 });

  // Daily company-directory rebuild at 04:30 UTC (after the stale sweep, so it
  // aggregates only live jobs).
  await maintenanceQueue.upsertJobScheduler(
    "maintenance:rebuild-companies",
    { pattern: "30 4 * * *" },
    { name: "rebuild-companies" },
  );
  summary.push({ id: "maintenance:rebuild-companies", everyMin: 24 * 60 });

  // Daily UK Licensed-Sponsor refresh at 05:30 UTC — gov.uk republishes the
  // register on business mornings, so we pick it up after. Re-tags every
  // active GB employer (Task 8). Safe to run repeatedly (idempotent).
  await maintenanceQueue.upsertJobScheduler(
    "maintenance:refresh-sponsors",
    { pattern: "30 5 * * *" },
    { name: "refresh-sponsors" },
  );
  summary.push({ id: "maintenance:refresh-sponsors", everyMin: 24 * 60 });

  console.log("Schedules registered:");
  for (const { id, everyMin } of summary) {
    console.log(`  ${id} → every ${everyMin} min`);
  }
}
