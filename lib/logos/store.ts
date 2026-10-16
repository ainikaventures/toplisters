// Server-only path (DB + secret key). Reachable from Next route handlers AND
// tsx CLI scripts / the worker, so we skip the `server-only` import.
import { prisma } from "@/lib/db";

/**
 * Self-hosted company logos, per Logo.dev's self-hosting guidance
 * (logo.dev/docs/platform/self-hosting):
 *   - download via the API (`GET /v2/brands/logo`, secret key, server-side),
 *     never by copying files from the img.logo.dev CDN;
 *   - store the FILE (the API's download URL is temporary);
 *   - keep the etag and re-download only when it changes;
 *   - a failed refresh never overwrites a good stored copy.
 *
 * Downloads are lazy — the first request for /logos/<domain> fetches and
 * stores; every later request (browser <img>, OG cards, banners) is served
 * from Postgres and never touches Logo.dev.
 */

const API = "https://api.logo.dev/v2/brands/logo";
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://toplisters.xyz").replace(/\/$/, "");

/** Re-check a stored logo's etag after this long. */
const REFRESH_AFTER_MS = 90 * 24 * 60 * 60 * 1000;
/** Retry a known miss (unindexed brand / failed download) after this long. */
const MISS_RETRY_MS = 24 * 60 * 60 * 1000;

const DOMAIN_RE = /^(?=.{3,253}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export interface LogoFile {
  bytes: Buffer;
  contentType: string;
}

/** Canonical lowercase domain, or null when it isn't a plausible hostname. */
export function normalizeLogoDomain(raw: string): string | null {
  let d = raw.trim().toLowerCase();
  try {
    d = decodeURIComponent(d);
  } catch {
    return null;
  }
  d = d.replace(/^www\./, "").replace(/\.$/, "");
  return DOMAIN_RE.test(d) ? d : null;
}

/** Our public URL for a domain's logo. */
export function selfHostedLogoUrl(domain: string): string {
  return `${SITE_URL}/logos/${domain}`;
}

/**
 * Domain behind a logo URL that we self-host — our own /logos/<domain>
 * or a legacy img.logo.dev/<domain> CDN URL. null for any other host
 * (e.g. logos a source ships itself), which callers fetch as before.
 */
export function selfHostedDomainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, SITE_URL);
    if (u.hostname === "img.logo.dev") return normalizeLogoDomain(u.pathname.slice(1));
    const own = new URL(SITE_URL).hostname;
    if (u.hostname === own && u.pathname.startsWith("/logos/")) {
      return normalizeLogoDomain(u.pathname.slice("/logos/".length));
    }
  } catch {
    /* not a URL */
  }
  return null;
}

const inFlight = new Map<string, Promise<LogoFile | null>>();

/**
 * The stored logo for a domain, downloading it via the Logo.dev API on first
 * use (and re-checking its etag every 90 days). Concurrent calls for the
 * same domain share one download. null = no logo available (yet).
 */
export function getLogo(domain: string): Promise<LogoFile | null> {
  const existing = inFlight.get(domain);
  if (existing) return existing;
  const p = loadLogo(domain).finally(() => inFlight.delete(domain));
  inFlight.set(domain, p);
  return p;
}

async function loadLogo(domain: string): Promise<LogoFile | null> {
  const row = await prisma.storedLogo.findUnique({ where: { domain } }).catch(() => null);
  const stored: LogoFile | null =
    row?.bytes && row.contentType ? { bytes: Buffer.from(row.bytes), contentType: row.contentType } : null;
  const age = row ? Date.now() - row.checkedAt.getTime() : Infinity;

  if (stored && age < REFRESH_AFTER_MS) return stored;
  if (row && !stored && age < MISS_RETRY_MS) return null;

  const fresh = await downloadFromApi(domain, row?.etag ?? null).catch(() => null);

  if (fresh === "unchanged") {
    await touch(domain);
    return stored;
  }
  if (fresh) {
    await prisma.storedLogo
      .upsert({
        where: { domain },
        create: { domain, ...fresh.row, checkedAt: new Date() },
        update: { ...fresh.row, checkedAt: new Date() },
      })
      .catch(() => null);
    return fresh.file;
  }
  // Failed / not indexed yet: keep any good copy, otherwise record the miss.
  if (stored) {
    await touch(domain);
    return stored;
  }
  await prisma.storedLogo
    .upsert({
      where: { domain },
      create: { domain, checkedAt: new Date() },
      update: { checkedAt: new Date() },
    })
    .catch(() => null);
  return null;
}

async function touch(domain: string) {
  await prisma.storedLogo.update({ where: { domain }, data: { checkedAt: new Date() } }).catch(() => null);
}

async function downloadFromApi(
  domain: string,
  prevEtag: string | null,
): Promise<"unchanged" | { file: LogoFile; row: { bytes: Uint8Array<ArrayBuffer>; contentType: string; etag: string | null; fetchedAt: Date } } | null> {
  const key = process.env.LOGO_DEV_SECRET_KEY;
  if (!key) return null;

  const res = await fetch(`${API}?domain=${encodeURIComponent(domain)}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status !== 200) return null; // 202 = still indexing → retry later
  const body = (await res.json()) as { data?: { url?: string; etag?: string } };
  const downloadUrl = body.data?.url;
  const etag = body.data?.etag ?? null;
  if (!downloadUrl) return null;
  if (etag && prevEtag && etag === prevEtag) return "unchanged";

  // PNG, not webp: the file is also embedded in OG cards and digest emails
  // (Outlook can't render webp).
  const url = new URL(downloadUrl);
  url.searchParams.set("format", "png");
  url.searchParams.set("size", "256");
  const img = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const contentType = img.headers.get("content-type") ?? "";
  if (!img.ok || !contentType.startsWith("image/")) return null;
  const bytes = Buffer.from(await img.arrayBuffer());
  if (bytes.length === 0) return null;

  return {
    file: { bytes, contentType },
    row: { bytes: new Uint8Array(bytes), contentType, etag, fetchedAt: new Date() },
  };
}

/**
 * Bytes for any logo URL: self-hosted domains come from the store (no
 * Logo.dev CDN fetch from the server — not fair use); other hosts (logos a
 * source ships itself) are fetched directly.
 */
export async function loadLogoBytes(url: string, timeoutMs = 4000): Promise<Buffer | null> {
  const domain = selfHostedDomainOf(url);
  if (domain) return (await getLogo(domain))?.bytes ?? null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Toplisters/1.0 (+https://toplisters.xyz)" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}
