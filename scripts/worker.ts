/**
 * Long-running worker process. Boots queue consumers and registers the
 * production schedule. Run via `npm run worker` locally or a dedicated
 * container in production (see docker-compose.yml).
 *
 * Flags:
 *   --once   Run every enabled source one time and exit. Skips schedule
 *            registration. Useful for cron-style deploys, smoke tests,
 *            and CI.
 */
import "dotenv/config";
import { aggregateQueue, createAggregateWorker } from "../lib/jobs/aggregate";
import { maintenanceQueue, createMaintenanceWorker } from "../lib/jobs/stale";
import { registerSchedules } from "../lib/jobs/scheduler";
import { enabledSources } from "../lib/sources";
import { redis } from "../lib/jobs/queue";
import { prisma } from "../lib/db";

async function shutdown(workers: Array<{ close: () => Promise<void> }>): Promise<void> {
  console.log("\n→ Draining workers…");
  await Promise.all(workers.map((w) => w.close()));
  await aggregateQueue.close();
  await maintenanceQueue.close();
  await redis.quit();
  await prisma.$disconnect();
  console.log("✓ Shutdown complete");
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const aggWorker = createAggregateWorker();
  const maintWorker = createMaintenanceWorker();

  aggWorker.on("completed", (job, result) => {
    console.log(`  ✓ aggregate ${job.data.sourceName}`, result);
  });
  aggWorker.on("failed", (job, err) => {
    console.error(`  ✗ aggregate ${job?.data.sourceName} (attempt ${job?.attemptsMade}/${job?.opts.attempts})`, err.message);
  });
  maintWorker.on("completed", (job, result) => {
    console.log(`  ✓ maintenance ${job.name}`, result);
  });
  maintWorker.on("failed", (job, err) => {
    console.error(`  ✗ maintenance ${job?.name}`, err.message);
  });

  if (once) {
    const targets = enabledSources();
    console.log(`→ One-shot mode: enqueueing ${targets.length} source(s)`);
    const handles = await Promise.all(
      targets.map((s) =>
        aggregateQueue.add("aggregate", { sourceName: s.name }, { attempts: 1 }),
      ),
    );

    // Wait for each enqueued job to finish (success or fail) then exit.
    const ids = handles.map((j) => j.id);
    await Promise.all(
      ids.map(async (id) => {
        if (!id) return;
        // Poll for completion.
        while (true) {
          const j = await aggregateQueue.getJob(id);
          if (!j) return;
          const state = await j.getState();
          if (state === "completed" || state === "failed") return;
          await new Promise((r) => setTimeout(r, 250));
        }
      }),
    );

    await shutdown([aggWorker, maintWorker]);
    return;
  }

  await registerSchedules();
  console.log("Worker ready. Ctrl-C to stop.");

  const cleanup = async () => {
    await shutdown([aggWorker, maintWorker]);
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
