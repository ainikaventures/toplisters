/**
 * Country-by-country direct-source discovery. For each target country, take the
 * companies we currently only get via aggregators, probe them against the ATS
 * platforms, and save verified direct boards to the registry — so those roles
 * start coming direct. Grows direct coverage exactly where it's weakest.
 *
 * Usage:
 *   npx tsx scripts/discover-country.ts auto                 # least-covered countries first
 *   npx tsx scripts/discover-country.ts auto --countries 8   # …top 8 weakest
 *   npx tsx scripts/discover-country.ts GB,IE,SG             # specific countries
 *   npx tsx scripts/discover-country.ts IN --limit 80        # per-country company cap
 */

import "dotenv/config";
import { prisma } from "../lib/db";
import { AGGREGATOR_SOURCES } from "../lib/api/sources";
import { countryName } from "../lib/format";
import { probeCompany } from "../lib/sources/ats-discovery";
import { saveAtsSource } from "../lib/sources/ats-registry";
import { normalizeCompany } from "../lib/companies/rebuild";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PER_COUNTRY = Number.parseInt(flag("--limit") ?? "", 10) || 40;
const MAX_COUNTRIES = Number.parseInt(flag("--countries") ?? "", 10) || 10;

(async () => {
  const spec = process.argv.slice(2).filter((a) => !a.startsWith("--")).join(" ").trim() || "auto";

  let countries: string[];
  if (spec === "auto") {
    // Least-covered first: ascending active-job count (skip ZZ + tiny counts).
    const grouped = await prisma.job.groupBy({
      by: ["countryCode"],
      where: { isActive: true, countryCode: { notIn: ["ZZ"] } },
      _count: { _all: true },
    });
    countries = grouped
      .filter((g) => g._count._all >= 5)
      .sort((a, b) => a._count._all - b._count._all)
      .map((g) => g.countryCode)
      .slice(0, MAX_COUNTRIES);
    console.log(`Least-covered countries first: ${countries.join(", ")}\n`);
  } else {
    countries = spec.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
  }

  let totalSaved = 0;
  for (const cc of countries) {
    const companies = await prisma.job.groupBy({
      by: ["companyName"],
      where: { isActive: true, countryCode: cc, source: { in: AGGREGATOR_SOURCES } },
      _count: { _all: true },
      orderBy: { _count: { companyName: "desc" } },
      take: PER_COUNTRY,
    });
    const countryRe = new RegExp(escapeRe(countryName(cc)), "i");

    let found = 0;
    for (const { companyName } of companies) {
      const hit = await probeCompany(companyName, countryRe);
      if (!hit) continue;
      await saveAtsSource({
        platform: hit.ats,
        slug: hit.slug,
        companyName,
        normalizedName: normalizeCompany(companyName),
        confidence: hit.confidence,
        jobCount: hit.count,
      });
      found++;
      console.log(`  ${cc}  ${companyName.slice(0, 28).padEnd(28)} → ${hit.ats}:${hit.slug} (${hit.confidence})`);
    }
    totalSaved += found;
    console.log(`${countryName(cc)} (${cc}): probed ${companies.length} companies, saved ${found} direct boards\n`);
  }

  console.log(`Done. ${totalSaved} direct boards added to the registry.`);
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
