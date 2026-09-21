import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { countryName } from "@/lib/format";
import {
  AnalyticsNav,
  Card,
  PerfPanel,
  SnapshotEmptyState,
  StatTile,
} from "../_components/Showcase";
import { readSnapshot } from "../_data/snapshot";
import {
  SNAPSHOT_KEYS,
  type EngagementPayload,
  type FunnelSlice,
  type TopListing,
} from "@/lib/analytics/rollup";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Engagement",
  description:
    "View-to-apply funnel across the Toplisters job dataset: click-through by source, category and country, and the best-performing listings.",
};

export default async function EngagementPage() {
  const snap = await readSnapshot<EngagementPayload>(SNAPSHOT_KEYS.engagement);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <header className="mb-6 flex flex-col gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Engagement
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-foreground/65">
              What happens after a listing is seen. Every view is counted
              first-party and cookielessly; every apply click is the outbound
              redirect to the employer.
            </p>
          </div>
          <AnalyticsNav current="engagement" />
        </header>

        {snap === null ? (
          <SnapshotEmptyState what="engagement" />
        ) : (
          <EngagementBody snap={snap} />
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

function EngagementBody({
  snap,
}: {
  snap: NonNullable<Awaited<ReturnType<typeof readSnapshot<EngagementPayload>>>>;
}) {
  const p = snap.payload;
  const t = p.totals;

  return (
    <div className="flex flex-col gap-8">
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Listing views" value={t.views.toLocaleString()} />
        <StatTile
          label="Apply clicks"
          value={t.clicks.toLocaleString()}
          hint="Outbound redirects to the employer"
        />
        <StatTile
          label="Click-through"
          value={t.ctrPct === null ? "—" : `${t.ctrPct.toFixed(1)}%`}
        />
        <StatTile
          label="Listings with a view"
          value={t.listingsWithViews.toLocaleString()}
          hint={`of ${t.totalListings.toLocaleString()} active`}
        />
      </section>

      <div className="rounded-xl border border-foreground/15 bg-muted/40 px-5 py-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-foreground/60">
          What these numbers do and don&apos;t say
        </h2>
        <ul className="mt-2 max-w-3xl list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-foreground/70">
          <li>
            <strong className="font-semibold">Views, not viewers.</strong> The
            visitor hash rotates every UTC day, so there is no honest
            per-listing unique-people count over a longer window. One person
            returning on three days is three view-days.
          </li>
          <li>
            <strong className="font-semibold">
              Apply clicks, not applications.
            </strong>{" "}
            We record the outbound redirect. Whether the employer received a
            completed application is not observable from here, so real
            application rates are lower than this click-through.
          </li>
          <li>
            <strong className="font-semibold">
              Coverage is the binding constraint.
            </strong>{" "}
            Only {t.listingsWithViews.toLocaleString()} of{" "}
            {t.totalListings.toLocaleString()} active listings have been viewed
            at all. Per-listing rates below are drawn from a thin slice of the
            catalogue, not the whole of it.
          </li>
        </ul>
      </div>

      <PerfPanel
        computeMs={snap.computeMs}
        readMs={snap.readMs}
        rowsScanned={snap.rowsScanned}
        computedAt={snap.computedAt}
      />

      <Card
        title="Funnel by source"
        subtitle="Which feeds produce listings people actually click through on. A source with many views and few clicks is supplying listings that look relevant in search but disappoint on open."
      >
        <FunnelTable rows={p.bySource} firstHeader="Source" />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Funnel by category" subtitle="Same cut, by role category.">
          <FunnelTable rows={p.byCategory} firstHeader="Category" />
        </Card>
        <Card title="Funnel by country" subtitle="Same cut, by listing country.">
          <FunnelTable
            rows={p.byCountry.map((r) => ({
              ...r,
              label: countryName(r.label),
            }))}
            firstHeader="Country"
          />
        </Card>
      </div>

      <Card
        title="Most-viewed listings"
        subtitle="Highest raw view counts across active listings."
      >
        <ListingTable rows={p.mostViewed} />
      </Card>

      <Card
        title="Best-converting listings"
        subtitle={`Highest apply click-through, among listings with at least ${p.minViewsForCtr} views. Without that floor a single listing seen once and clicked once would top the table at 100%.`}
      >
        {p.bestConverting.length === 0 ? (
          <p className="py-8 text-center text-sm text-foreground/55">
            No listing has reached {p.minViewsForCtr} views yet, so a
            click-through ranking would be noise. This table fills in as
            traffic grows.
          </p>
        ) : (
          <ListingTable rows={p.bestConverting} />
        )}
      </Card>
    </div>
  );
}

function FunnelTable({
  rows,
  firstHeader,
}: {
  rows: FunnelSlice[];
  firstHeader: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-foreground/55">
        No views recorded yet.
      </p>
    );
  }
  const max = Math.max(...rows.map((r) => r.views), 1);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-foreground/10 text-left text-xs uppercase tracking-wider text-foreground/50">
            <th className="pb-2 font-medium">{firstHeader}</th>
            <th className="pb-2 text-right font-medium">Views</th>
            <th className="pb-2 text-right font-medium">Clicks</th>
            <th className="pb-2 text-right font-medium">CTR</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-foreground/8">
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="py-2">
                <div className="font-medium">{r.label}</div>
                <div
                  className="mt-1 h-1 rounded-full"
                  style={{
                    width: `${Math.max((r.views / max) * 100, 1)}%`,
                    backgroundColor: "var(--chart-cat-1)",
                  }}
                />
              </td>
              <td className="py-2 text-right font-mono tabular-nums">
                {r.views.toLocaleString()}
              </td>
              <td className="py-2 text-right font-mono tabular-nums text-foreground/70">
                {r.clicks.toLocaleString()}
              </td>
              <td className="py-2 text-right font-mono tabular-nums">
                {r.ctrPct === null ? "—" : `${r.ctrPct.toFixed(1)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListingTable({ rows }: { rows: TopListing[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-foreground/55">
        No listings have been viewed yet.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-foreground/10 text-left text-xs uppercase tracking-wider text-foreground/50">
            <th className="pb-2 font-medium">Listing</th>
            <th className="pb-2 text-right font-medium">Views</th>
            <th className="pb-2 text-right font-medium">Clicks</th>
            <th className="pb-2 text-right font-medium">CTR</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-foreground/8">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="py-2">
                <Link
                  href={`/job/${r.id}/${r.slug}`}
                  className="font-medium hover:underline"
                >
                  {r.title}
                </Link>
                <div className="text-xs text-foreground/55">
                  {r.companyName} · {countryName(r.countryCode)}
                </div>
              </td>
              <td className="py-2 text-right font-mono tabular-nums">
                {r.views.toLocaleString()}
              </td>
              <td className="py-2 text-right font-mono tabular-nums text-foreground/70">
                {r.clicks.toLocaleString()}
              </td>
              <td className="py-2 text-right font-mono tabular-nums">
                {r.ctrPct === null ? "—" : `${r.ctrPct.toFixed(1)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
