import "server-only";
import iso from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";

iso.registerLocale(enLocale);

/**
 * Resolve a user-supplied country to an ISO-2 code:
 *   "GB" / "gb"            → "GB"
 *   "United Kingdom"       → "GB"
 *   "Britain" (unofficial) → null
 * Returns null when it can't be resolved so callers can 400.
 */
export function resolveCountryCode(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  if (/^[A-Za-z]{2}$/.test(v)) {
    const up = v.toUpperCase();
    return iso.isValid(up) ? up : null;
  }
  return iso.getAlpha2Code(v, "en") ?? null;
}
