import { resolveCountry } from "./countries";

export interface ParsedLocation {
  city: string | null;
  region: string | null;
  countryCode: string | null;
  isRemote: boolean;
  raw: string;
}

const REMOTE_HINTS = /\b(remote|anywhere|work[\s-]?from[\s-]?home|wfh|distributed)\b/i;

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
