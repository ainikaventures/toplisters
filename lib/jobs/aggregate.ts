import { Queue, Worker, type Job } from "bullmq";
import { redis, QUEUE_NAMES } from "./queue";
import { getSource } from "@/lib/sources";
import { runAggregation, type RunStats } from "@/lib/sources/pipeline";

export interface AggregateJobData {
  sourceName: string;
}

export interface AggregateJobResult extends Partial<RunStats> {
  skipped?: true;
  reason?: string;
}

/** Producer side — enqueues fetch jobs (one-off or via the scheduler). */
export const aggregateQueue = new Queue<AggregateJobData, AggregateJobResult>(
  QUEUE_NAMES.aggregate,
  {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  },
);

/**
 * Consumer side — processes one source per job. Concurrency is held at 1
 * so a slow source can't starve another, and to keep us a polite client.
 *
 * Each source's `isEnabled()` runs at job time (not at scheduler-registration
 * time) so flipping `DISABLE_SOURCE_*` mid-run takes effect on the next tick.
 */
export function createAggregateWorker(): Worker<AggregateJobData, AggregateJobResult> {
  return new Worker<AggregateJobData, AggregateJobResult>(
    QUEUE_NAMES.aggregate,
    async (job: Job<AggregateJobData>): Promise<AggregateJobResult> => {
      const { sourceName } = job.data;
      const source = getSource(sourceName);
      if (!source) {
        throw new Error(`Unknown source: ${sourceName}`);
      }
      if (!source.isEnabled()) {
        return { skipped: true, reason: "disabled-via-env" };
      }
      return runAggregation(source);
    },
    { connection: redis, concurrency: 1 },
  );
}
