import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { consumeLoginToken } from "@/lib/auth/login-token";
import { createSessionCookie } from "@/lib/auth/session";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/account";
}

/**
 * Magic-link callback. Validates + burns the token, upserts the User
 * (first sign-in creates the account), starts a session, and redirects
 * to the requested same-site path. A bad/expired/used token bounces to
 * the sign-in page with an error flag rather than erroring out.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const next = safeNext(request.nextUrl.searchParams.get("next"));

  if (!token) {
    return NextResponse.redirect(`${SITE_URL}/account/sign-in?error=invalid`, 303);
  }

  const email = await consumeLoginToken(token);
  if (!email) {
    return NextResponse.redirect(`${SITE_URL}/account/sign-in?error=expired`, 303);
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email },
  });

  const cookie = await createSessionCookie(user.id);
  const response = NextResponse.redirect(`${SITE_URL}${next}`, 303);
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
