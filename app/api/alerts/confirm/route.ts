import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Magic-link confirmation. Sets confirmedAt on the subscriber. Idempotent
 * — re-clicking doesn't duplicate or error.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(`${SITE_URL}/alerts/confirmed?status=invalid`, 303);
  }

  const sub = await prisma.subscriber.findUnique({ where: { confirmToken: token } });
  if (!sub) {
    return NextResponse.redirect(`${SITE_URL}/alerts/confirmed?status=invalid`, 303);
  }

  if (!sub.confirmedAt) {
    await prisma.subscriber.update({
      where: { id: sub.id },
      data: { confirmedAt: new Date(), unsubscribedAt: null },
    });
  }

  return NextResponse.redirect(`${SITE_URL}/alerts/confirmed?status=ok`, 303);
}
