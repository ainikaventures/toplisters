import { redis } from "@/lib/jobs/queue";

/**
 * Per-user throttling for the search bot. A person searches a handful of
 * times; a script harvesting listings searches constantly. Limits are
 * per Telegram user id (bots can't message bots, so the realistic scraper
 * is a scripted *user* account) plus a global ceiling protecting the DB.
 *
 * Going over the daily limit auto-blocks the user for 24h. Ids listed in
 * TELEGRAM_BLOCKED_USERS (comma-separated) are blocked permanently.
 *
 * Fails open: if Redis is unreachable the bot keeps answering (the page
 * size + page cap still bound what any one search exposes).
 */

type Bucket = "search" | "inline";

/** [window seconds, max hits] per bucket. Inline fires as the user types, so it gets more headroom. */
const LIMITS: Record<Bucket, [number, number][]> = {
  search: [
    [60, envInt("TELEGRAM_LIMIT_PER_MINUTE", 8)],
    [3600, envInt("TELEGRAM_LIMIT_PER_HOUR", 60)],
    [86400, envInt("TELEGRAM_LIMIT_PER_DAY", 150)],
  ],
  inline: [
    [60, 30],
    [3600, 200],
    [86400, envInt("TELEGRAM_INLINE_LIMIT_PER_DAY", 500)],
  ],
};
const GLOBAL_PER_MINUTE = envInt("TELEGRAM_GLOBAL_LIMIT_PER_MINUTE", 300);
const AUTO_BLOCK_SECONDS = 24 * 3600;

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export type LimitVerdict = "ok" | "slow_down" | "blocked";

export function isPermanentlyBlocked(userId: string): boolean {
  return (process.env.TELEGRAM_BLOCKED_USERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .includes(userId);
}

export async function checkLimit(userId: string, bucket: Bucket): Promise<LimitVerdict> {
  if (isPermanentlyBlocked(userId)) return "blocked";
  try {
    if (await redis.exists(`tg:block:${userId}`)) return "blocked";

    const global = await hit(`tg:rl:global:${Math.floor(Date.now() / 60_000)}`, 60);
    if (global > GLOBAL_PER_MINUTE) return "slow_down";

    for (const [windowSec, max] of LIMITS[bucket]) {
      const slot = Math.floor(Date.now() / 1000 / windowSec);
      const n = await hit(`tg:rl:${bucket}:${userId}:${windowSec}:${slot}`, windowSec);
      if (n > max) {
        if (windowSec === 86400) {
          await redis.set(`tg:block:${userId}`, "1", "EX", AUTO_BLOCK_SECONDS);
          return "blocked";
        }
        return "slow_down";
      }
    }
    return "ok";
  } catch {
    return "ok";
  }
}

async function hit(key: string, ttlSec: number): Promise<number> {
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, ttlSec);
  return n;
}

/** Users currently auto-blocked (for the admin page). */
export async function autoBlockedUsers(): Promise<string[]> {
  try {
    const keys = await redis.keys("tg:block:*");
    return keys.map((k) => k.slice("tg:block:".length));
  } catch {
    return [];
  }
}

/** Short-lived storage for "More ▶" buttons (callback_data is capped at 64 bytes). */
export async function stashQuery(value: string): Promise<string | null> {
  try {
    const key = Math.random().toString(36).slice(2, 10);
    await redis.set(`tg:q:${key}`, value, "EX", 3600);
    return key;
  } catch {
    return null;
  }
}

export async function loadQuery(key: string): Promise<string | null> {
  try {
    return await redis.get(`tg:q:${key}`);
  } catch {
    return null;
  }
}
