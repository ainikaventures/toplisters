import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

/**
 * BullMQ requires `maxRetriesPerRequest: null` so its blocking commands
 * (BLPOP/BRPOP) aren't aborted mid-wait. Reusing a single Redis connection
 * across queues + workers is the recommended pattern.
 */
export const redis = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const QUEUE_NAMES = {
  aggregate: "aggregate",
  maintenance: "maintenance",
} as const;
