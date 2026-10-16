import { prisma } from "@/lib/db";
import type { Job } from "@/lib/generated/prisma/client";

/**
 * Pick the next N jobs to post to a given platform. Constraints:
 *   - active, approved
 *   - posted within the last 14 days (older = stale)
 *   - has NOT been posted to this platform before (unique gate)
 *   - licence-free source only (see SOCIAL_SAFE_SOURCES)
 *   - quality scoring nudges salary-bearing + clean-description jobs up
 *
 * We deliberately don't try to be clever about country/category mix in
 * a single pass — the daily cap is small (3–5 per platform) and the
 * dataset is large enough that the natural variety in the top-N is
 * usually fine. If posts start feeling clustered, add a per-country
 * round-robin pass here.
 */
const FRESHNESS_DAYS = 14;
const CANDIDATE_LIMIT = 120;

/**
 * Sources we may republish to social without a licence or fee: employers'
 * own public ATS boards + Workable's distribution board (info/COMPLIANCE.md).
 * User-submitted jobs (our own data) are allowed separately. Licensed /
 * personal-use feeds (Adzuna, Reed, Jooble, Findwork, The Muse) and open
 * feeds with unclear or restrictive reuse terms (Arbeitnow, RemoteOK,
 * Remotive — the latter bans redistribution) are never posted.
 */
const SOCIAL_SAFE_SOURCES: string[] = [
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "workday",
  "workable",
];

export async function pickJobsToPost(opts: {
  platform: string;
  count: number;
}): Promise<Job[]> {
  if (opts.count <= 0) return [];

  const since = new Date(Date.now() - FRESHNESS_DAYS * 24 * 60 * 60 * 1000);

  // Pull a candidate pool that's already filtered by "never posted to
  // this platform" via NOT EXISTS, then score in JS. Doing the score
  // ordering in SQL would be cleaner but the scoring rules are
  // expected to evolve more often than the SQL is worth maintaining.
  // Raw SQL selects ids only: `j.*` would include the tsvector
  // `search_vector` (undeserializable in $queryRaw) and return snake_case
  // columns, not Job fields. findMany then loads proper Job rows.
  const idRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT j.id
    FROM jobs j
    WHERE j.is_active = true
      AND j.moderation_status = 'approved'
      AND j.posted_date >= ${since}
      AND (j.source = ANY(${SOCIAL_SAFE_SOURCES}) OR j.is_user_submitted = true)
      -- Never posted to this platform — matched on company + title, not
      -- id, so the same role listed in several locations posts once.
      AND NOT EXISTS (
        SELECT 1 FROM social_posts sp
        JOIN jobs pj ON pj.id = sp.job_id
        WHERE sp.platform = ${opts.platform}
          AND lower(pj.company_name) = lower(j.company_name)
          AND lower(pj.title) = lower(j.title)
      )
    ORDER BY j.is_featured DESC, j.posted_date DESC
    LIMIT ${CANDIDATE_LIMIT}
  `;

  if (idRows.length === 0) return [];

  const candidates = await prisma.job.findMany({
    where: { id: { in: idRows.map((r) => r.id) } },
  });

  const scored = candidates
    .map((j) => ({ j, score: scoreJob(j) }))
    .sort((a, b) => b.score - a.score);

  // Same role in several locations → keep only the best-scored listing.
  const seen = new Set<string>();
  const unique = scored
    .map((s) => s.j)
    .filter((j) => {
      const key = `${j.companyName.toLowerCase()}|${j.title.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  // Take the top-N, but interleave by country so we don't post three
  // UK jobs in a row when the candidate pool skews UK-heavy.
  return roundRobinByCountry(unique, opts.count);
}

function scoreJob(job: Job): number {
  let s = 0;

  // Recency: 0 (14 days old) → 10 (today).
  const ageMs = Date.now() - job.postedDate.getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  s += Math.max(0, 10 - ageDays * 0.7);

  // Salary present is a meaningful quality signal — these listings get
  // far better click-through than the "DOE" ones.
  if (job.salaryMin || job.salaryMax) s += 5;

  // Description length proxy for "real listing vs scraped stub."
  const descLen = (job.descriptionText ?? "").length;
  if (descLen > 600) s += 3;
  else if (descLen > 200) s += 1;

  // Featured admin flag is a manual override — float them.
  if (job.isFeatured) s += 8;

  // Penalize the most generic categories slightly so we promote the
  // more interesting / clickable headlines first.
  if ((job.category ?? "").toLowerCase() === "other") s -= 1;

  return s;
}

function roundRobinByCountry(jobs: Job[], count: number): Job[] {
  const byCountry = new Map<string, Job[]>();
  for (const j of jobs) {
    const key = j.countryCode || "ZZ";
    const bucket = byCountry.get(key) ?? [];
    bucket.push(j);
    byCountry.set(key, bucket);
  }
  const queues = Array.from(byCountry.values());
  const picked: Job[] = [];
  while (picked.length < count && queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      if (q.length === 0) continue;
      picked.push(q.shift()!);
      if (picked.length >= count) break;
    }
  }
  return picked;
}
