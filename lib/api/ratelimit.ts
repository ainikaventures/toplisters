import "server-only";
import { redis } from "@/lib/jobs/queue";

/**
 * Fixed-window per-key rate limiter backed by Redis. Generous default
 * (600 req/min) since this serves trusted, key-authenticated consumers.
 * Override with JOBS_API_RATE_LIMIT.
 *
 * Fails OPEN: if Redis is unreachable the request is allowed, so the
 * rate-limit layer can never take the API down.
 */
const LIMIT = Number.parseInt(process.env.JOBS_API_RATE_LIMIT ?? "", 10) || 600;
const WINDOW_S = 60;

export interface RateResult {
  limited: boolean;
  limit: number;
  remaining: number;
  /** Unix seconds when the current window resets. */
  reset: number;
}

export async function checkRateLimit(id: string): Promise<RateResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % WINDOW_S);
  const reset = windowStart + WINDOW_S;
  const redisKey = `ratelimit:jobsapi:${id}:${windowStart}`;

  try {
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.expire(redisKey, WINDOW_S);
    return {
      limited: count > LIMIT,
      limit: LIMIT,
      remaining: Math.max(0, LIMIT - count),
      reset,
    };
  } catch {
    return { limited: false, limit: LIMIT, remaining: LIMIT, reset };
  }
}
