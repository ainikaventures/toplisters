import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Magic-link confirmation. Validates the token, marks the JobSubmission
 * row email_confirmed_at, and 303s to the user-facing "thanks" page.
 * The Job stays moderation_status=pending + is_active=false until an
 * admin approves it from /admin/queue.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(`${SITE_URL}/post-a-job/confirmed?status=invalid`, 303);
  }

  const submission = await prisma.jobSubmission.findUnique({ where: { token } });
  if (!submission) {
    return NextResponse.redirect(`${SITE_URL}/post-a-job/confirmed?status=invalid`, 303);
  }
  if (submission.expiresAt < new Date()) {
    return NextResponse.redirect(`${SITE_URL}/post-a-job/confirmed?status=expired`, 303);
  }
  if (submission.emailConfirmedAt) {
    // Re-clicking the link is harmless — same outcome.
    return NextResponse.redirect(`${SITE_URL}/post-a-job/confirmed?status=ok`, 303);
  }

  await prisma.jobSubmission.update({
    where: { id: submission.id },
    data: { emailConfirmedAt: new Date() },
  });

  return NextResponse.redirect(`${SITE_URL}/post-a-job/confirmed?status=ok`, 303);
}
