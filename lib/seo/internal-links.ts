import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { OTHER_CATEGORY } from "@/lib/classify/category";
import { countryName } from "@/lib/format";
import { cityToSlug, countryToSlug } from "@/lib/locations";

export interface CountryLink {
  countryCode: string;
  /** canonical lowercase URL slug, e.g. "gb" → /jobs/gb */
  slug: string;
  name: string;
  totalJobs: number;
}

export interface CityLink {
  name: string;
  countryCode: string;
  countryName: string;
  /** `/jobs/${countrySlug}/${citySlug}` */
  href: string;
  totalJobs: number;
}

export interface CategoryLink {
  /** Raw category value — the same string the /jobs filter expects. */
  value: string;
  /** `/jobs?category=…` */
  href: string;
  totalJobs: number;
}

/** The city page itself hides below this, so never link into a 404. */
const MIN_JOBS_FOR_CITY_PAGE = 5;

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

/**
 * Highest-volume city hubs across every country, ordered by volume desc.
 * Mirrors the threshold the city page enforces so every link resolves.
 */
async function queryTopCities(): Promise<CityLink[]> {
  const groups = await prisma.job.groupBy({
    by: ["countryCode", "city"],
    where: { isActive: true, city: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { city: "desc" } },
    take: 200,
  });

  return groups
    .filter(
      (g) =>
        g.city &&
        g.countryCode &&
        g.countryCode !== "ZZ" &&
        g._count._all >= MIN_JOBS_FOR_CITY_PAGE,
    )
    .map((g) => ({
      name: g.city as string,
      countryCode: g.countryCode,
      countryName: countryName(g.countryCode),
      href: `/jobs/${countryToSlug(g.countryCode)}/${cityToSlug(g.city as string)}`,
      totalJobs: g._count._all,
    }));
}

const getCachedTopCities = unstable_cache(queryTopCities, ["seo-top-cities"], {
  revalidate: 3600,
  tags: ["seo-internal-links"],
});

/** Top `limit` city hubs by active-job volume. [] on any DB error. */
export async function getTopCities(limit?: number): Promise<CityLink[]> {
  let all: CityLink[];
  try {
    all = await getCachedTopCities();
  } catch {
    return [];
  }
  return typeof limit === "number" ? all.slice(0, limit) : all;
}

/**
 * Highest-volume job categories, as `/jobs?category=…` links. There's no
 * dedicated role hub route — the category filter on /jobs is the role
 * landing page — so these are the crawlable "browse by role" targets.
 */
async function queryTopCategories(): Promise<CategoryLink[]> {
  const groups = await prisma.job.groupBy({
    by: ["category"],
    where: { isActive: true },
    _count: { _all: true },
    orderBy: { _count: { category: "desc" } },
  });

  return groups
    // "Other" is the classifier's give-up sentinel (lib/classify/category)
    // — not a role anyone browses by, so it never gets a link.
    .filter((g) => g.category && g.category !== OTHER_CATEGORY)
    .map((g) => ({
      value: g.category,
      href: `/jobs?category=${encodeURIComponent(g.category)}`,
      totalJobs: g._count._all,
    }));
}

const getCachedTopCategories = unstable_cache(
  queryTopCategories,
  ["seo-top-categories"],
  { revalidate: 3600, tags: ["seo-internal-links"] },
);

/** Top `limit` categories by active-job volume. [] on any DB error. */
export async function getTopCategories(
  limit?: number,
): Promise<CategoryLink[]> {
  let all: CategoryLink[];
  try {
    all = await getCachedTopCategories();
  } catch {
    return [];
  }
  return typeof limit === "number" ? all.slice(0, limit) : all;
}
