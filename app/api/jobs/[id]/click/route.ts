import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Click-tracking + outbound redirect. Per spec line 153:
 *   POST /api/jobs/[id]/click → records to job_clicks → 302 to apply_url
 *
 * We use 303 (See Other) so the redirected request from the form POST
 * becomes a GET for the destination — semantically what we want and stops
 * browsers from prompting to re-submit on back-navigation.
 *
 * Privacy: raw IPs are never persisted. We store a 16-char SHA-256 of
 * IP + IP_SALT (per-deploy secret); enough to dedupe clicks from a single
 * source within an analytics window without re-identifying anyone.
 */
function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256")
    .update(`${ip}|${process.env.IP_SALT ?? "toplisters"}`)
    .digest("hex")
    .slice(0, 16);
}

function clientIp(request: NextRequest): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const job = await prisma.job.findUnique({
    where: { id },
    select: { id: true, applyUrl: true, isActive: true },
  });
  if (!job || !job.isActive) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  await Promise.all([
    prisma.jobClick.create({
      data: {
        jobId: job.id,
        ipHash: hashIp(clientIp(request)),
        userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
        referer: request.headers.get("referer")?.slice(0, 500) ?? null,
      },
    }),
    prisma.job.update({
      where: { id: job.id },
      data: { clickCount: { increment: 1 } },
    }),
  ]);

  return NextResponse.redirect(job.applyUrl, 303);
}
