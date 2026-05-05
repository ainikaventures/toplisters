import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { countryName } from "@/lib/format";
import { countryToSlug } from "@/lib/locations";
import { fetchAnalytics, type AnalyticsFilters } from "./_data/analytics";
import { HorizontalBars, TrendLine } from "./_components/Charts";
import { AnalyticsFilters as FiltersUI } from "./_components/AnalyticsFilters";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Analytics",
  description:
    "Live job market stats — postings by country, category, top hiring companies, trending skills.",
};

const DEFAULT_RANGE_DAYS = 90;

function parseRange(input: string | undefined): { value: string; days: number } {
  const value = input ?? "90";
  if (value === "all") return { value, days: Number.POSITIVE_INFINITY };
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return { value: String(DEFAULT_RANGE_DAYS), days: DEFAULT_RANGE_DAYS };
  }
  return { value: String(n), days: n };
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; country?: string }>;
}) {
  const params = await searchParams;
  const { value: rangeValue, days } = parseRange(params.range);
  const country = params.country?.trim() || null;

  const filters: AnalyticsFilters = { country, days };
  const data = await fetchAnalytics(filters);

  const countryBars = data.buckets.countries.map((c) => ({
    label: countryName(c.code),
    value: c.count,
    code: c.code,
  }));
  const categoryBars = data.buckets.categories.map((c) => ({
    label: c.name,
    value: c.count,
  }));

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <header className="mb-8 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Analytics
            </h1>
            <p className="max-w-2xl text-sm text-foreground/70">
              Live snapshot of the dataset — what&apos;s being posted where,
              by whom, and how the volume has moved over the last
              {Number.isFinite(days) ? ` ${days} days` : " 90 days (capped for trend)"}.
              {country ? ` Filtered to ${countryName(country)}.` : ""}
            </p>
          </div>
          <FiltersUI
            range={rangeValue}
            country={country}
            availableCountries={data.availableCountries}
          />
        </header>

        <section className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Active jobs in window" value={data.counts.filteredActive} />
          <Stat
            label="Total active (all time)"
            value={data.counts.totalActive}
            muted
          />
          <Stat label="Hiring companies" value={data.counts.uniqueCompanies} />
          <Stat label="Cities represented" value={data.counts.uniqueCities} />
        </section>

        <section className="mb-10 rounded-xl border border-foreground/10 bg-muted/30 p-5">
          <header className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wider text-foreground/60">
              Posting trend
            </h2>
            <span className="text-xs text-foreground/55">
              capped at the last 90 days
            </span>
          </header>
          <TrendLine data={data.trend} />
        </section>

        <section className="mb-10 grid gap-6 lg:grid-cols-2">
          <Card title="Jobs by country">
            {countryBars.length > 0 ? (
              <CountryBarList items={countryBars} />
            ) : (
              <p className="py-12 text-center text-xs text-foreground/55">
                No country data yet.
              </p>
            )}
          </Card>
          <Card title="Jobs by category">
            <HorizontalBars data={categoryBars} />
          </Card>
        </section>

        <section className="mb-10 grid gap-6 lg:grid-cols-2">
          <Card title="Top hiring companies">
            <ol className="flex flex-col gap-1">
              {data.buckets.topCompanies.length === 0 ? (
                <li className="py-6 text-center text-xs text-foreground/55">
                  No companies in window.
                </li>
              ) : (
                data.buckets.topCompanies.map((c, i) => (
                  <li
                    key={c.name}
                    className="flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
                  >
                    <span className="flex items-baseline gap-2 truncate">
                      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-foreground/40">
                        {i + 1}
                      </span>
                      <span className="truncate">{c.name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-foreground/55">
                      {c.count}
                    </span>
                  </li>
                ))
              )}
            </ol>
          </Card>

          <Card title="Trending skills">
            {data.buckets.topSkills.length === 0 ? (
              <p className="py-12 text-center text-xs text-foreground/55">
                Not enough skill data — most aggregated rows ship without
                skills tags. RemoteOK and Arbeitnow contribute most of the
                signal here.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {data.buckets.topSkills.map((s) => (
                  <li
                    key={s.name}
                    className="rounded-full bg-muted px-3 py-1 text-xs"
                  >
                    <span>{s.name}</span>
                    <span className="ml-1.5 text-foreground/50">
                      {s.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        <footer className="rounded-xl border border-dashed border-foreground/15 px-5 py-4 text-xs text-foreground/55">
          Aggregated live from the Postgres dataset. No user data, no PII —
          purely public listing counts. See <Link href="/about" className="underline-offset-2 hover:underline">About</Link> for sources + methodology.
        </footer>
      </main>
      <SiteFooter />
    </div>
  );
}

function Stat({
  label,
  value,
  muted,
}: {
  label: string;
  value: number;
  muted?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${muted ? "border-dashed border-foreground/10 bg-transparent" : "border-foreground/10 bg-muted/40"}`}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-foreground/60">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-foreground/10 bg-muted/30 p-5">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-foreground/60">
        {title}
      </h2>
      {children}
    </div>
  );
}

/**
 * Country bars are rendered as a deep-linked list (each row is a Link to
 * the country's index page) instead of a flat Recharts bar so the chart
 * doubles as navigation.
 */
function CountryBarList({
  items,
}: {
  items: { label: string; value: number; code: string }[];
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ol className="flex flex-col gap-1">
      {items.map((item) => {
        const pct = (item.value / max) * 100;
        return (
          <li key={item.code}>
            <Link
              href={`/jobs/${countryToSlug(item.code)}`}
              className="block rounded-md px-2 py-1.5 hover:bg-muted"
            >
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate">{item.label}</span>
                <span className="shrink-0 text-xs tabular-nums text-foreground/55">
                  {item.value}
                </span>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-foreground/5">
                <div
                  className="h-full rounded-full bg-foreground/40"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
