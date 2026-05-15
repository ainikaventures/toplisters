import { prisma } from "@/lib/db";
import type { Job } from "@/lib/generated/prisma/client";

/**
 * Pick the next N jobs to post to a given platform. Constraints:
 *   - active, approved
 *   - posted within the last 14 days (older = stale)
 *   - has NOT been posted to this platform before (unique gate)
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
  const candidates = await prisma.$queryRaw<Job[]>`
    SELECT j.*
    FROM jobs j
    WHERE j.is_active = true
      AND j.moderation_status = 'approved'
      AND j.posted_date >= ${since}
      AND NOT EXISTS (
        SELECT 1 FROM social_posts sp
        WHERE sp.job_id = j.id AND sp.platform = ${opts.platform}
      )
    ORDER BY j.is_featured DESC, j.posted_date DESC
    LIMIT ${CANDIDATE_LIMIT}
  `;

  if (candidates.length === 0) return [];

  const scored = candidates
    .map((j) => ({ j, score: scoreJob(j) }))
    .sort((a, b) => b.score - a.score);

  // Take the top-N, but interleave by country so we don't post three
  // UK jobs in a row when the candidate pool skews UK-heavy.
  return roundRobinByCountry(scored.map((s) => s.j), opts.count);
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
