import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";

/** SHA-256 hex of an API key. Only hashes are ever stored. */
export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Comma-separated plaintext bootstrap keys from env (zero-DB path). */
function envKeys(): string[] {
  return (process.env.JOBS_API_KEYS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Constant-time membership test to avoid leaking key length/prefix via timing. */
function envKeyMatch(presented: string): boolean {
  const a = Buffer.from(hashKey(presented), "hex");
  for (const k of envKeys()) {
    const b = Buffer.from(hashKey(k), "hex");
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

/** Pull the key from `Authorization: Bearer <k>` or `x-api-key: <k>`. */
export function extractKey(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth && /^Bearer\s+/i.test(auth)) {
    const k = auth.replace(/^Bearer\s+/i, "").trim();
    if (k) return k;
  }
  const x = req.headers.get("x-api-key");
  return x && x.trim() ? x.trim() : null;
}

export interface AuthResult {
  /** Stable id used as the rate-limit bucket ("env" for env-supplied keys). */
  keyId: string;
}

/**
 * Authenticate a request. Returns the matched key's id, or null when the
 * key is missing / unknown / revoked. Accepts both env-bootstrap keys and
 * managed DB keys (created via `npm run apikey`).
 */
export async function authenticate(req: Request): Promise<AuthResult | null> {
  const key = extractKey(req);
  if (!key) return null;

  if (envKeyMatch(key)) return { keyId: "env" };

  const row = await prisma.apiKey.findUnique({ where: { keyHash: hashKey(key) } });
  if (!row || row.revokedAt) return null;

  // Best-effort last-used stamp; never block the request on it.
  void prisma.apiKey
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { keyId: row.id };
}
