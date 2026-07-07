/**
 * IT-park directory scraper — turns a tech-park's company listing into a
 * company-name list you feed to `discover-ats` (which verifies each against the
 * ATS platforms and, with --save, grows the direct-pull registry).
 *
 * We extract company WEBSITES from the directory (robust) and use the domain
 * label as the company seed — discover-ats generates slug variants from it.
 * We only collect names here; nothing is republished (company names/domains are
 * facts). Extend the PARKS map to add more directories.
 *
 * Usage:
 *   npx tsx scripts/scrape-park.ts infopark
 *   # then feed the list into discovery + save to the registry:
 *   npx tsx scripts/discover-ats.ts "$(npx tsx scripts/scrape-park.ts infopark 2>/dev/null)" --save
 */

export {};

const UA = "Mozilla/5.0 (compatible; ToplistersBot/1.0; +https://toplisters.xyz)";

const PARKS: Record<string, { url: (page: number) => string; pages: number }> = {
  // Infopark Kochi — ~500 companies across 10 pages; each card shows a website.
  infopark: { url: (p) => `https://infopark.in/companies?page=${p}`, pages: 10 },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url: string): Promise<string> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
    return r.ok ? await r.text() : "";
  } catch {
    return "";
  }
}

(async () => {
  const park = process.argv[2] ?? "infopark";
  const cfg = PARKS[park];
  if (!cfg) {
    console.error(`Unknown park "${park}". Known: ${Object.keys(PARKS).join(", ")}`);
    process.exit(1);
  }

  const companies = new Set<string>();
  for (let p = 1; p <= cfg.pages; p++) {
    const html = await fetchText(cfg.url(p));
    for (const m of html.matchAll(/www\.([a-z0-9-]{2,})\.[a-z.]{2,}/gi)) {
      const label = m[1].toLowerCase();
      if (label !== "infopark") companies.add(label);
    }
    console.error(`  ${park} p${p}: ${companies.size} companies so far`);
    await sleep(500);
  }

  const list = [...companies].sort();
  console.error(`\n${park}: ${list.length} companies → pipe into discover-ats.`);
  // Company list on stdout (comma-separated) so it can be captured/piped.
  process.stdout.write(list.join(", "));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
