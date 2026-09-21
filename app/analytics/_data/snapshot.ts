import "server-only";
import { prisma } from "@/lib/db";
import type { SnapshotKey } from "@/lib/analytics/rollup";

export interface SnapshotRead<T> {
  payload: T;
  /** How long the rollup took to compute when the worker last built it. */
  computeMs: number;
  rowsScanned: number | null;
  computedAt: Date;
  /** How long *this* request took to read the stored payload. */
  readMs: number;
}

/**
 * Read one precomputed rollup, timing the read.
 *
 * The pair (computeMs, readMs) is what the dashboards show: the cost of
 * building the aggregate versus the cost of serving it from the snapshot.
 * Returns null when the rollup has never been built — the pages render an
 * empty state telling you to run `npm run analytics:refresh`, rather than
 * silently showing zeroes as if the dataset were empty.
 */
export async function readSnapshot<T>(
  key: SnapshotKey,
): Promise<SnapshotRead<T> | null> {
  const startedAt = Date.now();
  let row;
  try {
    row = await prisma.analyticsSnapshot.findUnique({ where: { key } });
  } catch {
    // Table missing (migration not yet applied) or DB blip — degrade to the
    // empty state instead of 500-ing the page.
    return null;
  }
  const readMs = Date.now() - startedAt;
  if (!row) return null;

  return {
    payload: row.payload as T,
    computeMs: row.computeMs,
    rowsScanned: row.rowsScanned,
    computedAt: row.computedAt,
    readMs,
  };
}
