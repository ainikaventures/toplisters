import type { Metadata } from "next";
import { Queue } from "bullmq";
import { redis, QUEUE_NAMES } from "@/lib/jobs/queue";
import { sources } from "@/lib/sources";
import { AdminNav } from "../_components/AdminNav";

/**
 * Minimal BullMQ dashboard (info/INFRASTRUCTURE.md §6 — `/admin/bullmq`).
 * Lives at this exact path to avoid colliding with `/admin/queue`, which
 * is the moderation UI.
 *
 * Renders `Queue.getJobCounts()` for each queue + the next-run time of
 * each registered scheduler. If we ever need a richer view (drilldown
 * into individual jobs, retry buttons, etc.) the spec sanctions
 * swapping in bull-board; for now this is the simplest thing that lets
 * an operator confirm the worker is alive and sources are firing.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Queues",
  robots: { index: false },
};

interface QueueRow {
  name: string;
  active: number;
  waiting: number;
  delayed: number;
  completed: number;
  failed: number;
}

interface SchedulerRow {
  schedulerId: string;
  every: string;
  nextRun: Date | null;
}

async function loadQueueRows(): Promise<QueueRow[]> {
  const rows: QueueRow[] = [];
  for (const name of Object.values(QUEUE_NAMES)) {
    const queue = new Queue(name, { connection: redis });
    try {
      const counts = await queue.getJobCounts(
        "active",
        "waiting",
        "delayed",
        "completed",
        "failed",
      );
      rows.push({
        name,
        active: counts.active ?? 0,
        waiting: counts.waiting ?? 0,
        delayed: counts.delayed ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
      });
    } finally {
      await queue.close();
    }
  }
  return rows;
}

async function loadSchedulerRows(): Promise<SchedulerRow[]> {
  // Aggregation schedulers are keyed `aggregate:<source-name>` (see
  // lib/jobs/scheduler.ts); the maintenance scheduler is a singleton.
  // We list one entry per registered source plus maintenance, then
  // fetch each scheduler's next-run from BullMQ. Sources without a
  // registered scheduler (rare — only if registerSchedules() hasn't
  // been called yet) come back with nextRun=null.
  const queue = new Queue(QUEUE_NAMES.aggregate, { connection: redis });
  const maintenance = new Queue(QUEUE_NAMES.maintenance, { connection: redis });
  const rows: SchedulerRow[] = [];
  try {
    for (const source of sources) {
      const id = `aggregate:${source.name}`;
      const scheduler = await queue.getJobScheduler(id);
      rows.push({
        schedulerId: id,
        every: scheduler?.every ? `${Math.round(Number(scheduler.every) / 60000)}m` : "—",
        nextRun: scheduler?.next ? new Date(Number(scheduler.next)) : null,
      });
    }
    const maint = await maintenance.getJobScheduler("maintenance:mark-stale");
    rows.push({
      schedulerId: "maintenance:mark-stale",
      every: maint?.pattern ?? "—",
      nextRun: maint?.next ? new Date(Number(maint.next)) : null,
    });
  } finally {
    await queue.close();
    await maintenance.close();
  }
  return rows;
}

function formatNext(d: Date | null): string {
  if (!d) return "—";
  const diffMs = d.getTime() - Date.now();
  if (diffMs <= 0) return "now";
  const m = Math.round(diffMs / 60000);
  if (m < 60) return `in ${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `in ${h}h`;
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export default async function BullMQDashboardPage() {
  const [queues, schedulers] = await Promise.all([
    loadQueueRows(),
    loadSchedulerRows(),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <AdminNav />
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">BullMQ</h1>
      <p className="mb-6 text-sm text-foreground/60">
        Live job counts per queue and the next firing time for each
        registered scheduler. Refresh the page for fresh numbers.
      </p>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Queues
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-foreground/10 text-left text-foreground/60">
                <th className="py-2 pr-4 font-medium">Queue</th>
                <th className="py-2 pr-4 text-right font-medium">Active</th>
                <th className="py-2 pr-4 text-right font-medium">Waiting</th>
                <th className="py-2 pr-4 text-right font-medium">Delayed</th>
                <th className="py-2 pr-4 text-right font-medium">Completed</th>
                <th className="py-2 pr-4 text-right font-medium">Failed</th>
              </tr>
            </thead>
            <tbody>
              {queues.map((row) => (
                <tr key={row.name} className="border-b border-foreground/5">
                  <td className="py-2 pr-4 font-mono">{row.name}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{row.active}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{row.waiting}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{row.delayed}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{row.completed}</td>
                  <td className={`py-2 pr-4 text-right tabular-nums ${row.failed > 0 ? "text-red-500" : ""}`}>
                    {row.failed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Schedulers
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-foreground/10 text-left text-foreground/60">
                <th className="py-2 pr-4 font-medium">Scheduler</th>
                <th className="py-2 pr-4 font-medium">Cadence</th>
                <th className="py-2 pr-4 font-medium">Next run</th>
              </tr>
            </thead>
            <tbody>
              {schedulers.map((row) => (
                <tr key={row.schedulerId} className="border-b border-foreground/5">
                  <td className="py-2 pr-4 font-mono">{row.schedulerId}</td>
                  <td className="py-2 pr-4">{row.every}</td>
                  <td className="py-2 pr-4">{formatNext(row.nextRun)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
