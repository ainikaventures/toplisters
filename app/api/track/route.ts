import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { jobIdFromPath } from "@/lib/analytics/job-path";
import {
  clientIpFromHeaders,
  countryFromHeaders,
  looksLikeBot,
  normalizePath,
  visitorHash,
} from "@/lib/pageviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * First-party pageview beacon. Fired by the <TrackPageview/> client
 * component on every client-side route change (and once on initial
 * mount). Intentionally returns 204 No Content — the client uses
 * `navigator.sendBeacon` and doesn't read the response.
 *
 * Inputs: just `{ path }` in the JSON body. Country comes from
 * Cloudflare's CF-IPCountry header (free, no MaxMind, no ipapi),
 * visitor identity comes from a daily-rotating IP+UA hash (no cookies,
 * see lib/pageviews.ts).
 */
export async function POST(request: NextRequest) {
  const userAgent = request.headers.get("user-agent");
  if (looksLikeBot(userAgent)) {
    return new NextResponse(null, { status: 204 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const rawPath =
    typeof body === "object" && body !== null && "path" in body
      ? String((body as { path: unknown }).path ?? "")
      : "";
  const path = normalizePath(rawPath);
  if (path.length > 512) {
    return new NextResponse(null, { status: 204 });
  }

  const occurredAt = new Date();
  const ip = clientIpFromHeaders(request.headers);
  const countryCode = countryFromHeaders(request.headers);
  const hash = visitorHash({ ip, userAgent, occurredAt });

  // Fire-and-forget: the client doesn't await the response, and an
  // analytics insert failure must never break a real user navigation.
  try {
    await prisma.pageview.create({
      data: {
        occurredAt,
        countryCode,
        path,
        visitorHash: hash,
      },
    });

    // Counter cache for per-job view counts.
    //
    // Incremented here rather than in the job page's server render for two
    // reasons: this endpoint already drops bots (looksLikeBot above), and
    // it only fires from a real browser that executed JS, so crawlers and
    // prefetches don't inflate the number. The Pageview row above stays
    // the source of truth — viewCount is a denormalised copy so the job
    // page and the engagement rollup read one integer instead of
    // aggregating the pageviews table. Rebuild it any time with
    // `npm run backfill:view-counts`.
    const jobId = jobIdFromPath(path);
    if (jobId) {
      await prisma.job.updateMany({
        where: { id: jobId },
        data: { viewCount: { increment: 1 } },
      });
    }
  } catch {
    /* swallow — analytics never blocks UX */
  }

  return new NextResponse(null, { status: 204 });
}
