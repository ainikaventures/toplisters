/**
 * Download GeoNames cities500.zip (~10 MB, ~200k cities >500 population)
 * and seed the local `cities` table.
 *
 * Usage:
 *   npm run seed:geonames           # skip if cities already populated
 *   npm run seed:geonames -- --force  # truncate + reseed
 *
 * Spec reference: info/PROJECT_SPEC.md lines 60–73 (Geocoding Strategy).
 */
import "dotenv/config";
import AdmZip from "adm-zip";
import { prisma } from "../lib/db";

const GEONAMES_URL = "https://download.geonames.org/export/dump/cities500.zip";
const BATCH_SIZE = 5000;

interface CityRow {
  geonameId: number;
  name: string;
  asciiName: string;
  countryCode: string;
  admin1Code: string | null;
  admin2Code: string | null;
  population: number;
  lat: number;
  lng: number;
  timezone: string | null;
}

function parseLine(line: string): CityRow | null {
  const cols = line.split("\t");
  if (cols.length < 19) return null;

  const lat = Number.parseFloat(cols[4] ?? "");
  const lng = Number.parseFloat(cols[5] ?? "");
  const countryCode = cols[8]?.trim();
  const geonameId = Number.parseInt(cols[0] ?? "", 10);
  const name = cols[1]?.trim();
  const asciiName = cols[2]?.trim();

  if (
    !geonameId ||
    !name ||
    !asciiName ||
    !countryCode ||
    countryCode.length !== 2 ||
    Number.isNaN(lat) ||
    Number.isNaN(lng)
  ) {
    return null;
  }

  return {
    geonameId,
    name,
    asciiName,
    countryCode: countryCode.toUpperCase(),
    admin1Code: cols[10]?.trim() || null,
    admin2Code: cols[11]?.trim() || null,
    population: Number.parseInt(cols[14] ?? "0", 10) || 0,
    lat,
    lng,
    timezone: cols[17]?.trim() || null,
  };
}

async function main() {
  const force = process.argv.includes("--force");

  const existing = await prisma.city.count();
  if (existing > 0 && !force) {
    console.log(`✓ cities table already populated (${existing} rows). Use --force to reseed.`);
    return;
  }

  if (force && existing > 0) {
    console.log(`Truncating ${existing} existing cities…`);
    await prisma.$executeRaw`TRUNCATE TABLE "cities" RESTART IDENTITY CASCADE`;
  }

  console.log(`Downloading ${GEONAMES_URL}…`);
  const response = await fetch(GEONAMES_URL);
  if (!response.ok) {
    throw new Error(`GeoNames download failed: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  console.log(`✓ Downloaded ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB`);

  const zip = new AdmZip(buffer);
  const entry = zip.getEntry("cities500.txt");
  if (!entry) throw new Error("cities500.txt not found in zip archive");

  const text = entry.getData().toString("utf8");
  const lines = text.split("\n");
  console.log(`✓ Extracted ${lines.length.toLocaleString()} lines from cities500.txt`);

  let parsed = 0;
  let inserted = 0;
  const batch: CityRow[] = [];

  for (const line of lines) {
    const row = parseLine(line);
    if (!row) continue;
    parsed++;
    batch.push(row);

    if (batch.length >= BATCH_SIZE) {
      await prisma.city.createMany({ data: batch });
      inserted += batch.length;
      process.stdout.write(`\r  inserted ${inserted.toLocaleString()} / ~${parsed.toLocaleString()}`);
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    await prisma.city.createMany({ data: batch });
    inserted += batch.length;
  }

  console.log(`\n✓ Seeded ${inserted.toLocaleString()} cities`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
