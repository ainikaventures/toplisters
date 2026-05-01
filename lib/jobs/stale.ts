import { Queue, Worker, type Job } from "bullmq";
import { prisma } from "@/lib/db";
import { redis, QUEUE_NAMES } from "./queue";

const STALE_DAYS = 30;

export interface MaintenanceJobResult {
  deactivated?: number;
  noop?: true;
}

export const maintenanceQueue = new Queue<unknown, MaintenanceJobResult>(
  QUEUE_NAMES.maintenance,
  {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: { count: 30 },
      removeOnFail: { count: 100 },
    },
  },
);

/**
 * Per spec line 122: jobs not seen in 30 days → set is_active=false.
 * No hard delete (preserves analytics history).
 *
 * Designed as a routine job processor that dispatches by `job.name` so we
 * can add more maintenance tasks (banner regeneration, geocode-cache GC,
 * analytics rollups) without spinning up another queue.
 */
export function createMaintenanceWorker(): Worker<unknown, MaintenanceJobResult> {
  return new Worker<unknown, MaintenanceJobResult>(
    QUEUE_NAMES.maintenance,
    async (job: Job<unknown>): Promise<MaintenanceJobResult> => {
      switch (job.name) {
        case "mark-stale": {
          const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);
          const result = await prisma.job.updateMany({
            where: { isActive: true, lastSeenAt: { lt: cutoff } },
            data: { isActive: false },
          });
          return { deactivated: result.count };
        }
        default:
          return { noop: true };
      }
    },
    { connection: redis, concurrency: 1 },
  );
}
