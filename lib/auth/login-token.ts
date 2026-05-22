import "server-only";
import { prisma } from "@/lib/db";
import { generateToken, hashToken } from "./session";

/**
 * Single-use, short-lived magic-link tokens. The raw token goes in the
 * emailed URL; only its hash is stored. Issuing a fresh link invalidates
 * any earlier unused one for the same email, so there's never more than
 * one live link per inbox.
 */
const LOGIN_TTL_MS = 15 * 60 * 1000; // 15 minutes

/** Mint a login token for `email` and return the raw token for the URL. */
export async function issueLoginToken(email: string): Promise<string> {
  const raw = generateToken();
  await prisma.loginToken.deleteMany({ where: { email, usedAt: null } });
  await prisma.loginToken.create({
    data: {
      email,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + LOGIN_TTL_MS),
    },
  });
  return raw;
}

/**
 * Validate + burn a login token. Returns the associated email on success
 * (so the caller can upsert the User), or null when the token is unknown,
 * already used, or expired.
 */
export async function consumeLoginToken(raw: string): Promise<string | null> {
  const row = await prisma.loginToken.findUnique({
    where: { tokenHash: hashToken(raw) },
  });
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) return null;

  await prisma.loginToken.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });
  return row.email;
}
