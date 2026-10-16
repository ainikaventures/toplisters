// Server-only file: uses LOGO_DEV_SECRET_KEY which must never reach the
// client bundle. The Next.js compiler flags this if it ever ends up in a
// "use client" component; we skip the `server-only` import so the file is
// also reachable from tsx CLI scripts that don't go through Next.

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
 * Look up a brand by its display name. Returns the top match or null.
 *
 * Logo.dev's search ranks by name similarity + brand prominence; first
 * result is almost always the right one for unique names ("Vonage",
 * "MLB Network"). For ambiguous names ("Apple", "Acme") accuracy degrades
 * — we accept that here since the alternative (asking the user to
 * disambiguate per-company) is intractable for an aggregator.
 *
 * Returns null on no-match, network error, missing key, or 429 — caller
 * caches null too so we don't retry every aggregation cycle.
 */
export async function searchBrand(query: string): Promise<LogoDevSearchResult | null> {
  const key = process.env.LOGO_DEV_SECRET_KEY;
  if (!key) return null;

  const url = `${SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const data = (await response.json().catch(() => null)) as
    | LogoDevSearchResult[]
    | null;
  if (!Array.isArray(data) || data.length === 0) return null;

  const top = data[0];
  if (!top?.domain) return null;
  return top;
}
