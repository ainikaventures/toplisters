import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { TrendLine } from "../_components/Charts";
import { CountryCard } from "./_components/CountryCard";
import { fetchAudience } from "./_data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Audience",
  description:
    "Visitor stats by country. First-party, cookieless, aggregated — no PII, no third-party tracking.",
};

const DEFAULT_RANGE_DAYS = 30;
const RANGE_OPTIONS: { value: string; label: string; days: number }[] = [
  { value: "7", label: "7d", days: 7 },
  { value: "30", label: "30d", days: 30 },
  { value: "90", label: "90d", days: 90 },
];

function parseRange(input: string | undefined): { value: string; days: number } {
  const matched = RANGE_OPTIONS.find((r) => r.value === input);
  if (matched) return { value: matched.value, days: matched.days };
  return { value: String(DEFAULT_RANGE_DAYS), days: DEFAULT_RANGE_DAYS };
}

export default async function AudiencePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const params = await searchParams;
  const { value: rangeValue, days } = parseRange(params.range);

  const data = await fetchAudience({ days });

  // Recharts wants {date, count}; reuse the existing TrendLine by mapping
  // visits → count. Visitors trend lives next to it as a small caption.
  const trendForChart = data.trend.map((p) => ({ date: p.date, count: p.visits }));

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <header className="mb-8 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <nav className="text-xs text-foreground/55">
              <Link href="/analytics" className="hover:underline">
                Analytics
              </Link>
              <span aria-hidden> / </span>
              <span>Audience</span>
            </nav>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Audience
            </h1>
            <p className="max-w-2xl text-sm text-foreground/70">
              Who&apos;s visiting — by country. First-party counts, no
              cookies, no third-party trackers. Visitor identity rotates
              every UTC day, so the same person across multiple days
              counts as multiple &quot;visitors&quot; — a deliberate
              trade for not setting a tracking cookie.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-foreground/55">Range:</span>
            <div className="inline-flex overflow-hidden rounded-md border border-foreground/15">
              {RANGE_OPTIONS.map((opt) => (
                <Link
                  key={opt.value}
                  href={`/analytics/audience?range=${opt.value}`}
                  className={`px-2.5 py-1 ${
                    opt.value === rangeValue
                      ? "bg-foreground/10 font-medium"
                      : "hover:bg-foreground/5"
                  }`}
                  scroll={false}
                >
                  {opt.label}
                </Link>
              ))}
            </div>
          </div>
        </header>

        <section className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={`Visits (last ${days}d)`} value={data.totalVisits} />
          <Stat label="Unique visitors" value={data.totalVisitors} />
          <Stat label="Countries reached" value={data.countryReach} />
          <Stat
            label="Pages / visitor"
            value={
              data.totalVisitors > 0
                ? Math.round((data.totalVisits / data.totalVisitors) * 10) / 10
                : 0
            }
            muted
          />
        </section>

        <section className="mb-10 rounded-xl border border-foreground/10 bg-muted/30 p-5">
          <header className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wider text-foreground/60">
              Daily visits
            </h2>
            <span className="text-xs text-foreground/55">
              capped at the last 90 days
            </span>
          </header>
          <TrendLine data={trendForChart} />
        </section>

        <section className="mb-10">
          <header className="mb-4 flex items-baseline justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wider text-foreground/60">
              By country
            </h2>
            <span className="text-xs text-foreground/55">
              top {Math.min(data.countries.length, 24)} of {data.countries.length}
            </span>
          </header>
          {data.countries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-foreground/15 px-5 py-10 text-center text-sm text-foreground/60">
              No visitor data yet for this window. Country is sourced from
              Cloudflare&apos;s edge geolocation — local dev requests
              don&apos;t carry it, so this fills in once the site is
              proxied through Cloudflare in production.
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {data.countries.slice(0, 24).map((c) => (
                <CountryCard
                  key={c.countryCode}
                  iso2={c.countryCode}
                  visitors={c.visitors}
                  visits={c.visits}
                />
              ))}
            </div>
          )}
        </section>

        {data.countries.length > 24 && (
          <section className="mb-10 rounded-xl border border-foreground/10 bg-muted/30 p-5">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-foreground/60">
              Long tail
            </h2>
            <ol className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {data.countries.slice(24).map((c) => (
                <li
                  key={c.countryCode}
                  className="flex items-baseline justify-between gap-3 rounded-md px-2 py-1 text-sm hover:bg-muted"
                >
                  <span className="truncate">{c.countryCode}</span>
                  <span className="shrink-0 text-xs tabular-nums text-foreground/55">
                    {c.visitors.toLocaleString()}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="mb-10 rounded-xl border border-foreground/10 bg-muted/30 p-5">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-foreground/60">
            Most-viewed pages
          </h2>
          {data.topPaths.length === 0 ? (
            <p className="py-6 text-center text-xs text-foreground/55">
              No data yet.
            </p>
          ) : (
            <ol className="flex flex-col gap-1">
              {data.topPaths.map((p, i) => {
                const max = Math.max(...data.topPaths.map((x) => x.visits), 1);
                const pct = (p.visits / max) * 100;
                return (
                  <li key={p.path}>
                    <Link
                      href={p.path}
                      className="block rounded-md px-2 py-1.5 hover:bg-muted"
                    >
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="flex items-baseline gap-2 truncate">
                          <span className="w-6 shrink-0 text-right text-xs tabular-nums text-foreground/40">
                            {i + 1}
                          </span>
                          <span className="truncate font-mono text-[12px]">
                            {p.path}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-foreground/55">
                          {p.visits.toLocaleString()}
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
          )}
        </section>

        <footer className="rounded-xl border border-dashed border-foreground/15 px-5 py-4 text-xs text-foreground/55">
          Cookieless, first-party tracking. Visitor identity ={" "}
          <code className="rounded bg-foreground/10 px-1">
            sha256(ip + ua + day + secret)
          </code>{" "}
          truncated to 16 chars, server-side only, never persisted as raw
          IP/UA. Country comes from Cloudflare&apos;s{" "}
          <code className="rounded bg-foreground/10 px-1">CF-IPCountry</code>{" "}
          edge header. Bot user-agents are filtered out at insert time.
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
