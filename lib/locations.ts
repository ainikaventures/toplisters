import { slugify } from "@/lib/slug";

/**
 * Country-slug → ISO-2 alias map. Canonical is just the lowercased ISO
 * code ("gb"); the entries below are inbound redirects so URLs people
 * actually type ("uk", "usa", "united-kingdom") settle to canonical via
 * the page's redirect-on-mismatch logic.
 */
const SLUG_ALIASES: Record<string, string> = {
  uk: "gb",
  "u-k": "gb",
  britain: "gb",
  "great-britain": "gb",
  "united-kingdom": "gb",
  england: "gb",
  scotland: "gb",
  wales: "gb",

  usa: "us",
  "u-s": "us",
  "u-s-a": "us",
  "united-states": "us",
  america: "us",

  germany: "de",
  deutschland: "de",
  france: "fr",
  spain: "es",
  italy: "it",
  netherlands: "nl",
  ireland: "ie",
  poland: "pl",
  portugal: "pt",
  sweden: "se",
  norway: "no",
  denmark: "dk",
  switzerland: "ch",
  austria: "at",
  canada: "ca",
  australia: "au",
  india: "in",
  brazil: "br",
  japan: "jp",
};

const ISO2 = /^[a-z]{2}$/;

/** Country URL slug → ISO-2 (uppercase). Returns null when unresolved. */
export function resolveCountrySlug(slug: string): string | null {
  const lower = slug.toLowerCase();
  const aliased = SLUG_ALIASES[lower];
  if (aliased) return aliased.toUpperCase();
  if (ISO2.test(lower)) return lower.toUpperCase();
  return null;
}

/** ISO-2 → canonical URL slug (lowercase). */
export function countryToSlug(iso2: string): string {
  return iso2.toLowerCase();
}

/**
 * Build the canonical URL slug for a city given its display name.
 * Reuses the global `slugify` so it matches what the detail page slug
 * helper does (NFKD normalise → strip combining marks → hyphens).
 */
export function cityToSlug(city: string): string {
  return slugify(city);
}
