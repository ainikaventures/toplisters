import { prisma } from "@/lib/db";
import { Prisma, type Job } from "@/lib/generated/prisma/client";
import { countryName } from "@/lib/format";
import { LICENCE_FREE_SOURCES } from "@/lib/sources/licence-free";
import type { ParsedQuery } from "./parse";

/**
 * Bot search. Deliberately narrower than the site's /jobs search:
 *   - licence-free sources + user-submitted only (the bot republishes
 *     listings into Telegram — same rule as the social posts);
 *   - small pages (BOT_PAGE_SIZE) and a hard page cap, so a scripted
 *     account can't page through the catalogue;
 *   - every result links to the toplisters job page, never the apply URL.
 * "See all" sends people to the full site search.
 */

export const BOT_PAGE_SIZE = 5;
export const BOT_MAX_PAGES = 3;

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://toplisters.xyz").replace(/\/$/, "");

export interface BotSearchResult {
  jobs: Job[];
  hasMore: boolean;
  /** Human label, e.g. "nurse · Dubai, United Arab Emirates · visa sponsor". */
  label: string;
  /** Full results on the site (all sources, all filters we can express). */
  siteUrl: string;
}

interface ResolvedQuery extends ParsedQuery {
  city: string | null;
}

// Case-insensitive name lookups can't use the cities index, so memoise
// them per process (bounded) — the same few places are searched repeatedly.
const cityCache = new Map<string, { asciiName: string; countryCode: string } | null>();

async function lookupCity(phrase: string, countryCode: string | null) {
  const key = `${countryCode ?? ""}|${phrase}`;
  if (cityCache.has(key)) return cityCache.get(key) ?? null;
  const city = await prisma.city
    .findFirst({
      where: {
        asciiName: { equals: phrase, mode: "insensitive" },
        population: { gte: 50_000 },
        ...(countryCode ? { countryCode } : {}),
      },
      orderBy: { population: "desc" },
      select: { asciiName: true, countryCode: true },
    })
    .catch(() => undefined);
  if (city === undefined) return null; // DB error: don't cache
  if (cityCache.size >= 5000) cityCache.delete(cityCache.keys().next().value!);
  cityCache.set(key, city);
  return city;
}

/**
 * Peel a city off either end of the keywords ("python developer london",
 * "bangalore software") by matching 1–2 words against GeoNames (pop ≥ 50k,
 * within the country when one was given). Picks the most populous match.
 */
async function resolveCity(q: ParsedQuery): Promise<ResolvedQuery> {
  const candidates: { phrase: string; rest: string[] }[] = [];
  for (const len of [2, 1]) {
    if (q.words.length < len) continue;
    candidates.push({ phrase: q.words.slice(-len).join(" "), rest: q.words.slice(0, -len) });
    if (q.words.length > len) candidates.push({ phrase: q.words.slice(0, len).join(" "), rest: q.words.slice(len) });
  }
  for (const { phrase, rest } of candidates) {
    if (phrase.length < 3) continue;
    const city = await lookupCity(phrase, q.countryCode);
    if (city) {
      return {
        ...q,
        words: rest,
        city: city.asciiName,
        countryCode: q.countryCode ?? city.countryCode.trim(),
      };
    }
  }
  return { ...q, city: null };
}

export async function botSearch(parsed: ParsedQuery, page: number): Promise<BotSearchResult> {
  const q = await resolveCity(parsed);
  const text = q.words.join(" ").trim();

  const clauses: Prisma.Sql[] = [
    Prisma.sql`is_active = true`,
    Prisma.sql`moderation_status = 'approved'`,
    Prisma.sql`(source = ANY(${LICENCE_FREE_SOURCES}) OR is_user_submitted = true)`,
  ];
  if (q.countryCode) clauses.push(Prisma.sql`country_code = ${q.countryCode}`);
  if (q.city) clauses.push(Prisma.sql`(city ILIKE ${q.city} OR location_text ILIKE ${"%" + q.city + "%"})`);
  if (q.workMode) clauses.push(Prisma.sql`work_mode::text = ${q.workMode}`);
  if (q.sponsor) clauses.push(Prisma.sql`(visa_sponsorship = true OR employer_licensed_sponsor = true)`);
  if (text) clauses.push(Prisma.sql`search_vector @@ plainto_tsquery('english', ${text})`);

  const where = Prisma.join(clauses, " AND ");
  const order = text
    ? Prisma.sql`ts_rank(search_vector, plainto_tsquery('english', ${text})) DESC, posted_date DESC`
    : Prisma.sql`posted_date DESC`;
  const safePage = Math.min(Math.max(page, 0), BOT_MAX_PAGES - 1);

  const ids = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM jobs
    WHERE ${where}
    ORDER BY ${order}
    LIMIT ${BOT_PAGE_SIZE + 1}
    OFFSET ${safePage * BOT_PAGE_SIZE}
  `;
  const pageIds = ids.slice(0, BOT_PAGE_SIZE).map((r) => r.id);
  const order_ = new Map(pageIds.map((id, i) => [id, i]));
  const jobs = pageIds.length
    ? (await prisma.job.findMany({ where: { id: { in: pageIds } } })).sort(
        (a, b) => (order_.get(a.id) ?? 0) - (order_.get(b.id) ?? 0),
      )
    : [];

  const where_ = [q.city, q.countryCode ? countryName(q.countryCode) : null].filter(Boolean).join(", ");
  const label = [
    text || "latest jobs",
    where_,
    q.workMode,
    q.sponsor ? "visa sponsor" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const site = new URL(`${SITE_URL}/jobs`);
  // City stays out of q: the site's FTS doesn't index location, so adding
  // it would AND away most matches. The country filter still narrows.
  if (text) site.searchParams.set("q", text);
  if (q.countryCode) site.searchParams.set("country", q.countryCode);
  if (q.workMode) site.searchParams.set("workMode", q.workMode);
  if (q.sponsor) site.searchParams.set("visaSponsor", "offered");
  site.searchParams.set("utm_source", "telegram");
  site.searchParams.set("utm_medium", "bot");

  return {
    jobs,
    hasMore: ids.length > BOT_PAGE_SIZE && safePage < BOT_MAX_PAGES - 1,
    label,
    siteUrl: site.toString(),
  };
}
