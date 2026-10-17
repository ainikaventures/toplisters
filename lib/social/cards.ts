import { prisma } from "@/lib/db";
import { countryName } from "@/lib/format";
import { countryToSlug } from "@/lib/locations";
import { flagEmoji } from "@/lib/og/flag";
import { roundedCount, topHiringCompanies } from "@/lib/og/counts";
import { LICENCE_FREE_SOURCES } from "@/lib/sources/licence-free";
import { countryHashtag } from "./compose";
import type { CardPost } from "./types";

/**
 * Card-post pickers + captions: a daily country digest ("🇮🇳 Jobs in India —
 * 50+ new jobs today") and a company spotlight ("Stripe is hiring"). Images
 * are the lib/og share cards; every number is licence-free sources only
 * (lib/og/counts.ts — Adzuna bans vacancy counts).
 */

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://toplisters.xyz").replace(/\/$/, "");

/** Same country at most once a week, same company at most once a month. */
const COUNTRY_COOLDOWN_DAYS = 7;
const COMPANY_COOLDOWN_DAYS = 30;
/** A digest needs this many fresh (24h) jobs to be worth posting. */
const MIN_COUNTRY_NEW_JOBS = 10;
/** A spotlight needs this many open roles. */
const MIN_COMPANY_ROLES = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYYMMDD — busts platform image caches so each post shows today's counts. */
function dayStamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

async function recentKeys(platform: string, kind: CardPost["kind"], days: number): Promise<Set<string>> {
  const rows = await prisma.socialCardPost.findMany({
    where: { platform, kind, status: "posted", postedAt: { gte: new Date(Date.now() - days * DAY_MS) } },
    select: { key: true },
  });
  return new Set(rows.map((r) => r.key));
}

export async function pickCountryCards(platform: string, count: number): Promise<CardPost[]> {
  if (count <= 0) return [];
  const since = new Date(Date.now() - DAY_MS);
  const rows = await prisma.$queryRaw<{ cc: string; n: number }[]>`
    SELECT country_code AS cc, count(*)::int AS n
    FROM jobs
    WHERE is_active = true
      AND moderation_status = 'approved'
      AND posted_date >= ${since}
      AND country_code <> 'ZZ'
      AND (source = ANY(${LICENCE_FREE_SOURCES}) OR is_user_submitted = true)
    GROUP BY country_code
    HAVING count(*) >= ${MIN_COUNTRY_NEW_JOBS}
    ORDER BY n DESC
    LIMIT 30
  `;
  const skip = await recentKeys(platform, "country", COUNTRY_COOLDOWN_DAYS);
  const picked = rows.filter((r) => !skip.has(r.cc.trim())).slice(0, count);

  return Promise.all(
    picked.map(async ({ cc, n }) => {
      const iso = cc.trim();
      const name = countryName(iso);
      const slug = countryToSlug(iso);
      const top = (await topHiringCompanies(iso, 3)).map((c) => c.name);
      return {
        kind: "country" as const,
        key: iso,
        imageUrl: `${SITE_URL}/jobs/${slug}/opengraph-image?d=${dayStamp()}`,
        linkUrl: `${SITE_URL}/jobs/${slug}`,
        headline: `${flagEmoji(iso)} Jobs in ${name}`.trim(),
        lines: [
          `${roundedCount(n)} new jobs today, direct from employers.`,
          ...(top.length ? [`Top hiring: ${top.join(", ")}`] : []),
        ],
        cta: `Browse ${name} jobs →`,
        hashtags: [countryHashtag(iso), "hiring"],
      };
    }),
  );
}

export async function pickCompanyCards(platform: string, count: number): Promise<CardPost[]> {
  if (count <= 0) return [];
  // Companies with a logo (the post's hero) and enough licence-free roles.
  const rows = await prisma.$queryRaw<{ slug: string; name: string; country_codes: string[]; n: number }[]>`
    SELECT c.slug, c.name, c.country_codes, count(j.id)::int AS n
    FROM companies c
    JOIN jobs j ON j.company_name = ANY(c.company_names)
    WHERE c.logo_url IS NOT NULL
      AND j.is_active = true
      AND j.moderation_status = 'approved'
      AND (j.source = ANY(${LICENCE_FREE_SOURCES}) OR j.is_user_submitted = true)
    GROUP BY c.slug, c.name, c.country_codes
    HAVING count(j.id) >= ${MIN_COMPANY_ROLES}
    ORDER BY n DESC
    LIMIT 60
  `;
  const skip = await recentKeys(platform, "company", COMPANY_COOLDOWN_DAYS);
  const picked = rows.filter((r) => !skip.has(r.slug)).slice(0, count);

  return picked.map(({ slug, name, country_codes, n }) => {
    const where = country_codes.slice(0, 3).map(countryName).filter(Boolean);
    const tag = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    return {
      kind: "company" as const,
      key: slug,
      imageUrl: `${SITE_URL}/company/${slug}/opengraph-image?d=${dayStamp()}`,
      linkUrl: `${SITE_URL}/company/${slug}`,
      headline: `${name} is hiring`,
      lines: [`${roundedCount(n)} open ${n === 1 ? "role" : "roles"}${where.length ? ` in ${where.join(", ")}` : ""}.`],
      cta: `See all ${name} jobs →`,
      hashtags: [...(tag.length > 1 ? [tag] : []), "hiring"],
    };
  });
}
