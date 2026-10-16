import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { logoDataUri, OG_SIZE, ogOptions } from "@/lib/og/brand";
import { CompanyCard } from "@/lib/og/cards";
import { licenceFreeCounts, roundedCount } from "@/lib/og/counts";

/**
 * Company share card: the employer's logo front and centre, name, open-role
 * stat and top countries, framed in the Toplisters brand. Role count is
 * licence-free sources only (lib/og/counts.ts).
 */

export const dynamic = "force-dynamic";
export const alt = "Company jobs — Toplisters";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function CompanyOgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const company = await prisma.company
    .findUnique({
      where: { slug },
      select: { name: true, logoUrl: true, companyNames: true, countryCodes: true },
    })
    .catch(() => null);

  const name = company?.name ?? "Company";
  const [logo, counts, options] = await Promise.all([
    logoDataUri(company?.logoUrl),
    company
      ? licenceFreeCounts({ companyNames: company.companyNames.length ? company.companyNames : [company.name] })
      : Promise.resolve({ today: 0, active: 0 }),
    ogOptions(),
  ]);
  const stat =
    counts.active > 0
      ? `${roundedCount(counts.active)} open ${counts.active === 1 ? "role" : "roles"}`
      : "Now hiring";

  return new ImageResponse(
    <CompanyCard name={name} logo={logo} stat={stat} countryCodes={company?.countryCodes ?? []} />,
    options,
  );
}
