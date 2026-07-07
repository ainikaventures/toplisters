/**
 * ATS discovery — find which supported ATS a company's careers board is on, and
 * its slug, so we can pull jobs DIRECTLY from the employer (apply_url_direct).
 * Verifies each hit (board/company name, or a location hint) to avoid false
 * positives. Prints ready-to-paste *_COMPANIES lines; with --save, persists to
 * the employer_ats_sources registry so the adapters ingest them automatically.
 *
 * Usage:
 *   npx tsx scripts/discover-ats.ts "Freshworks, Postman, Swiggy"
 *   npx tsx scripts/discover-ats.ts                 # built-in India seed list
 *   npx tsx scripts/discover-ats.ts "…" --save      # save verified boards
 *
 * For country-scale discovery from the jobs we already have, use
 * scripts/discover-country.ts. Firms on custom portals (TCS/Infosys/…) aren't
 * discoverable here and we don't scrape them — see info/COMPLIANCE.md.
 */

import "dotenv/config";
import { probeCompany, type AtsPlatform } from "../lib/sources/ats-discovery";

const INDIA_RE =
  /india|bengaluru|bangalore|mumbai|delhi|hyderabad|gurgaon|gurugram|pune|chennai|noida|kolkata/i;

const SEED = [
  "Freshworks", "Postman", "Razorpay", "Zerodha", "CRED", "Swiggy", "Zomato",
  "PhonePe", "Meesho", "Groww", "Druva", "Zeta", "Whatfix", "Netradyne",
  "HighRadius", "Rubrik", "Atlan", "slice", "Darwinbox", "MoEngage",
];

const ENV: Record<AtsPlatform, string> = {
  greenhouse: "GREENHOUSE_COMPANIES",
  lever: "LEVER_COMPANIES",
  ashby: "ASHBY_COMPANIES",
  smartrecruiters: "SMARTRECRUITERS_COMPANIES",
};

(async () => {
  const save = process.argv.includes("--save");
  const arg = process.argv.slice(2).filter((a) => !a.startsWith("--")).join(" ").trim();
  const companies = arg ? arg.split(",").map((c) => c.trim()).filter(Boolean) : SEED;

  const byAts: Record<string, string[]> = {};
  let saved = 0;
  console.log(`Probing ${companies.length} companies…${save ? " (saving to registry)" : ""}\n`);
  for (const c of companies) {
    const hit = await probeCompany(c, INDIA_RE);
    if (!hit) {
      console.log(`  ${c.padEnd(16)} → — (not on a supported ATS / custom portal)`);
      continue;
    }
    (byAts[hit.ats] ??= []).push(hit.slug);
    console.log(`  ${c.padEnd(16)} → ${hit.ats}:${hit.slug} (${hit.count} jobs, ${hit.confidence})`);
    if (save) {
      const { saveAtsSource } = await import("../lib/sources/ats-registry");
      const { normalizeCompany } = await import("../lib/companies/rebuild");
      await saveAtsSource({
        platform: hit.ats,
        slug: hit.slug,
        companyName: c,
        normalizedName: normalizeCompany(c),
        confidence: hit.confidence,
        jobCount: hit.count,
      });
      saved++;
    }
  }

  console.log("\n── Env lines (append to extend the curated defaults) ──");
  for (const [ats, slugs] of Object.entries(byAts)) {
    console.log(`${ENV[ats as AtsPlatform]}="${[...new Set(slugs)].join(",")}"`);
  }

  if (save) {
    const { prisma } = await import("../lib/db");
    await prisma.$disconnect();
    console.log(`\nSaved ${saved} boards to the registry.`);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
