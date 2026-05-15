import "server-only";
import { createHash } from "node:crypto";

/**
 * Cookieless visitor identifier. Hash inputs:
 *   - client IP (from CF-Connecting-IP / X-Forwarded-For / X-Real-IP)
 *   - User-Agent (truncated)
 *   - UTC day bucket (YYYY-MM-DD)
 *   - PAGEVIEW_SALT (server-only secret; falls back to a static string
 *     in dev so local tracking still produces stable hashes)
 *
 * Rotation is per-day, so the same visitor across two days is two hashes.
 * That's the trade we accept for not setting a tracking cookie: the
 * "visitors" metric over a long window is really visitor-days. Visits
 * within a single day collapse to one id (good enough for engagement
 * signal without GDPR/ePrivacy consent overhead).
 */
const DEFAULT_SALT = "toplisters-dev-pageview-salt";

export function visitorHash(opts: {
  ip: string | null;
  userAgent: string | null;
  occurredAt: Date;
}): string {
  const day = opts.occurredAt.toISOString().slice(0, 10);
  const salt = process.env.PAGEVIEW_SALT ?? DEFAULT_SALT;
  const ip = opts.ip ?? "";
  const ua = (opts.userAgent ?? "").slice(0, 256);
  return createHash("sha256")
    .update(`${ip}|${ua}|${day}|${salt}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Extract the originating client IP from a request behind Cloudflare +
 * Caddy. CF-Connecting-IP is the authoritative one when we're proxied
 * through Cloudflare; the others are fallbacks for direct/dev access.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf;
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip");
}

/**
 * ISO-2 country from Cloudflare's `CF-IPCountry` header. Returns null
 * if the header is missing (local dev, non-CF deployment) or holds
 * Cloudflare's "XX"/"T1" sentinels for unknown / Tor exits.
 */
export function countryFromHeaders(headers: Headers): string | null {
  const raw = headers.get("cf-ipcountry");
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  if (code.length !== 2 || code === "XX" || code === "T1") return null;
  return code;
}

/**
 * Reject obvious bot UAs before they pollute the dataset. We're not
 * trying to be exhaustive — Cloudflare blocks the heavy hitters at the
 * edge — just skip the most common search-crawler signatures so the
 * dashboard reflects real human traffic.
 */
const BOT_UA_RE =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|preview|lighthouse|headlesschrome|gptbot|claudebot|ccbot|anthropic/i;

export function looksLikeBot(userAgent: string | null): boolean {
  if (!userAgent) return true;
  return BOT_UA_RE.test(userAgent);
}

/**
 * Path normalizer — drops query strings and trims trailing slashes
 * (except root) so /jobs/?page=2 and /jobs collapse to /jobs for
 * aggregation purposes.
 */
export function normalizePath(rawPath: string): string {
  if (!rawPath) return "/";
  const noQuery = rawPath.split("?")[0] ?? "/";
  if (noQuery === "/") return "/";
  return noQuery.replace(/\/+$/, "") || "/";
}
