/**
 * Recompute the analytics rollups in analytics_snapshots.
 *
 *   npm run analytics:refresh
 *
 * Normally fired by the worker scheduler ("refresh-analytics", daily at
 * 06:00 UTC — after the stale sweep and company rebuild so it aggregates
 * a settled dataset). Run it by hand right after a deploy to populate the
 * table without waiting for the schedule; the dashboards render an
 * empty-state until it has run at least once.
 */
import "dotenv/config";
import { refreshAnalyticsSnapshots } from "../lib/analytics/rollup";

async function main() {
  const started = Date.now();
  const results = await refreshAnalyticsSnapshots();

  console.log("Analytics snapshots refreshed:");
  for (const r of results) {
    const rows = r.rowsScanned === null ? "?" : r.rowsScanned.toLocaleString();
    console.log(`  ${r.key.padEnd(16)} ${String(r.computeMs).padStart(6)} ms  (${rows} rows)`);
  }
  console.log(`  total            ${String(Date.now() - started).padStart(6)} ms`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
