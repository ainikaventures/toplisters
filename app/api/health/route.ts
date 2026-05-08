import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/jobs/queue";

/**
 * Liveness + dependency check (info/INFRASTRUCTURE.md §6).
 *
 * Pings Postgres and Redis in parallel. Returns 200 with `status: "ok"`
 * when both respond, 503 with `status: "degraded"` and per-service
 * detail otherwise. Uptime-monitoring services should treat any non-200
 * as a page.
 *
 * Deliberately cheap — a `SELECT 1` round-trip and a Redis PING. Don't
 * grow this into a deep health probe (that's what /admin/bullmq + a
 * proper synthetic test are for).
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const [dbResult, redisResult] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    redis.ping(),
  ]);

  const dbOk = dbResult.status === "fulfilled";
  const redisOk =
    redisResult.status === "fulfilled" && redisResult.value === "PONG";
  const overall = dbOk && redisOk ? "ok" : "degraded";

  return NextResponse.json(
    {
      status: overall,
      db: dbOk ? "ok" : "down",
      redis: redisOk ? "ok" : "down",
      timestamp: new Date().toISOString(),
    },
    {
      status: overall === "ok" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
