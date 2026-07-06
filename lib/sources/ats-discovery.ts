/**
 * Probe a company name against the keyless ATS platforms (Greenhouse / Lever /
 * Ashby / SmartRecruiters) and return the verified board, if any. Shared by the
 * discovery scripts. Verification (board/company name match, or a location hint
 * for slug-collision-prone Lever/Ashby) keeps false positives out.
 */

const UA = "Mozilla/5.0 (compatible; ToplistersBot/1.0; +https://toplisters.xyz)";

export type AtsPlatform = "greenhouse" | "lever" | "ashby" | "smartrecruiters";

export interface AtsHit {
  ats: AtsPlatform;
  slug: string;
  count: number;
  confidence: "verified" | "location" | "unverified";
}

export function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function variants(company: string): string[] {
  const b = norm(company);
  return [...new Set([b, `${b}careers`, `${b}jobs`, `${b}hq`])].filter((s) => s.length >= 2);
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

/**
 * @param countryRe optional regex over posting locations — when it matches a
 *   Lever/Ashby board, the hit is "location"-confident rather than "unverified".
 */
export async function probeCompany(
  company: string,
  countryRe?: RegExp,
): Promise<AtsHit | null> {
  for (const slug of variants(company)) {
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
    const sr = (await getJson(
      `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=1`,
    )) as { totalFound?: number; content?: { company?: { name?: string } }[] } | null;
    if ((sr?.totalFound ?? 0) > 0 && nameMatch(sr?.content?.[0]?.company?.name ?? slug, company)) {
      return { ats: "smartrecruiters", slug, count: sr!.totalFound!, confidence: "verified" };
    }
    const lv = (await getJson(`https://api.lever.co/v0/postings/${slug}?mode=json&limit=40`)) as
      | { categories?: { location?: string } }[]
      | null;
    if (Array.isArray(lv) && lv.length) {
      const hit = countryRe ? lv.some((p) => countryRe.test(p.categories?.location ?? "")) : false;
      return { ats: "lever", slug, count: lv.length, confidence: hit ? "location" : "unverified" };
    }
    const as = (await getJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}`)) as
      | { jobs?: { location?: string }[] }
      | null;
    if (as?.jobs?.length) {
      const hit = countryRe ? as.jobs.some((j) => countryRe.test(j.location ?? "")) : false;
      return { ats: "ashby", slug, count: as.jobs.length, confidence: hit ? "location" : "unverified" };
    }
  }
  return null;
}
