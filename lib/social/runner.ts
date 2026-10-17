import { prisma } from "@/lib/db";
import { pickJobsToPost } from "./curate";
import { enabledPlatforms } from "./index";
import type { CardPost, SocialPoster } from "./types";
import { pickCompanyCards, pickCountryCards } from "./cards";

/**
 * One pass of "post the next N jobs to each enabled platform." Designed
 * to be invoked from a BullMQ scheduler (a few times a day) or by hand
 * via `npm run post-to-social`. Idempotent at the DB layer — the
 * unique (job_id, platform) constraint guarantees no double-posts even
 * if two runs fire at once.
 *
 * The daily cap is enforced by counting today's `social_posts.status =
 * 'posted'` rows for the platform. We use UTC day boundaries to match
 * the way other site-wide counters (digests, analytics) bucket time.
 */

export interface RunStats {
  platform: string;
  attempted: number;
  posted: number;
  skipped: number;
  failed: number;
  capRemaining: number;
}

export async function runSocialPosting(opts: {
  /** Override daily cap (mostly for `--dry-run` / smoke testing). */
  maxPerPlatform?: number;
  /** Don't actually call platform APIs — log what would post. */
  dryRun?: boolean;
} = {}): Promise<RunStats[]> {
  const stats: RunStats[] = [];
  for (const platform of enabledPlatforms()) {
    stats.push(await runOne(platform, opts));
  }
  return stats;
}

async function runOne(
  platform: SocialPoster,
  opts: { maxPerPlatform?: number; dryRun?: boolean },
): Promise<RunStats> {
  const stat: RunStats = {
    platform: platform.platform,
    attempted: 0,
    posted: 0,
    skipped: 0,
    failed: 0,
    capRemaining: 0,
  };

  const cap = opts.maxPerPlatform ?? platform.dailyCap();
  const todayStart = startOfUtcDay();
  const postedToday = await prisma.socialPost.count({
    where: {
      platform: platform.platform,
      status: "posted",
      postedAt: { gte: todayStart },
    },
  });
  const remaining = Math.max(0, cap - postedToday);
  stat.capRemaining = remaining;
  if (remaining === 0) {
    return stat;
  }

  const candidates = await pickJobsToPost({
    platform: platform.platform,
    count: remaining,
  });
  if (candidates.length === 0) {
    return stat;
  }

  for (const job of candidates) {
    stat.attempted++;
    if (opts.dryRun) {
      console.log(
        `[${platform.platform}] DRY-RUN would post: ${job.title} — ${job.companyName}`,
      );
      stat.posted++;
      continue;
    }

    try {
      const result = await platform.post(job);
      await prisma.socialPost.create({
        data: {
          jobId: job.id,
          platform: platform.platform,
          status: "posted",
          externalId: result.externalId,
          externalUrl: result.externalUrl,
        },
      });
      stat.posted++;
      // Modest 30s spacing between posts to the same platform. Keeps
      // posts spread across the hour so a channel feed doesn't show a
      // burst of 3 jobs at the same minute.
      await sleep(30_000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      // Record the failure so the curator skips this job next time.
      // Status = "failed" still satisfies the unique gate.
      try {
        await prisma.socialPost.create({
          data: {
            jobId: job.id,
            platform: platform.platform,
            status: "failed",
            errorMessage: errorMessage.slice(0, 500),
          },
        });
      } catch {
        /* already-exists is fine; another run logged it */
      }
      stat.failed++;
      console.error(
        `[${platform.platform}] post failed for job ${job.id}: ${errorMessage}`,
      );
    }
  }

  stat.capRemaining = remaining - stat.posted;
  return stat;
}

function startOfUtcDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface CardRunStats {
  platform: string;
  kind: CardPost["kind"];
  posted: number;
  failed: number;
  /** Headlines (dry run) or post URLs (live), for the operator log. */
  items: string[];
}

/** Card posts per platform per UTC day, by kind. Env-overridable. */
function cardCap(kind: CardPost["kind"]): number {
  const raw = process.env[kind === "country" ? "SOCIAL_COUNTRY_POSTS_PER_DAY" : "SOCIAL_COMPANY_POSTS_PER_DAY"];
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

/**
 * One pass of card posts (country digest + company spotlight) to every
 * enabled platform that supports `postCard`. Daily caps come from
 * SOCIAL_COUNTRY_POSTS_PER_DAY / SOCIAL_COMPANY_POSTS_PER_DAY (default 1).
 */
export async function runCardPosting(opts: { dryRun?: boolean } = {}): Promise<CardRunStats[]> {
  const stats: CardRunStats[] = [];
  for (const platform of enabledPlatforms()) {
    if (!platform.postCard) continue;
    for (const kind of ["country", "company"] as const) {
      const stat: CardRunStats = { platform: platform.platform, kind, posted: 0, failed: 0, items: [] };
      stats.push(stat);

      const postedToday = await prisma.socialCardPost.count({
        where: { platform: platform.platform, kind, status: "posted", postedAt: { gte: startOfUtcDay() } },
      });
      const remaining = Math.max(0, cardCap(kind) - postedToday);
      const cards =
        kind === "country"
          ? await pickCountryCards(platform.platform, remaining)
          : await pickCompanyCards(platform.platform, remaining);

      for (const card of cards) {
        const withUtm = { ...card, linkUrl: addUtm(card.linkUrl, platform.platform, kind) };
        if (opts.dryRun) {
          console.log(`[${platform.platform}] DRY-RUN ${kind}: ${card.headline} — ${card.lines.join(" / ")}`);
          stat.items.push(card.headline);
          stat.posted++;
          continue;
        }
        try {
          const result = await platform.postCard(withUtm);
          await prisma.socialCardPost.create({
            data: {
              platform: platform.platform,
              kind,
              key: card.key,
              status: "posted",
              externalId: result.externalId,
              externalUrl: result.externalUrl,
            },
          });
          stat.posted++;
          stat.items.push(result.externalUrl ?? card.headline);
          await sleep(30_000);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          await prisma.socialCardPost
            .create({
              data: { platform: platform.platform, kind, key: card.key, status: "failed", errorMessage: errorMessage.slice(0, 500) },
            })
            .catch(() => null);
          stat.failed++;
          console.error(`[${platform.platform}] ${kind} card failed for ${card.key}: ${errorMessage}`);
        }
      }
    }
  }
  return stats;
}

function addUtm(url: string, source: string, campaign: string): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", source);
  u.searchParams.set("utm_medium", "social");
  u.searchParams.set("utm_campaign", campaign);
  return u.toString();
}
