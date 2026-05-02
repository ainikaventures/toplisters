// Server-only path. Reachable from Next route handlers AND tsx CLI
// scripts (npm run source / worker), so we skip the `server-only` import.
import { prisma } from "@/lib/db";
import { searchBrand, buildLogoImgUrl } from "./logodev";

/** ms; how long a cached miss (no logo found) is trusted before retrying. */
const NEGATIVE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/**
 * Resolve a logo URL for the given company name. Cache hits return
 * immediately; misses call Logo.dev's brand-search and cache the result
 * (positive or negative). Negative entries auto-expire after NEGATIVE_TTL
 * so newly-known brands eventually get picked up without manual flushing.
 *
 * Used by the aggregation pipeline as the fallback when a source doesn't
 * ship a logo URL of its own (e.g. RemoteOK as of 2025).
 */
export async function resolveCompanyLogo(
  companyName: string,
): Promise<string | null> {
  const normalized = normalize(companyName);
  if (!normalized) return null;

  const cached = await prisma.companyLogo.findUnique({
    where: { normalizedName: normalized },
  });
  if (cached) {
    if (cached.logoUrl) return cached.logoUrl;
    const ageMs = Date.now() - cached.lookedUpAt.getTime();
    if (ageMs < NEGATIVE_TTL) return null; // negative cache still fresh
    // Otherwise fall through and re-look-up.
  }

  const match = await searchBrand(companyName);
  const domain = match?.domain ?? null;
  const imgUrl = domain
    ? match?.logo_url ?? buildLogoImgUrl(domain, { format: "png", size: 256 })
    : null;

  await prisma.companyLogo.upsert({
    where: { normalizedName: normalized },
    create: {
      normalizedName: normalized,
      displayName: companyName,
      domain,
      logoUrl: imgUrl,
    },
    update: {
      displayName: companyName,
      domain,
      logoUrl: imgUrl,
      lookedUpAt: new Date(),
    },
  });

  return imgUrl;
}
