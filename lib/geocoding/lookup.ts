import { prisma } from "@/lib/db";
import { parseLocation } from "./parse";

export interface GeocodeResult {
  countryCode: string | null;
  region: string | null;
  city: string | null;
  lat: number;
  lng: number;
}

const JITTER_RADIUS_DEGREES = 0.05; // ~5 km, per spec line 68

function jitter(value: number): number {
  return value + (Math.random() * 2 - 1) * JITTER_RADIUS_DEGREES;
}

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Resolve a free-form job location string to coordinates.
 *
 * Lookup priority (per spec line 65):
 *   1. city + country
 *   2. region + country
 *   3. country centroid (largest-population city in that country)
 *   4. give up — return null
 *
 * Each successful lookup writes to `geocode_cache` keyed on the raw input
 * so subsequent jobs from the same location skip the GeoNames query.
 *
 * Coordinates are jittered ±0.05° (~5 km) so jobs in the same city don't
 * stack at a single pin on the globe.
 */
export async function geocode(rawLocation: string): Promise<GeocodeResult | null> {
  const raw = rawLocation.trim();
  if (!raw) return null;

  // 1. Cache hit — short-circuit. We bump `hits` and re-jitter on read so
  //    the same raw string still spreads visually across multiple postings.
  const cached = await prisma.geocodeCache.findUnique({ where: { rawLocation: raw } });
  if (cached && cached.lat !== null && cached.lng !== null) {
    await prisma.geocodeCache.update({
      where: { id: cached.id },
      data: { hits: { increment: 1 } },
    });
    return {
      countryCode: cached.countryCode,
      region: cached.region,
      city: cached.city,
      lat: jitter(cached.lat),
      lng: jitter(cached.lng),
    };
  }

  const parsed = parseLocation(raw);

  let resolved: GeocodeResult | null = null;

  // 2. city + country
  if (parsed.city && parsed.countryCode) {
    const cityName = normalize(parsed.city);
    const candidates = await prisma.city.findMany({
      where: {
        countryCode: parsed.countryCode,
        OR: [{ name: parsed.city }, { asciiName: parsed.city }],
      },
      orderBy: { population: "desc" },
      take: 5,
    });
    const match =
      candidates.find((c) => normalize(c.name) === cityName) ??
      candidates.find((c) => normalize(c.asciiName) === cityName) ??
      candidates[0];
    if (match) {
      resolved = {
        countryCode: match.countryCode,
        region: parsed.region ?? match.admin1Code ?? null,
        city: match.name,
        lat: match.lat,
        lng: match.lng,
      };
    }
  }

  // 3. city without explicit country — fuzzy across all countries.
  //    Prefer highest-population match to disambiguate (e.g. "London" → GB).
  if (!resolved && parsed.city) {
    const match = await prisma.city.findFirst({
      where: { OR: [{ name: parsed.city }, { asciiName: parsed.city }] },
      orderBy: { population: "desc" },
    });
    if (match) {
      resolved = {
        countryCode: match.countryCode,
        region: match.admin1Code ?? null,
        city: match.name,
        lat: match.lat,
        lng: match.lng,
      };
    }
  }

  // 4. country centroid — largest city in country.
  if (!resolved && parsed.countryCode) {
    const major = await prisma.city.findFirst({
      where: { countryCode: parsed.countryCode },
      orderBy: { population: "desc" },
    });
    if (major) {
      resolved = {
        countryCode: parsed.countryCode,
        region: null,
        city: null,
        lat: major.lat,
        lng: major.lng,
      };
    }
  }

  // Persist the cache row (including misses, so we don't re-parse on each retry).
  // The update branch also writes the resolved coords so a previous miss that
  // now resolves (e.g. after the GeoNames table was seeded) gets backfilled.
  const cachePayload = {
    countryCode: resolved?.countryCode ?? null,
    region: resolved?.region ?? null,
    city: resolved?.city ?? null,
    lat: resolved?.lat ?? null,
    lng: resolved?.lng ?? null,
  };
  await prisma.geocodeCache.upsert({
    where: { rawLocation: raw },
    create: { rawLocation: raw, ...cachePayload },
    update: { ...cachePayload, hits: { increment: 1 } },
  });

  if (!resolved) return null;

  return {
    ...resolved,
    lat: jitter(resolved.lat),
    lng: jitter(resolved.lng),
  };
}
