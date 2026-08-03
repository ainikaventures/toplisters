import Link from "next/link";

/** Big headline number. Not a chart — a single value reads faster as text. */
export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-foreground/10 bg-card px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wider text-foreground/55">
        {label}
      </p>
      <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs leading-relaxed text-foreground/55">{hint}</p>
      ) : null}
    </div>
  );
}

export function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-foreground/10 bg-card px-5 py-5">
      <h2 className="text-sm font-medium uppercase tracking-wider text-foreground/60">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-1 text-xs leading-relaxed text-foreground/55">
          {subtitle}
        </p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * A single field's enrichment coverage.
 *
 * Deliberately shows the gap as well as the fill — the point of this panel
 * is to be honest about what the pipeline does *not* know. The percentage
 * is always printed, so the bar is never the only encoding.
 */
export function CoverageMeter({
  label,
  known,
  total,
  note,
}: {
  label: string;
  known: number;
  total: number;
  note: string;
}) {
  const pct = total > 0 ? (known / total) * 100 : 0;
  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium">{label}</span>
        <span className="font-mono text-xs tabular-nums text-foreground/70">
          {pct.toFixed(1)}%{" "}
          <span className="text-foreground/40">
            ({known.toLocaleString()} / {total.toLocaleString()})
          </span>
        </span>
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-foreground/8"
        role="img"
        aria-label={`${label}: ${pct.toFixed(1)} percent of rows populated`}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(pct, 0.5)}%`,
            backgroundColor: "var(--chart-cat-1)",
          }}
        />
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-foreground/50">{note}</p>
    </li>
  );
}

/**
 * The track-C panel: what this page costs to serve, versus what it would
 * cost to compute the same numbers per request.
 *
 * Both figures are measured, not asserted — `computeMs` is recorded by the
 * worker when it builds the rollup, `readMs` is timed on this request.
 */
export function PerfPanel({
  computeMs,
  readMs,
  rowsScanned,
  computedAt,
}: {
  computeMs: number;
  readMs: number;
  rowsScanned: number | null;
  computedAt: Date;
}) {
  const speedup = readMs > 0 ? computeMs / readMs : null;
  const ageMin = Math.max(
    0,
    Math.round((Date.now() - computedAt.getTime()) / 60000),
  );
  const age =
    ageMin < 60
      ? `${ageMin} min ago`
      : ageMin < 60 * 24
        ? `${Math.round(ageMin / 60)} h ago`
        : `${Math.round(ageMin / 1440)} d ago`;

  return (
    <section className="rounded-xl border border-foreground/15 bg-muted/40 px-5 py-5">
      <h2 className="text-sm font-medium uppercase tracking-wider text-foreground/60">
        How this page is served
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-foreground/70">
        Computing these aggregates across{" "}
        {rowsScanned !== null ? (
          <strong className="font-semibold">
            {rowsScanned.toLocaleString()} rows
          </strong>
        ) : (
          "the jobs table"
        )}{" "}
        takes{" "}
        <strong className="font-mono font-semibold">
          {computeMs.toLocaleString()} ms
        </strong>
        . A scheduled worker job precomputes them into{" "}
        <code className="text-xs">analytics_snapshots</code>, so this request
        only read one indexed row —{" "}
        <strong className="font-mono font-semibold">{readMs} ms</strong>.
        {/* The cost of aggregating scales with the table; the snapshot read
            does not. Only claim the win when it is actually one — on a small
            dataset these two numbers are close, and saying otherwise would
            be marketing rather than measurement. Keyed off the same ratio
            the Speed-up metric shows, so the prose and the number agree. */}
        {speedup !== null && speedup >= 1.5 ? (
          <>
            {" "}
            Running that per request is what makes the live view slow; this
            page is flat regardless of how far the dataset grows.
          </>
        ) : (
          <>
            {" "}
            At this dataset size the gap is modest — the point is that the
            read stays flat as the table grows, while the aggregate does not.
          </>
        )}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="Compute cost" value={`${computeMs.toLocaleString()} ms`} />
        <Metric label="This request" value={`${readMs} ms`} />
        {/* Only claim a speed-up when there is one. On a small table the
            aggregate is already trivial and the snapshot read — one row,
            but still a round trip — can measure slower. Printing "0.4×"
            there would be a worse lie than printing nothing. */}
        <Metric
          label="Speed-up"
          value={
            speedup && speedup >= 1.5
              ? `${speedup < 10 ? speedup.toFixed(1) : Math.round(speedup)}×`
              : "n/a at this size"
          }
        />
        <Metric label="Snapshot age" value={age} />
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-foreground/50">
        Trade-off: the numbers are as fresh as the last rollup, not
        to-the-second. For a dataset whose shape moves over days, that is the
        right side of the trade — the live, always-current view is still at{" "}
        <Link href="/analytics" className="underline hover:text-foreground">
          /analytics
        </Link>
        .
      </p>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-foreground/50">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-lg font-semibold tabular-nums">
        {value}
      </dd>
    </div>
  );
}

/** Shown when the rollup has never been built. */
export function SnapshotEmptyState({ what }: { what: string }) {
  return (
    <div className="rounded-xl border border-dashed border-foreground/20 px-8 py-14 text-center">
      <h2 className="text-lg font-semibold">No {what} snapshot yet</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-foreground/60">
        This dashboard reads a precomputed rollup. Build it once with{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
          npm run analytics:refresh
        </code>{" "}
        — after that the worker refreshes it daily at 06:00 UTC.
      </p>
    </div>
  );
}

/** Sub-navigation across the three analytics views. */
export function AnalyticsNav({ current }: { current: "market" | "pipeline" }) {
  const tabs = [
    { href: "/analytics", label: "Live snapshot", key: "live" },
    { href: "/analytics/pipeline", label: "Pipeline health", key: "pipeline" },
    { href: "/analytics/market", label: "Market intelligence", key: "market" },
  ] as const;

  return (
    <nav aria-label="Analytics views" className="flex flex-wrap gap-2">
      {tabs.map((t) => {
        const active = t.key === current;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
                : "rounded-md border border-foreground/15 px-3 py-1.5 text-sm font-medium hover:border-foreground/40"
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
