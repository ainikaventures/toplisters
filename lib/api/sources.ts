/**
 * Sources whose `applyUrl` is a provider WRAPPER (recruiter/aggregator
 * redirect), not the employer's own posting. Their APIs don't return the
 * underlying employer link, so `apply_url_direct` can't be populated for
 * them. Everything else (ATS, Recruitment Revolution, open feeds) carries a
 * direct posting URL.
 */
export const AGGREGATOR_SOURCES = ["adzuna", "reed", "jooble", "findwork", "the_muse", "workable"];
const AGG = new Set(AGGREGATOR_SOURCES);

export type SourceType = "direct" | "aggregator";

export function sourceType(source: string): SourceType {
  return AGG.has(source) ? "aggregator" : "direct";
}

/** CV1 — Coventry city centre. Origin for the commute-distance gate. */
export const CV1 = { lat: 52.4068, lng: -1.5197 };

export const EARTH_RADIUS_MI = 3958.8;

/** Great-circle distance in miles between two points. */
export function haversineMi(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MI * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Miles from CV1, rounded to 0.1. null for ungeocoded / null-island rows. */
export function distanceFromCv1Mi(lat: number | null, lng: number | null): number | null {
  if (lat == null || lng == null) return null;
  if (lat === 0 && lng === 0) return null;
  return Math.round(haversineMi(CV1.lat, CV1.lng, lat, lng) * 10) / 10;
}
