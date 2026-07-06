/**
 * ATS discovery — find which supported ATS a company's careers board is on, and
 * its slug, so we can pull jobs DIRECTLY from the employer (apply_url_direct).
 *
 * Probes Greenhouse / Lever / Ashby / SmartRecruiters (all keyless public
 * boards) with slug variants, and VERIFIES the hit (board/company name match,
 * or India-location for Lever/Ashby whose slug can collide) to avoid false
 * positives. Prints ready-to-paste *_COMPANIES lines.
 *
 * Usage:
 *   npm run discover-ats -- "Freshworks, Postman, Razorpay, Swiggy"
 *   npm run discover-ats            # runs the built-in India seed list
 *   npm run discover-ats -- "…" --save   # persist verified boards to the
 *                                         # employer_ats_sources registry so
 *                                         # the adapters ingest them directly
 *
 * NOTE: this only finds employers on the ATS platforms we ingest. Firms on
 * custom/self-hosted portals (e.g. TCS/Infosys/Wipro) aren't discoverable here
 * — and we don't scrape those (ToS). See info/COMPLIANCE.md.
 */

const UA = "Mozilla/5.0 (compatible; ToplistersBot/1.0; +https://toplisters.xyz)";
const INDIA_RE =
  /india|bengaluru|bangalore|mumbai|delhi|hyderabad|gurgaon|gurugram|pune|chennai|noida|kolkata/i;

const SEED = [
  "Freshworks", "Postman", "Razorpay", "Zerodha", "CRED", "Swiggy", "Zomato",
  "PhonePe", "Meesho", "Groww", "Druva", "Zeta", "Whatfix", "Netradyne",
  "HighRadius", "Rubrik", "Atlan", "slice", "Darwinbox", "MoEngage",
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function variants(company: string): string[] {
  const b = norm(company);
  return [...new Set([b, `${b}careers`, `${b}india`, `${b}jobs`])];
}
function nameMatch(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  return Boolean(na && nb && (na.includes(nb) || nb.includes(na)));
}
async function getJson(url: string): Promise<unknown> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(9000),
    });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

interface Hit {
  ats: string;
  slug: string;
  count: number;
  confidence: "verified" | "location" | "unverified";
}

async function probe(company: string): Promise<Hit | null> {
  for (const slug of variants(company)) {
    // Greenhouse — verify via board name.
    const gh = (await getJson(
      `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=false`,
    )) as { jobs?: unknown[] } | null;
    if (gh?.jobs?.length) {
      const meta = (await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}`)) as
        | { name?: string }
        | null;
      if (nameMatch(meta?.name ?? "", company) || nameMatch(slug, norm(company))) {
        return { ats: "greenhouse", slug, count: gh.jobs.length, confidence: "verified" };
      }
    }
    // SmartRecruiters — verify via company.name.
    const sr = (await getJson(
      `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=1`,
    )) as { totalFound?: number; content?: { company?: { name?: string } }[] } | null;
    if ((sr?.totalFound ?? 0) > 0 && nameMatch(sr?.content?.[0]?.company?.name ?? slug, company)) {
      return { ats: "smartrecruiters", slug, count: sr!.totalFound!, confidence: "verified" };
    }
    // Lever — slug is the account; confirm via an India location where possible.
    const lv = (await getJson(`https://api.lever.co/v0/postings/${slug}?mode=json&limit=40`)) as
      | { categories?: { location?: string } }[]
      | null;
    if (Array.isArray(lv) && lv.length) {
      const india = lv.some((p) => INDIA_RE.test(p.categories?.location ?? ""));
      return { ats: "lever", slug, count: lv.length, confidence: india ? "location" : "unverified" };
    }
    // Ashby — confirm via an India location where possible.
    const as = (await getJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}`)) as
      | { jobs?: { location?: string }[] }
      | null;
    if (as?.jobs?.length) {
      const india = as.jobs.some((j) => INDIA_RE.test(j.location ?? ""));
      return { ats: "ashby", slug, count: as.jobs.length, confidence: india ? "location" : "unverified" };
    }
  }
  return null;
}

(async () => {
  const save = process.argv.includes("--save");
  const arg = process.argv
    .slice(2)
    .filter((a) => !a.startsWith("--"))
    .join(" ")
    .trim();
  const companies = arg ? arg.split(",").map((c) => c.trim()).filter(Boolean) : SEED;

  const byAts: Record<string, string[]> = {};
  let saved = 0;
  console.log(`Probing ${companies.length} companies…${save ? " (saving to registry)" : ""}\n`);
  for (const c of companies) {
    const hit = await probe(c);
    if (hit) {
      (byAts[hit.ats] ??= []).push(hit.slug);
      console.log(`  ${c.padEnd(16)} → ${hit.ats}:${hit.slug} (${hit.count} jobs, ${hit.confidence})`);
      if (save) {
        const { saveAtsSource } = await import("../lib/sources/ats-registry");
        const { normalizeCompany } = await import("../lib/companies/rebuild");
        await saveAtsSource({
          platform: hit.ats as "greenhouse" | "lever" | "ashby" | "smartrecruiters",
          slug: hit.slug,
          companyName: c,
          normalizedName: normalizeCompany(c),
          confidence: hit.confidence,
          jobCount: hit.count,
        });
        saved++;
      }
    } else {
      console.log(`  ${c.padEnd(16)} → — (not on a supported ATS / custom portal)`);
    }
  }
  if (save) {
    const { prisma } = await import("../lib/db");
    await prisma.$disconnect();
    console.log(`\nSaved ${saved} boards to the registry.`);
  }

  const ENV: Record<string, string> = {
    greenhouse: "GREENHOUSE_COMPANIES",
    lever: "LEVER_COMPANIES",
    ashby: "ASHBY_COMPANIES",
    smartrecruiters: "SMARTRECRUITERS_COMPANIES",
  };
  console.log("\n── Env lines (append to extend the curated defaults) ──");
  for (const [ats, slugs] of Object.entries(byAts)) {
    console.log(`${ENV[ats]}="${[...new Set(slugs)].join(",")}"`);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
