/**
 * Manual job-enqueueing for debugging. Adds a one-off aggregate job to the
 * BullMQ queue; a running worker (`npm run worker`) will pick it up.
 *
 * Usage:
 *   npm run enqueue -- remoteok
 *   npm run enqueue -- mark-stale          # maintenance task
 */
import "dotenv/config";
import { aggregateQueue } from "../lib/jobs/aggregate";
import { maintenanceQueue } from "../lib/jobs/stale";
import { redis } from "../lib/jobs/queue";
import { getSource } from "../lib/sources";

const MAINTENANCE_TASKS = new Set(["mark-stale"]);

(async () => {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: npm run enqueue -- <source-name | maintenance-task>");
    process.exit(1);
  }

  if (MAINTENANCE_TASKS.has(arg)) {
    const job = await maintenanceQueue.add(arg, {});
    console.log(`✓ Enqueued maintenance:${arg} (job id ${job.id})`);
  } else if (getSource(arg)) {
    const job = await aggregateQueue.add("aggregate", { sourceName: arg });
    console.log(`✓ Enqueued aggregate:${arg} (job id ${job.id})`);
  } else {
    console.error(`Unknown target: ${arg}`);
    process.exit(1);
  }

  await aggregateQueue.close();
  await maintenanceQueue.close();
  await redis.quit();
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
