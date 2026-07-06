import { Queue, Worker, type Job } from "bullmq";
import { prisma } from "@/lib/db";
import { redis, QUEUE_NAMES } from "./queue";
import { runDigest, type DigestStats } from "./digest";
import { runSocialPosting, type RunStats as SocialRunStats } from "@/lib/social/runner";
import { runSponsorRefresh, type SponsorRefreshStats } from "@/lib/sponsors/refresh";
import {
  recomputeVisaPathways,
  type VisaPathwayRecomputeStats,
} from "@/lib/jobs/recompute-visa-pathways";
import { rebuildCompanies, type CompanyRebuildStats } from "@/lib/companies/rebuild";

const STALE_DAYS = 30;

export interface MaintenanceJobResult {
  deactivated?: number;
  digest?: DigestStats;
  social?: SocialRunStats[];
  sponsors?: SponsorRefreshStats;
  visaPathways?: VisaPathwayRecomputeStats;
  companies?: CompanyRebuildStats;
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
        case "rebuild-companies": {
          // Company directory aggregated from active jobs.
          const companies = await rebuildCompanies();
          return { companies };
        }
        case "send-digests": {
          // Per-subscriber digest emails. Internally throttled so a
          // misfiring scheduler can't double-send within 20 hours.
          const stats = await runDigest();
          return { digest: stats };
        }
        case "post-to-social": {
          // Auto-post N jobs to each enabled platform. The unique
          // (job_id, platform) constraint + daily cap inside the
          // runner make this safe to call multiple times a day.
          const stats = await runSocialPosting();
          return { social: stats };
        }
        case "refresh-sponsors": {
          // UK Register of Licensed Sponsors cross-reference (Task 8).
          // Network-bound (downloads ~142k rows); attempts/backoff cover a
          // transient gov.uk hiccup. Then recompute visa-pathway tags (Task 9)
          // — UK Scale-up / Skilled Worker depend on the sponsor data we just
          // wrote, so this must run after.
          const sponsors = await runSponsorRefresh();
          const visaPathways = await recomputeVisaPathways();
          return { sponsors, visaPathways };
        }
        default:
          return { noop: true };
      }
    },
    { connection: redis, concurrency: 1 },
  );
}
