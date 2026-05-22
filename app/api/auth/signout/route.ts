import { NextResponse } from "next/server";
import { clearedSessionCookie, destroyCurrentSession } from "@/lib/auth/session";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Sign out: revoke the session row and clear the cookie. POST-only so a
 * prefetch or stray GET can't log someone out (CSRF-safe enough paired
 * with the SameSite=Lax cookie).
 */
export async function POST() {
  await destroyCurrentSession();
  const cleared = clearedSessionCookie();
  const response = NextResponse.redirect(`${SITE_URL}/`, 303);
  response.cookies.set(cleared.name, cleared.value, cleared.options);
  return response;
}
