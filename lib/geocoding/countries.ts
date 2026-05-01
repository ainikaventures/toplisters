// Country name and common-alias → ISO 3166-1 alpha-2 lookup.
// Used by the location parser when a job posting writes a country in prose
// ("United Kingdom", "UK", "England") instead of a code. Case-insensitive.
//
// We deliberately keep this list compact — common aliases for the markets
// the spec calls out (UK, US, EU). Add more as we encounter them in real
// adapter output rather than pre-emptively guessing every variant.

const COUNTRY_ALIASES: Record<string, string> = {
  // United Kingdom
  "united kingdom": "GB",
  "great britain": "GB",
  uk: "GB",
  "u.k.": "GB",
  britain: "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  "northern ireland": "GB",

  // United States
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  "u.s.": "US",
  "u.s.a.": "US",
  america: "US",

  // Common European
  germany: "DE",
  deutschland: "DE",
  france: "FR",
  spain: "ES",
  españa: "ES",
  italy: "IT",
  italia: "IT",
  netherlands: "NL",
  holland: "NL",
  belgium: "BE",
  ireland: "IE",
  poland: "PL",
  portugal: "PT",
  sweden: "SE",
  norway: "NO",
  denmark: "DK",
  finland: "FI",
  switzerland: "CH",
  austria: "AT",
  greece: "GR",
  "czech republic": "CZ",
  czechia: "CZ",

  // Anglophone
  canada: "CA",
  australia: "AU",
  "new zealand": "NZ",
  india: "IN",
  singapore: "SG",

  // Other
  brazil: "BR",
  brasil: "BR",
  mexico: "MX",
  méxico: "MX",
  japan: "JP",
  china: "CN",
  "south korea": "KR",
  korea: "KR",
  uae: "AE",
  "united arab emirates": "AE",
  "south africa": "ZA",
};

const ISO2_RE = /^[A-Z]{2}$/;

/** Normalise free-form country text to ISO-2. Returns null if unresolved. */
export function resolveCountry(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Check the alias map first — this catches the common "UK" → "GB" trap
  // (UK is the country's ccTLD, not its ISO-2 code) before the 2-char
  // short-circuit below would silently accept it as canonical.
  const key = trimmed.toLowerCase();
  if (COUNTRY_ALIASES[key]) return COUNTRY_ALIASES[key];

  // Otherwise, accept anything that already looks like a 2-letter code.
  if (trimmed.length === 2 && ISO2_RE.test(trimmed.toUpperCase())) {
    return trimmed.toUpperCase();
  }

  return null;
}

/** Best-effort canonical display name for an ISO-2 code (used in UI fallbacks). */
export function isoToDisplayName(iso2: string): string {
  // Reverse lookup of the canonical alias (first match wins).
  for (const [name, code] of Object.entries(COUNTRY_ALIASES)) {
    if (code === iso2) {
      return name.replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return iso2;
}
