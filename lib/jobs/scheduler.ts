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
};

function intervalFor(sourceName: string): number {
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

  console.log("Schedules registered:");
  for (const { id, everyMin } of summary) {
    console.log(`  ${id} → every ${everyMin} min`);
  }
}
