import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Hand-rolled, DB-backed session for the passwordless account system.
 *
 * The cookie carries a random opaque token; the DB stores only its
 * SHA-256 hash, so a leaked database can't be replayed into live
 * sessions. Sessions are revocable (delete the row) and expire after
 * SESSION_TTL. Auth lookups run on the Node runtime (Prisma), never in
 * edge middleware — pages/handlers call getSessionUser() directly.
 */
export const SESSION_COOKIE = "tl_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const SECURE = SITE_URL.startsWith("https://");

export interface SessionUser {
  id: string;
  email: string;
}

export interface CookieDescriptor {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    secure: boolean;
    sameSite: "lax";
    path: "/";
    expires: Date;
  };
}

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function cookieOptions(expires: Date): CookieDescriptor["options"] {
  return { httpOnly: true, secure: SECURE, sameSite: "lax", path: "/", expires };
}

/**
 * Create a Session row for `userId` and return the cookie to set. The
 * caller writes it onto its response (route handler) or via cookies()
 * (server action) — this module stays response-agnostic.
 */
export async function createSessionCookie(userId: string): Promise<CookieDescriptor> {
  const raw = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { userId, tokenHash: hashToken(raw), expiresAt },
  });
  return { name: SESSION_COOKIE, value: raw, options: cookieOptions(expiresAt) };
}

/** Cookie descriptor that clears the session cookie (expires in the past). */
export function clearedSessionCookie(): CookieDescriptor {
  return { name: SESSION_COOKIE, value: "", options: cookieOptions(new Date(0)) };
}

/**
 * The signed-in user, or null. Reads the cookie, looks up the session by
 * token hash, drops it if expired. Cached per request so repeated calls
 * (page + components) share a single query.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: true },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return { id: session.user.id, email: session.user.email };
});

/** Delete the session backing the current cookie (sign out). */
export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(raw) } });
}
