import type { Metadata } from "next";
import { AdminNav } from "../_components/AdminNav";
import { prisma } from "@/lib/db";
import { sourceType } from "@/lib/api/sources";
import { countryName } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Direct coverage", robots: { index: false } };

export default async function CoveragePage() {
  const rows = await prisma.job.groupBy({
    by: ["countryCode", "source"],
    where: { isActive: true },
    _count: { _all: true },
  });

  const byCountry = new Map<string, { total: number; direct: number }>();
  let gTotal = 0;
  let gDirect = 0;
  for (const r of rows) {
    const c = byCountry.get(r.countryCode) ?? { total: 0, direct: 0 };
    c.total += r._count._all;
    gTotal += r._count._all;
    if (sourceType(r.source) === "direct") {
      c.direct += r._count._all;
      gDirect += r._count._all;
    }
    byCountry.set(r.countryCode, c);
  }

  const ranked = [...byCountry.entries()]
    .map(([cc, v]) => ({ cc, ...v, pct: v.total ? (v.direct / v.total) * 100 : 0 }))
    .filter((r) => r.total >= 10)
    .sort((a, b) => b.total - a.total);

  const overall = gTotal ? (gDirect / gTotal) * 100 : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <AdminNav />
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight">Direct coverage</h1>
          <p className="mt-1 text-sm text-foreground/60">
            Share of live jobs coming from our own medium (employer/ATS boards) vs aggregators. A
            country at <strong>≥60% direct</strong> is <span className="text-emerald-600 dark:text-emerald-400">cut-ready</span> —
            the aggregator is largely redundant there.
          </p>
          <p className="mt-3 text-sm">
            Overall direct: <span className="font-semibold tabular-nums">{overall.toFixed(1)}%</span>{" "}
            <span className="text-foreground/50">({gDirect.toLocaleString()} / {gTotal.toLocaleString()} active jobs)</span>
          </p>
        </header>

        <div className="overflow-hidden rounded-xl border border-foreground/10">
          <div className="flex items-center gap-3 border-b border-foreground/10 bg-muted/40 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-foreground/50">
            <span className="flex-1">Country</span>
            <span className="w-16 text-right">Total</span>
            <span className="w-16 text-right">Direct</span>
            <span className="w-40">Direct share</span>
          </div>
          <ul>
            {ranked.map((r) => (
              <li key={r.cc} className="flex items-center gap-3 border-t border-foreground/5 px-4 py-2 text-sm">
                <span className="flex-1 truncate">
                  {countryName(r.cc)} <span className="text-foreground/40">({r.cc})</span>
                </span>
                <span className="w-16 text-right tabular-nums text-foreground/70">{r.total.toLocaleString()}</span>
                <span className="w-16 text-right tabular-nums text-foreground/70">{r.direct.toLocaleString()}</span>
                <span className="flex w-40 items-center gap-2">
                  <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className={`absolute inset-y-0 left-0 rounded-full ${r.pct >= 60 ? "bg-emerald-500" : r.pct >= 30 ? "bg-amber-400" : "bg-foreground/30"}`}
                      style={{ width: `${Math.max(r.pct, 2)}%` }}
                    />
                  </span>
                  <span className="w-9 text-right tabular-nums text-xs">{r.pct.toFixed(0)}%</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-3 text-xs text-foreground/45">
          Grow direct coverage with <code className="rounded bg-muted px-1 py-0.5">npm run discover-ats -- &quot;…&quot; --save</code>.
        </p>
      </div>
    </div>
  );
}
