import { resolveCountry } from "./countries";

export interface ParsedLocation {
  city: string | null;
  region: string | null;
  countryCode: string | null;
  isRemote: boolean;
  raw: string;
}

const REMOTE_HINTS = /\b(remote|anywhere|work[\s-]?from[\s-]?home|wfh|distributed)\b/i;

// US state codes that COLLIDE with ISO-2 country codes. When a location
// like "San Francisco, CA" arrives, the right-most-segment-as-country
// pass treats "CA" as Canada by default — but for the typical "City, ST"
// US convention with a preceding city segment, that's wrong. Demoting
// ambiguous trailing tokens to "region" lets the geocoder fall through
// to a fuzzy global lookup, where the higher-population US city usually
// wins (San Francisco, CA US >> any San Francisco in Canada).
//
// We list ALL US state codes (not just colliders) so adding new country-
// code aliases later doesn't silently regress this path. Single-segment
// inputs like "CA" alone are NOT demoted — those legitimately mean Canada.
const US_STATE_CODES = new Set<string>([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
]);

/**
 * Parse a free-form location string from a job posting into structured
 * components. Tolerant of the messy reality: "Coventry, UK", "New York, NY",
 * "Remote — EU", "Berlin · Germany", " London ".
 *
 * Strategy:
 * 1. Detect remote markers up-front (still try to extract a country/region
 *    if present — many "Remote, UK" jobs anchor to a country).
 * 2. Split on common separators (`,`, `·`, `—`, `–`, `-`, `|`, `/`).
 * 3. Resolve the right-most segment as country (most postings end with the
 *    country); fall back to scanning all segments.
 * 4. The next segment is region/state; the first segment is city.
 *
 * The lookup layer (lib/geocoding/lookup.ts) decides how to use these
 * pieces — this parser stays purely lexical.
 */
export function parseLocation(raw: string | null | undefined): ParsedLocation {
  const input = (raw ?? "").trim();
  if (!input) {
    return { city: null, region: null, countryCode: null, isRemote: false, raw: "" };
  }

  const isRemote = REMOTE_HINTS.test(input);

  const segments = input
    .split(/[,·—–|/]| - /)
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return { city: null, region: null, countryCode: null, isRemote, raw: input };
  }

  // Try every segment for a country code resolution; the right-most match wins
  // (most postings put country last). Strip out any "Remote" / "Anywhere"
  // tokens so they don't poison the city slot.
  let countryCode: string | null = null;
  let countryIdx = -1;
  for (let i = segments.length - 1; i >= 0; i--) {
    const code = resolveCountry(segments[i]);
    if (code) {
      countryCode = code;
      countryIdx = i;
      break;
    }
  }

  // Disambiguate US-state-vs-country-code collisions. "San Francisco, CA"
  // had been resolving to Canada because the right-most-as-country pass
  // accepts "CA" as ISO-2 for Canada. When a 2-letter trailing token IS
  // a US state code AND there's a preceding city segment, demote it: the
  // geocoder's fuzzy fallback then picks the larger US city by population.
  // Single-segment inputs ("CA") are NOT demoted — those legitimately mean
  // Canada and the country-centroid path keeps working.
  if (countryCode && countryIdx >= 1) {
    const matched = segments[countryIdx].toUpperCase();
    if (matched.length === 2 && US_STATE_CODES.has(matched)) {
      countryCode = null;
      countryIdx = -1;
    }
  }

  // Discard pure-remote tokens from the location segments before assigning.
  const meaningful = segments
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => i === countryIdx || !REMOTE_HINTS.test(s));

  // Re-index: the first non-country, non-remote segment is the city; the next
  // is the region. Remove the country segment from this list.
  const nonCountry = meaningful.filter(({ i }) => i !== countryIdx).map(({ s }) => s);

  const city = nonCountry[0] ?? null;
  const region = nonCountry[1] ?? null;

  return {
    city: city || null,
    region: region || null,
    countryCode,
    isRemote,
    raw: input,
  };
}
