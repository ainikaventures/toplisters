import type { Metadata } from "next";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { TrendLine, HorizontalBars } from "../_components/Charts";
import {
  AnalyticsNav,
  Card,
  CoverageMeter,
  PerfPanel,
  SnapshotEmptyState,
  StatTile,
} from "../_components/Showcase";
import { readSnapshot } from "../_data/snapshot";
import { SNAPSHOT_KEYS, type PipelinePayload } from "@/lib/analytics/rollup";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pipeline health",
  description:
    "How the Toplisters job dataset is built: ingestion sources, freshness, classifier coverage, and the geocode cache.",
};

function relative(iso: string | null): string {
  if (!iso) return "—";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 0)} min`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h`;
  return `${Math.round(mins / 1440)} d`;
}

export default async function PipelinePage() {
  const snap = await readSnapshot<PipelinePayload>(SNAPSHOT_KEYS.pipeline);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <header className="mb-6 flex flex-col gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Pipeline health
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-foreground/65">
              Jobs are pulled from public APIs and employer ATS boards,
              de-duplicated, geocoded, and classified before they reach the
              site. This is what that pipeline currently produces — including
              the fields it fails to fill.
            </p>
          </div>
          <AnalyticsNav current="pipeline" />
        </header>

        {snap === null ? (
          <SnapshotEmptyState what="pipeline" />
        ) : (
          <PipelineBody snap={snap} />
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

function PipelineBody({
  snap,
}: {
  snap: NonNullable<Awaited<ReturnType<typeof readSnapshot<PipelinePayload>>>>;
}) {
  const p = snap.payload;
  const totalSourceJobs = p.sources.reduce((a, s) => a + s.jobs, 0);

  return (
    <div className="flex flex-col gap-8">
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Active listings"
          value={p.totalActive.toLocaleString()}
          hint={`${p.inactiveRows.toLocaleString()} deactivated rows retained for history`}
        />
        <StatTile
          label="Hiring companies"
          value={p.distinctCompanies.toLocaleString()}
        />
        <StatTile label="Cities" value={p.distinctCities.toLocaleString()} />
        <StatTile
          label="Ingestion sources"
          value={p.sources.length.toLocaleString()}
          hint="Each on its own schedule and rate limit"
        />
      </section>

      <PerfPanel
        computeMs={snap.computeMs}
        readMs={snap.readMs}
        rowsScanned={snap.rowsScanned}
        computedAt={snap.computedAt}
      />

      <Card
        title="Enrichment coverage"
        subtitle="What share of active listings carry each derived field. The gaps are the honest part: a job board that claims 100% structured data is either guessing or discarding rows."
      >
        <ul className="divide-y divide-foreground/8">
          {p.coverage.map((c) => (
            <CoverageMeter
              key={c.label}
              label={c.label}
              known={c.known}
              total={c.total}
              note={c.note}
            />
          ))}
        </ul>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Volume by source"
          subtitle={`${totalSourceJobs.toLocaleString()} active listings across ${p.sources.length} feeds.`}
        >
          <HorizontalBars
            data={p.sources.map((s) => ({ label: s.source, value: s.jobs }))}
            height={Math.max(220, p.sources.length * 32)}
          />
        </Card>

        <Card
          title="Source freshness"
          subtitle="Median posting age and how recently each feed last returned a live row."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-foreground/10 text-left text-xs uppercase tracking-wider text-foreground/50">
                  <th className="pb-2 font-medium">Source</th>
                  <th className="pb-2 text-right font-medium">Listings</th>
                  <th className="pb-2 text-right font-medium">Median age</th>
                  <th className="pb-2 text-right font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/8">
                {p.sources.map((s) => (
                  <tr key={s.source}>
                    <td className="py-2 font-medium">{s.source}</td>
                    <td className="py-2 text-right font-mono tabular-nums">
                      {s.jobs.toLocaleString()}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums text-foreground/70">
                      {s.medianAgeDays === null ? "—" : `${s.medianAgeDays} d`}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums text-foreground/70">
                      {relative(s.lastSeenAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card
        title="Rows ingested per day"
        subtitle="New rows written over the last 30 days. Dips are usually a source rate-limiting rather than a market change."
      >
        <TrendLine data={p.ingestTrend} height={240} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Geocode cache"
          subtitle="Free-text locations are resolved once and reused. Every hit beyond the first is an external geocoding call not made."
        >
          <div className="grid grid-cols-2 gap-4">
            <StatTile
              label="Cached locations"
              value={p.geocode.cachedLocations.toLocaleString()}
            />
            <StatTile
              label="Lookups served"
              value={p.geocode.totalHits.toLocaleString()}
            />
            <StatTile
              label="Calls avoided"
              value={p.geocode.hitsSaved.toLocaleString()}
            />
            <StatTile
              label="Hit rate"
              value={
                p.geocode.hitRatePct === null
                  ? "—"
                  : `${p.geocode.hitRatePct.toFixed(1)}%`
              }
            />
          </div>
        </Card>

        <Card
          title="Freshness"
          subtitle="When each active listing was last confirmed present at its source. Anything unseen for 30 days is deactivated by the nightly sweep."
        >
          <ul className="divide-y divide-foreground/8">
            <FreshRow
              label="Seen in last 24 hours"
              value={p.freshness.seenLast24h}
              total={p.totalActive}
            />
            <FreshRow
              label="Seen in last 7 days"
              value={p.freshness.seenLast7d}
              total={p.totalActive}
            />
            <FreshRow
              label="Older than 7 days"
              value={p.freshness.olderThan7d}
              total={p.totalActive}
            />
          </ul>
        </Card>
      </div>
    </div>
  );
}

function FreshRow({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <li className="flex items-baseline justify-between gap-4 py-2.5">
      <span className="text-sm">{label}</span>
      <span className="font-mono text-sm tabular-nums">
        {value.toLocaleString()}{" "}
        <span className="text-xs text-foreground/45">({pct.toFixed(1)}%)</span>
      </span>
    </li>
  );
}
