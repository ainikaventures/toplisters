// Disposable smoke test for the geocoder. Run with `npx tsx scripts/_smoke-geocode.ts`.
// Safe to delete; not used in production paths.
import "dotenv/config";
import { geocode } from "../lib/geocoding/lookup";
import { parseLocation } from "../lib/geocoding/parse";
import { prisma } from "../lib/db";

const cases = [
  "Coventry, UK",
  "London",
  "New York, NY, USA",
  "Berlin · Germany",
  "Remote — EU",
  "Remote, UK",
  "Mumbai, India",
  "São Paulo, Brazil",
  "Paris, France",
  "Anywhere",
  "",
  "Atlantis",
];

(async () => {
  for (const c of cases) {
    const parsed = parseLocation(c);
    const r = await geocode(c);
    const parsedSummary = `city=${parsed.city ?? "—"} region=${parsed.region ?? "—"} country=${parsed.countryCode ?? "—"}${parsed.isRemote ? " remote" : ""}`;
    const geoSummary = r
      ? `${r.city ?? "—"}, ${r.region ?? "—"}, ${r.countryCode} (${r.lat.toFixed(3)}, ${r.lng.toFixed(3)})`
      : "null";
    console.log(`${JSON.stringify(c).padEnd(28)} parsed{${parsedSummary}}\n  → ${geoSummary}`);
  }
  await prisma.$disconnect();
})();
