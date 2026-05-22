import type { Metadata } from "next";
import type { Job } from "@/lib/generated/prisma/client";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { locationLabel, salaryLabel, relativeTime } from "@/lib/format";
import { getSource, jobAttribution } from "@/lib/sources";
import { HeroBanner } from "./_components/HeroBanner";
import { ApplyButton } from "./_components/ApplyButton";
import { SaveJobButton } from "@/components/account/SaveJobButton";
import { getSessionUser } from "@/lib/auth/session";
import { JobJsonLd } from "./_components/JobJsonLd";
import { SimilarJobs } from "./_components/SimilarJobs";
import { fetchSimilarJobs } from "./_data/related";
import { AdSlot } from "@/components/ads/AdSlot";
import { BreadcrumbJsonLd } from "@/components/schema/BreadcrumbJsonLd";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/seo/Breadcrumbs";
import { pageOpenGraph } from "@/lib/seo/og";
import { cityToSlug, countryToSlug } from "@/lib/locations";
import { countryName } from "@/lib/format";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

interface PageParams {
  id: string;
  slug: string;
}

async function getJob(id: string) {
  return prisma.job.findUnique({ where: { id } });
}

/**
 * Build a STRUCTURED meta description from job fields. SEO best practice
 * for job-board SERPs is to lead with the role's identifying facts —
 * title, employer, location, salary — before any description prose, so
 * scanners in the SERP see what they need without parsing a sentence.
 *
 * Template shape (subject to ≤160 char cap):
 *   "{Title} at {Company} in {Location} — {Salary}. {Cleaned snippet}"
 *
 * The snippet is the description text with leading ALL-CAPS section
 * headers ("WHO WE ARE", "OVERVIEW", "ABOUT STRIPE") and other heading
 * tokens stripped. When there's no room left after the lead, the snippet
 * is omitted entirely — the lead alone is still a usable meta.
 */
function cleanedSnippet(text: string): string {
  let cleaned = text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .trim();

  const words = cleaned.split(" ");
  let skip = 0;
  while (skip < words.length && skip < 12) {
    const w = words[skip];
    if (!w) {
      skip++;
      continue;
    }
    const core = w.replace(/[^\p{L}\p{N}]+$/u, "");
    if (core.length === 0) {
      skip++;
      continue;
    }
    if (/\p{Ll}/u.test(core)) break;
    skip++;
  }
  if (skip > 0 && skip < words.length) {
    cleaned = words.slice(skip).join(" ").trim();
  }
  return cleaned;
}

function jobMetaDescription(job: Job): string {
  const location = locationLabel({
    city: job.city,
    countryCode: job.countryCode,
  });
  const salary = salaryLabel(job);

  let lead = `${job.title} at ${job.companyName}`;
  if (location && location !== "Unknown") lead += ` in ${location}`;
  if (salary) lead += ` — ${salary}`;

  const snippet = cleanedSnippet(job.descriptionText);

  // No room left for a snippet? The lead alone is still a structured,
  // SEO-friendly meta. Hard cap 160 just in case the lead itself is long.
  if (lead.length >= 140 || snippet.length === 0) {
    return lead.length <= 160 ? lead : lead.slice(0, 159).trim() + "…";
  }

  const combined = `${lead}. ${snippet}`;
  if (combined.length <= 160) return combined;

  const slice = combined.slice(0, 160);
  const sentenceEnd = slice.lastIndexOf(". ");
  if (sentenceEnd > lead.length) return slice.slice(0, sentenceEnd + 1);
  const wordEnd = slice.lastIndexOf(" ");
  return (wordEnd > lead.length ? slice.slice(0, wordEnd) : slice) + "…";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return { title: "Job not found" };

  const description = jobMetaDescription(job);
  const canonical = `${SITE_URL}/job/${job.id}/${slugify(job.title)}`;

  return {
    title: `${job.title} — ${job.companyName}`,
    description,
    alternates: { canonical },
    openGraph: pageOpenGraph({
      title: `${job.title} at ${job.companyName}`,
      description,
      url: canonical,
    }),
  };
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { id, slug } = await params;
  const job = await getJob(id);
  if (!job) notFound();

  // Canonical-redirect mismatched slugs so search engines settle on one URL.
  const canonicalSlug = slugify(job.title);
  if (slug !== canonicalSlug) {
    redirect(`/job/${id}/${canonicalSlug}`);
  }

  const source = getSource(job.source);
  const attribution = source ? jobAttribution(job, source.displayName) : null;
  const salary = salaryLabel(job);
  const location = locationLabel({ city: job.city, countryCode: job.countryCode });
  const similar = await fetchSimilarJobs(job);

  // Saved-state for the Save button: only query when signed in.
  const user = await getSessionUser();
  const initialSaved = user
    ? (await prisma.savedJob.findUnique({
        where: { userId_jobId: { userId: user.id, jobId: job.id } },
      })) !== null
    : false;

  // Breadcrumb ladder. ZZ ("unknown") jobs degrade to a 2-step trail so
  // we don't link to a nonexistent country page. The visible component
  // and the BreadcrumbJsonLd share the same trail (different href shapes
  // — JSON-LD wants absolute URLs, visible nav wants relative paths).
  const trail: BreadcrumbItem[] = [
    { name: "All jobs", href: "/jobs" },
  ];
  if (job.countryCode && job.countryCode !== "ZZ") {
    const countrySlug = countryToSlug(job.countryCode);
    trail.push({
      name: countryName(job.countryCode),
      href: `/jobs/${countrySlug}`,
    });
    if (job.city) {
      trail.push({
        name: job.city,
        href: `/jobs/${countrySlug}/${cityToSlug(job.city)}`,
      });
    }
  }
  trail.push({
    name: job.title,
    href: `/job/${job.id}/${canonicalSlug}`,
  });

  const breadcrumbs = [
    { name: "Home", url: `${SITE_URL}/` },
    ...trail.map((t) => ({ name: t.name, url: `${SITE_URL}${t.href}` })),
  ];

  return (
    <article className="mx-auto max-w-4xl px-6 py-10">
      <JobJsonLd job={job} siteUrl={SITE_URL} />
      <BreadcrumbJsonLd items={breadcrumbs} />
      <Breadcrumbs className="mb-6" items={trail} />

      <HeroBanner companyName={job.companyName} logoUrl={job.companyLogoUrl} />

      <header className="mt-8 flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {job.title}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-foreground/70">
          <span className="font-medium text-foreground">{job.companyName}</span>
          <span>{location}</span>
          {salary ? <span>{salary}</span> : null}
          <span>Posted {relativeTime(job.postedDate)}</span>
          {job.workMode !== "unknown" ? (
            <span className="rounded-full border border-foreground/15 px-2 py-0.5 text-xs uppercase tracking-wider">
              {job.workMode}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <ApplyButton
            jobId={job.id}
            company={job.companyName}
            city={job.city}
            countryCode={job.countryCode}
            isRemote={job.workMode === "remote"}
          />
          <SaveJobButton jobId={job.id} initialSaved={initialSaved} />
          {attribution ? (
            <span className="text-xs text-foreground/50">
              {attribution.before}
              <a
                href={attribution.href}
                rel={attribution.rel}
                className="underline-offset-2 hover:underline"
              >
                {attribution.linkText}
              </a>
              {attribution.after}
            </span>
          ) : null}
        </div>
      </header>

      {job.descriptionHtml ? (
        <div
          className="prose prose-sm mt-10 max-w-none text-foreground/90 [&_a]:text-foreground [&_a]:underline [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-semibold [&_li]:my-1 [&_p]:my-3 [&_ul]:list-disc [&_ul]:pl-6"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: job.descriptionHtml }}
        />
      ) : (
        <p className="mt-10 text-sm text-foreground/60">
          No description provided by the source.
        </p>
      )}

      {job.skills.length > 0 ? (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-foreground/60">
            Skills
          </h2>
          <ul className="flex flex-wrap gap-2">
            {job.skills.map((skill) => (
              <li
                key={skill}
                className="rounded-full bg-muted px-3 py-1 text-xs font-medium"
              >
                {skill}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <AdSlot placement="detail" />
      <SimilarJobs jobs={similar} />
    </article>
  );
}
