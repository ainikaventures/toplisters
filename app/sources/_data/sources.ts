import "server-only";
import { prisma } from "@/lib/db";
import { sources as registeredSources } from "@/lib/sources";
import { intervalFor } from "@/lib/jobs/scheduler";

export type Health = "fresh" | "stale" | "silent";

export interface SourceRow {
  name: string;
  displayName: string;
  attribution: string | null;
  providerUrl: string | null;
  jobCount: number;
  lastSeenAt: Date | null;
  cadenceMin: number;
  /**
   * "fresh"  → produced data within ~2× its scheduled cadence
   * "stale"  → has data but no recent run (probably backed off / errored)
   * "silent" → never produced data, or zero active jobs
   */
  health: Health;
}

/**
 * Build the public-facing source-health table for /sources.
 *
 * Health is derived purely from in-DB signals — `lastSeenAt` (set on every
 * pipeline upsert) and the per-source cadence. We don't run live API pings
 * because that would put 10+ extra outbound requests on every page load.
 * Instead: if the most recent active row from a source has lastSeenAt
 * within 2× its cadence, the source is fresh. Older than that = stale
 * (still showing existing rows, but the worker hasn't refreshed lately).
 * Zero active rows = silent.
 */
export async function fetchSourceRows(): Promise<SourceRow[]> {
  const groups = await prisma.job.groupBy({
    by: ["source"],
    where: { isActive: true },
    _count: { _all: true },
    _max: { lastSeenAt: true },
  });

  const byName = new Map<string, { count: number; lastSeen: Date | null }>();
  for (const g of groups) {
    byName.set(g.source, {
      count: g._count._all,
      lastSeen: g._max.lastSeenAt ?? null,
    });
  }

  const now = Date.now();
  const rows: SourceRow[] = registeredSources.map((src) => {
    const stats = byName.get(src.name);
    const jobCount = stats?.count ?? 0;
    const lastSeenAt = stats?.lastSeen ?? null;
    const cadenceMin = intervalFor(src.name);

    let health: Health;
    if (jobCount === 0 || !lastSeenAt) {
      health = "silent";
    } else if (now - lastSeenAt.getTime() < cadenceMin * 60_000 * 2) {
      health = "fresh";
    } else {
      health = "stale";
    }

    return {
      name: src.name,
      displayName: src.displayName,
      attribution: src.attribution ?? null,
      providerUrl: src.providerUrl ?? null,
      jobCount,
      lastSeenAt,
      cadenceMin,
      health,
    };
  });

  // Sort by job count desc — most productive sources first; silents
  // drift to the bottom naturally (count=0 ranks last).
  rows.sort((a, b) => b.jobCount - a.jobCount);
  return rows;
}
