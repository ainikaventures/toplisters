import type { Metadata } from "next";
import {
  categoryLabel,
  compareCategoriesForDisplay,
} from "@/lib/classify/category";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { countryName } from "@/lib/format";
import { HorizontalBars } from "../_components/Charts";
import {
  BucketBars,
  CollarMixChart,
  SalaryRangeChart,
} from "../_components/ShowcaseCharts";
import {
  AnalyticsNav,
  Card,
  PerfPanel,
  SnapshotEmptyState,
  StatTile,
} from "../_components/Showcase";
import { readSnapshot } from "../_data/snapshot";
import { SNAPSHOT_KEYS, type MarketPayload } from "@/lib/analytics/rollup";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Market intelligence",
  description:
    "Salary distributions, role mix, collar split and listing lifetime across the Toplisters job dataset.",
};

const EXPERIENCE_LABEL: Record<string, string> = {
  entry: "Entry",
  mid: "Mid",
  senior: "Senior",
  exec: "Executive",
};

export default async function MarketPage() {
  const snap = await readSnapshot<MarketPayload>(SNAPSHOT_KEYS.market);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <header className="mb-6 flex flex-col gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Market intelligence
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-foreground/65">
              What the aggregated listings say about pay, role mix, and how
              long a vacancy stays open. Every figure below is derived from
              live postings, not a survey.
            </p>
          </div>
          <AnalyticsNav current="market" />
        </header>

        {snap === null ? (
          <SnapshotEmptyState what="market" />
        ) : (
          <MarketBody snap={snap} />
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

function MarketBody({
  snap,
}: {
  snap: NonNullable<Awaited<ReturnType<typeof readSnapshot<MarketPayload>>>>;
}) {
  const p = snap.payload;
  const { withSalary, total, currency } = p.salaryCoverage;
  const salaryPct = total > 0 ? (withSalary / total) * 100 : 0;

  const medianOverall = p.salaryOverall?.p50 ?? null;

  return (
    <div className="flex flex-col gap-8">
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Listings analysed"
          value={total.toLocaleString()}
          hint="Active listings in the dataset"
        />
        <StatTile
          label={`Salaried (${currency}/yr)`}
          value={withSalary.toLocaleString()}
          hint={`${salaryPct.toFixed(1)}% of active listings state a comparable salary`}
        />
        <StatTile
          label="Countries compared"
          value={p.collarByCountry.length.toLocaleString()}
          hint="Highest-volume countries in the collar breakdown"
        />
        <StatTile
          label="Median advertised"
          value={medianOverall ? `£${Math.round(medianOverall / 1000)}k` : "—"}
          hint={
            p.salaryOverall
              ? `Half of comparable listings fall between £${Math.round(p.salaryOverall.p25 / 1000)}k and £${Math.round(p.salaryOverall.p75 / 1000)}k`
              : undefined
          }
        />
      </section>

      <div className="rounded-xl border border-foreground/15 bg-muted/40 px-5 py-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-foreground/60">
          How to read the salary figures
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-foreground/70">
          Only{" "}
          <strong className="font-semibold">{salaryPct.toFixed(1)}%</strong> of
          active listings publish a salary at all, and those are filtered to{" "}
          <strong className="font-semibold">{currency} annual</strong> figures
          only — blending currencies without an FX feed, or hourly rates with
          annual ones, would produce a confident-looking but meaningless
          distribution. So these charts describe{" "}
          <strong className="font-semibold">
            {withSalary.toLocaleString()} comparable listings
          </strong>
          , not the whole market. Employers who publish pay also skew toward
          regulated and public-sector roles, which shifts the medians down.
        </p>
      </div>

      <PerfPanel
        computeMs={snap.computeMs}
        readMs={snap.readMs}
        rowsScanned={snap.rowsScanned}
        computedAt={snap.computedAt}
      />

      <Card
        title="Pay by seniority"
        subtitle="Interquartile range with the median marked. The bar spans the 25th to 75th percentile — half of listings fall inside it."
      >
        <SalaryRangeChart
          data={p.salaryByExperience.map((b) => ({
            ...b,
            label: EXPERIENCE_LABEL[b.label] ?? b.label,
          }))}
          height={240}
        />
      </Card>

      <Card
        title="Pay by role category"
        subtitle="Categories with at least 25 salaried listings, ranked by median. Sparse categories are excluded rather than shown with a noisy percentile."
      >
        <SalaryRangeChart data={p.salaryByCategory} height={420} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Role mix"
          subtitle="Share of active listings by category, including the unclassified bucket."
        >
          <HorizontalBars
            data={[...p.categoryMix]
              .map((c) => ({ value: c.name, count: c.count }))
              .sort(compareCategoriesForDisplay)
              .map((c) => ({
                label: categoryLabel(c.value),
                value: c.count,
              }))}
            height={Math.max(260, p.categoryMix.length * 32)}
          />
        </Card>

        <Card
          title="Most-requested skills"
          subtitle="Keyword extraction over description bodies, across all active listings."
        >
          <HorizontalBars
            data={p.topSkills.map((s) => ({ label: s.name, value: s.count }))}
            height={Math.max(260, p.topSkills.length * 32)}
          />
        </Card>
      </div>

      <Card
        title="Collar mix by country"
        subtitle="Share of white / blue / grey collar roles per country. Most job boards index only white-collar work; the blue-collar share is what makes this dataset unusual. Unclassified rows stay in the denominator."
      >
        <CollarMixChart
          data={p.collarByCountry.map((c) => ({
            ...c,
            label: countryName(c.countryCode),
          }))}
        />
      </Card>

      <Card
        title="How long listings stay live"
        subtitle="Time between first posting and the last time the source still returned the role — a proxy for time-to-fill. Listings unseen for 30 days are deactivated, which truncates the long tail."
      >
        <BucketBars
          data={p.velocity.map((v) => ({ label: v.label, count: v.count }))}
          height={260}
        />
      </Card>
    </div>
  );
}
