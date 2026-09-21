/**
 * The time windows /analytics offers, shared by the server page and the
 * client filter bar so they can never drift apart.
 *
 * The list is an allowlist, not a suggestion: `range` is a query param, so
 * accepting any integer let crawlers mint an unbounded number of distinct
 * windows, each one a cache miss that re-ran ten aggregates over the whole
 * jobs table. Anything not in here falls back to the default.
 */
export const RANGE_OPTIONS: { value: string; label: string; days: number }[] = [
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "60", label: "Last 60 days", days: 60 },
  { value: "90", label: "Last 90 days", days: 90 },
  { value: "365", label: "Last year", days: 365 },
  { value: "all", label: "All time", days: Number.POSITIVE_INFINITY },
];

export const DEFAULT_RANGE = "90";

export function parseRange(input: string | undefined): {
  value: string;
  days: number;
} {
  const matched = RANGE_OPTIONS.find((r) => r.value === input);
  if (matched) return { value: matched.value, days: matched.days };
  const fallback = RANGE_OPTIONS.find((r) => r.value === DEFAULT_RANGE)!;
  return { value: fallback.value, days: fallback.days };
}

/** ISO-2 or nothing — keeps the `country` param from becoming a cache key generator. */
export function parseCountry(input: string | undefined): string | null {
  const raw = input?.trim().toUpperCase();
  return raw && /^[A-Z]{2}$/.test(raw) ? raw : null;
}
