import { ImageResponse } from "next/og";
import { countryName } from "@/lib/format";
import { countryToSlug, resolveCountrySlug } from "@/lib/locations";
import { logoDataUri, OG_SIZE, ogOptions } from "@/lib/og/brand";
import { CountryCard } from "@/lib/og/cards";
import { licenceFreeCounts, roundedCount, topHiringCompanies } from "@/lib/og/counts";

/**
 * Country share card: flag + "Jobs in India" + a fresh-jobs stat + a strip of
 * the top hiring companies' logos, in the Toplisters brand. Used when /jobs/<country> is shared (social posts,
 * chat unfurls). The stat counts licence-free sources only — see
 * lib/og/counts.ts for why it can be lower than the on-page total.
 */

export const dynamic = "force-dynamic";
export const alt = "Jobs by country — Toplisters";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function CountryOgImage({
  params,
}: {
  params: Promise<{ country: string }>;
}) {
  const { country: slug } = await params;
  const iso = resolveCountrySlug(slug);
  const [counts, top, options] = await Promise.all([
    iso ? licenceFreeCounts({ countryCode: iso }) : Promise.resolve({ today: 0, active: 0 }),
    iso ? topHiringCompanies(iso, 6) : Promise.resolve([]),
    ogOptions(),
  ]);
  // Logo strip: only companies whose logo actually loads (initials tiles in a
  // "hiring now" row read as noise), up to 5.
  const hiring = (
    await Promise.all(top.map(async (c) => ({ name: c.name, logo: await logoDataUri(c.logoUrl) })))
  )
    .filter((c) => c.logo)
    .slice(0, 5);

  const stat =
    counts.today >= 5
      ? `${roundedCount(counts.today)} new jobs today`
      : counts.active > 0
        ? `${roundedCount(counts.active)} open roles`
        : "Fresh roles, updated daily";

  return new ImageResponse(
    (
      <CountryCard
        iso={iso}
        name={iso ? countryName(iso) : "your country"}
        path={`/jobs/${iso ? countryToSlug(iso) : slug}`}
        stat={stat}
        hiring={hiring}
      />
    ),
    options,
  );
}
