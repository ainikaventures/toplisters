import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { countryName } from "@/lib/format";
import { countryToSlug } from "@/lib/locations";

export interface CountryLink {
  countryCode: string;
  /** canonical lowercase URL slug, e.g. "gb" → /jobs/gb */
  slug: string;
  name: string;
  totalJobs: number;
}

/**
 * Every country with active jobs, ordered by volume desc, "ZZ"
 * (worldwide/unknown) dropped. Backs the crawlable internal-link blocks
 * (homepage TL-090, footer TL-090, sibling-country links TL-091) so
 * link-authority flows from the most-authoritative pages into the
 * country/city listings instead of dead-ending in client-side globe JS.
 */
async function queryTopCountries(): Promise<CountryLink[]> {
  const groups = await prisma.job.groupBy({
    by: ["countryCode"],
    where: { isActive: true },
    _count: { _all: true },
    orderBy: { _count: { countryCode: "desc" } },
  });

  return groups
    .filter((g) => g.countryCode && g.countryCode !== "ZZ")
    .map((g) => ({
      countryCode: g.countryCode,
      slug: countryToSlug(g.countryCode),
      name: countryName(g.countryCode),
      totalJobs: g._count._all,
    }));
}

// Country volumes shift slowly; a 1-hour window keeps the footer/homepage
// link blocks off the DB on every page load (these pages are otherwise
// force-dynamic) while staying fresh enough for SEO.
const getCachedTopCountries = unstable_cache(
  queryTopCountries,
  ["seo-top-countries"],
  { revalidate: 3600, tags: ["seo-internal-links"] },
);

/**
 * Read the cached list, degrading to [] on any DB error. This block now
 * renders in the sitewide footer (every page, including the otherwise
 * DB-free /about, /privacy, /sources), so a transient DB blip must drop
 * the country links — not 500 the whole page.
 */
async function safeTopCountries(): Promise<CountryLink[]> {
  try {
    return await getCachedTopCountries();
  } catch {
    return [];
  }
}

/**
 * Top `limit` countries by active-job volume (all of them when `limit`
 * is omitted). Reads through a 1-hour cache shared across every caller.
 */
export async function getTopCountries(limit?: number): Promise<CountryLink[]> {
  const all = await safeTopCountries();
  return typeof limit === "number" ? all.slice(0, limit) : all;
}

/** Same list with one country code excluded — for sibling-country blocks. */
export async function getSiblingCountries(
  excludeCode: string,
  limit?: number,
): Promise<CountryLink[]> {
  const all = await safeTopCountries();
  const siblings = all.filter((c) => c.countryCode !== excludeCode);
  return typeof limit === "number" ? siblings.slice(0, limit) : siblings;
}
