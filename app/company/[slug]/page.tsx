import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { JobListItem } from "@/app/_components/JobListItem";
import { InitialsAvatar } from "@/app/jobs/_components/InitialsAvatar";
import { countryName } from "@/lib/format";
import { sourceType } from "@/lib/api/sources";
import { pageOpenGraph } from "@/lib/seo/og";

const ATS_LABEL: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  smartrecruiters: "SmartRecruiters",
  workday: "Workday",
  workable: "Workable",
  recruitmentrevolution: "Recruitment Revolution",
};

export const dynamic = "force-dynamic";

async function getCompany(slug: string) {
  // Degrade to "not found" if the companies table isn't migrated yet, rather
  // than 500-ing the page.
  try {
    return await prisma.company.findUnique({ where: { slug } });
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const company = await getCompany(slug);
  if (!company) return { title: "Company not found", robots: { index: false } };
  const where = company.countryCodes.slice(0, 3).map(countryName).join(", ");
  const desc = `${company.jobCount} open ${company.jobCount === 1 ? "role" : "roles"} at ${company.name}${
    where ? ` across ${where}` : ""
  }. Apply directly — logo, locations, and live openings on Toplisters.`;
  return {
    title: `${company.name} jobs`,
    description: desc,
    alternates: { canonical: `/company/${company.slug}` },
    openGraph: pageOpenGraph({ title: `Jobs at ${company.name}`, description: desc, url: `/company/${company.slug}` }),
  };
}

function flagEmoji(cc: string): string {
  if (cc.length !== 2) return "";
  return cc.toUpperCase().replace(/[A-Z]/g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));
}

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = await getCompany(slug);
  if (!company) notFound();

  const jobs = await prisma.job.findMany({
    where: { isActive: true, companyName: { in: company.companyNames } },
    orderBy: [{ isFeatured: "desc" }, { postedDate: "desc" }],
    take: 100,
  });

  // Which direct ATS platform(s) actually sourced this company's jobs.
  const directPlatforms = [
    ...new Set(jobs.filter((j) => sourceType(j.source) === "direct").map((j) => j.source)),
  ]
    .map((s) => ATS_LABEL[s] ?? null)
    .filter(Boolean) as string[];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <nav className="mb-6 text-sm text-foreground/50">
          <Link href="/companies" className="hover:text-foreground">Companies</Link>
          <span className="mx-1.5">/</span>
          <span className="text-foreground/70">{company.name}</span>
        </nav>

        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-foreground/10 bg-muted">
            {company.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logoUrl} alt={`${company.name} logo`} className="max-h-12 max-w-12 object-contain" />
            ) : (
              <InitialsAvatar name={company.name} className="size-full" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-semibold tracking-tight">{company.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground/60">
              <span className="font-medium text-foreground/80">
                {company.jobCount} open {company.jobCount === 1 ? "role" : "roles"}
              </span>
              {company.domain ? (
                <a
                  href={`https://${company.domain}`}
                  target="_blank"
                  rel="noopener nofollow"
                  className="hover:text-foreground hover:underline"
                >
                  {company.domain} ↗
                </a>
              ) : null}
              {directPlatforms.length > 0 ? (
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  Direct from {directPlatforms.join(", ")}
                </span>
              ) : company.hasDirect ? (
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  Direct apply
                </span>
              ) : null}
              {company.visaFriendly ? (
                <span className="rounded-full border border-foreground/15 bg-muted px-2 py-0.5 text-xs">
                  Visa-friendly roles
                </span>
              ) : null}
            </div>

            {company.countryCodes.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {company.countryCodes.map((cc) => (
                  <span
                    key={cc}
                    className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-muted px-2 py-0.5 text-xs text-foreground/70"
                  >
                    <span aria-hidden>{flagEmoji(cc)}</span>
                    {countryName(cc)}
                  </span>
                ))}
              </div>
            ) : null}

            {company.cities.length > 0 ? (
              <p className="mt-2 text-xs text-foreground/45">
                Locations: {company.cities.slice(0, 12).join(" · ")}
                {company.cities.length > 12 ? " …" : ""}
              </p>
            ) : null}
          </div>
        </header>

        {jobs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-foreground/15 p-8 text-center text-sm text-foreground/50">
            No live roles right now — check back soon.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3">
            {jobs.map((job) => (
              <li key={job.id} className="min-w-0">
                <JobListItem job={job} />
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
