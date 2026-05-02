import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { locationLabel, salaryLabel, relativeTime } from "@/lib/format";
import { getSource } from "@/lib/sources";
import { HeroBanner } from "./_components/HeroBanner";
import { ApplyButton } from "./_components/ApplyButton";
import { JobJsonLd } from "./_components/JobJsonLd";
import { SimilarJobs } from "./_components/SimilarJobs";
import { fetchSimilarJobs } from "./_data/related";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

interface PageParams {
  id: string;
  slug: string;
}

async function getJob(id: string) {
  return prisma.job.findUnique({ where: { id } });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return { title: "Job not found" };

  const description = job.descriptionText.slice(0, 155).trim() ||
    `${job.title} at ${job.companyName}`;
  const location = locationLabel({ city: job.city, countryCode: job.countryCode });

  return {
    title: `${job.title} — ${job.companyName}`,
    description,
    alternates: {
      canonical: `${SITE_URL}/job/${job.id}/${slugify(job.title)}`,
    },
    openGraph: {
      title: `${job.title} at ${job.companyName}`,
      description: `${location}${salaryLabel(job) ? ` · ${salaryLabel(job)}` : ""}`,
      type: "website",
      url: `${SITE_URL}/job/${job.id}/${slugify(job.title)}`,
    },
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
  const salary = salaryLabel(job);
  const location = locationLabel({ city: job.city, countryCode: job.countryCode });
  const similar = await fetchSimilarJobs(job);

  return (
    <article className="mx-auto max-w-4xl px-6 py-10">
      <JobJsonLd job={job} siteUrl={SITE_URL} />

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
          <ApplyButton jobId={job.id} />
          {source ? (
            <span className="text-xs text-foreground/50">
              via{" "}
              <a
                href={job.applyUrl}
                rel="noopener nofollow"
                className="underline-offset-2 hover:underline"
              >
                {source.displayName}
              </a>
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

      <SimilarJobs jobs={similar} />
    </article>
  );
}
