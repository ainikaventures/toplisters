import "server-only";
import { feature } from "topojson-client";
import { geoMercator, geoPath, geoCentroid } from "d3-geo";
import countriesTopo from "world-atlas/countries-110m.json";
import iso from "i18n-iso-countries";
import type { Feature, FeatureCollection, Geometry } from "geojson";

/**
 * Server-side renderer for per-country SVG silhouettes. We:
 *   1. Decode the topojson into geojson features once at module init.
 *   2. Map ISO-2 ↔ ISO-3166 numeric (the topojson keys features by
 *      numeric id) via `i18n-iso-countries`.
 *   3. For a given country, fit it to a 100×60 viewBox with a Mercator
 *      projection and emit the `d` attribute + centroid coords as
 *      pre-baked strings. The client never sees d3-geo — it just
 *      renders the SVG <path>.
 *
 * Mercator is the right pick here (not Equal-Earth or Natural-Earth)
 * because we're showing each country in isolation: we want a familiar
 * silhouette, and at this scale Mercator's polar distortion is
 * irrelevant. fitSize handles per-country rescaling.
 */
type CountryFeature = Feature<Geometry, { name?: string }>;

const VIEW_W = 100;
const VIEW_H = 60;

type CountriesTopology = Parameters<typeof feature>[0] & {
  objects: { countries: Parameters<typeof feature>[1] };
};
const TOPO = countriesTopo as unknown as CountriesTopology;
const COUNTRIES_FC = feature(
  TOPO,
  TOPO.objects.countries,
) as unknown as FeatureCollection<Geometry, { name?: string }>;

const BY_NUMERIC = new Map<string, CountryFeature>();
for (const f of COUNTRIES_FC.features) {
  if (f.id != null) BY_NUMERIC.set(String(f.id).padStart(3, "0"), f);
}

export interface CountryShape {
  iso2: string;
  /** SVG `d` attribute, fit to a 100×60 viewBox. */
  d: string;
  /** Where to place the count label, in viewBox coords. */
  cx: number;
  cy: number;
}

const SHAPE_CACHE = new Map<string, CountryShape | null>();

export function countryShape(iso2: string): CountryShape | null {
  const code = iso2.toUpperCase();
  const cached = SHAPE_CACHE.get(code);
  if (cached !== undefined) return cached;

  const numeric = iso.alpha2ToNumeric(code);
  if (!numeric) {
    SHAPE_CACHE.set(code, null);
    return null;
  }
  const feat = BY_NUMERIC.get(numeric);
  if (!feat) {
    SHAPE_CACHE.set(code, null);
    return null;
  }

  // 4-unit inset so strokes don't clip on the viewBox edge.
  const projection = geoMercator().fitExtent(
    [
      [4, 4],
      [VIEW_W - 4, VIEW_H - 4],
    ],
    feat,
  );
  const path = geoPath(projection);
  const d = path(feat);
  if (!d) {
    SHAPE_CACHE.set(code, null);
    return null;
  }
  const [lon, lat] = geoCentroid(feat);
  const projected = projection([lon, lat]);
  const cx = projected?.[0] ?? VIEW_W / 2;
  const cy = projected?.[1] ?? VIEW_H / 2;

  const shape: CountryShape = { iso2: code, d, cx, cy };
  SHAPE_CACHE.set(code, shape);
  return shape;
}

export const SHAPE_VIEWBOX = { width: VIEW_W, height: VIEW_H };
