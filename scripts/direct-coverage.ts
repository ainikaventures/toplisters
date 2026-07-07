/**
 * Direct-vs-aggregator coverage by country — the signal for when it's safe to
 * drop an aggregator API. High direct share for a country means our own
 * medium (employer/ATS boards) already covers it; the aggregator is redundant
 * there and can be narrowed/disabled.
 *
 * Usage:  npm run direct-coverage
 */

import "dotenv/config";
import { prisma } from "../lib/db";
import { sourceType } from "../lib/api/sources";
import { countryName } from "../lib/format";

(async () => {
  const rows = await prisma.job.groupBy({
    by: ["countryCode", "source"],
    where: { isActive: true },
    _count: { _all: true },
  });

  const byCountry = new Map<string, { total: number; direct: number }>();
  for (const r of rows) {
    const c = byCountry.get(r.countryCode) ?? { total: 0, direct: 0 };
    c.total += r._count._all;
    if (sourceType(r.source) === "direct") c.direct += r._count._all;
    byCountry.set(r.countryCode, c);
  }

  const ranked = [...byCountry.entries()]
    .map(([cc, v]) => ({ cc, ...v, pct: v.total ? (v.direct / v.total) * 100 : 0 }))
    .filter((r) => r.total >= 20)
    .sort((a, b) => b.total - a.total);

  console.log("Country".padEnd(22), "Total".padStart(7), "Direct".padStart(7), "Direct%".padStart(8));
  console.log("-".repeat(46));
  for (const r of ranked) {
    const flag = r.pct >= 60 ? " ✓ cut-ready" : r.pct >= 30 ? " ~ growing" : "";
    console.log(
      `${countryName(r.cc)} (${r.cc})`.padEnd(22),
      String(r.total).padStart(7),
      String(r.direct).padStart(7),
      `${r.pct.toFixed(0)}%`.padStart(8),
      flag,
    );
  }
  console.log(
    "\n✓ cut-ready = ≥60% of a country's live jobs already come direct — the aggregator is largely redundant there.",
  );
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
