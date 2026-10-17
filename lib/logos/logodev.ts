// Server-only file: uses LOGO_DEV_SECRET_KEY which must never reach the
// client bundle. The Next.js compiler flags this if it ever ends up in a
// "use client" component; we skip the `server-only` import so the file is
// also reachable from tsx CLI scripts that don't go through Next.

import { logoDevPaused, noteLogoDevStatus } from "./breaker";

const SEARCH_ENDPOINT = "https://api.logo.dev/search";

export interface LogoDevSearchResult {
  /** Brand display name */
  name: string;
  /** Resolved domain, e.g. "vonage.com" */
  domain: string;
  /** Direct CDN URL to the brand's logo */
  logo_url?: string;
}

/**
 * Look up a brand by its display name.
 *
 * Logo.dev's search ranks by name similarity + brand prominence; first
 * result is almost always the right one for unique names ("Vonage",
 * "MLB Network"). For ambiguous names ("Apple", "Acme") accuracy degrades
 * — we accept that here since the alternative (asking the user to
 * disambiguate per-company) is intractable for an aggregator.
 *
 * "none" = Logo.dev answered and has no match (safe to cache). "error" =
 * we don't know (quota exhausted, rate-limited, network, missing key) —
 * callers must NOT cache it as "no logo".
 */
export type BrandSearch =
  | { kind: "match"; result: LogoDevSearchResult }
  | { kind: "none" }
  | { kind: "error" };

export async function searchBrand(query: string): Promise<BrandSearch> {
  const key = process.env.LOGO_DEV_SECRET_KEY;
  if (!key || logoDevPaused()) return { kind: "error" };

  const url = `${SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { kind: "error" };
  }

  noteLogoDevStatus(response.status);
  if (!response.ok) return { kind: "error" };

  const data = (await response.json().catch(() => null)) as
    | LogoDevSearchResult[]
    | null;
  if (!Array.isArray(data)) return { kind: "error" };
  const top = data[0];
  if (!top?.domain) return { kind: "none" };
  return { kind: "match", result: top };
}
