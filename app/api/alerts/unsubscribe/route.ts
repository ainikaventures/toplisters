import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * One-click unsubscribe. Permanent — every digest email embeds the
 * `unsubscribeToken`, so this URL stays valid forever. Idempotent.
 *
 * Supports POST too for List-Unsubscribe-Post compliance (RFC 8058)
 * which Gmail and Yahoo enforce on bulk senders. Both methods do the
 * same thing.
 */
async function handle(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(`${SITE_URL}/alerts/unsubscribed?status=invalid`, 303);
  }

  const sub = await prisma.subscriber.findUnique({
    where: { unsubscribeToken: token },
  });
  if (!sub) {
    return NextResponse.redirect(`${SITE_URL}/alerts/unsubscribed?status=invalid`, 303);
  }

  if (!sub.unsubscribedAt) {
    await prisma.subscriber.update({
      where: { id: sub.id },
      data: { unsubscribedAt: new Date() },
    });
  }

  return NextResponse.redirect(`${SITE_URL}/alerts/unsubscribed?status=ok`, 303);
}

export const GET = handle;
export const POST = handle;
