import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { locationLabel, salaryLabel, workModeLabel } from "@/lib/format";
import { logoDataUri, OG_SIZE, ogOptions } from "@/lib/og/brand";
import { GoneCard, JobCard } from "@/lib/og/cards";

/**
 * Per-job OG image (TL-060). Generated at request time and cached at the
 * edge — important not to pre-render: the job catalogue is 95k+ rows.
 *
 * This is the card social posts unfurl with, so the employer's own logo is
 * the hero (initials tile when we have none). Layout lives in lib/og/cards.
 */

export const dynamic = "force-dynamic";
export const alt = "Job opening — Toplisters";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function JobOgImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await prisma.job.findUnique({
    where: { id },
    select: {
      title: true,
      companyName: true,
      companyLogoUrl: true,
      city: true,
      countryCode: true,
      workMode: true,
      salaryMin: true,
      salaryMax: true,
      salaryCurrency: true,
      salaryPeriod: true,
    },
  });

  // Fallback: render a generic card when the job's been removed. Avoids
  // a 404 from the crawler, which some platforms display as a broken
  // preview rather than falling back to the site OG.
  if (!job) return new ImageResponse(<GoneCard />, await ogOptions());

  const [logo, options] = await Promise.all([logoDataUri(job.companyLogoUrl), ogOptions()]);
  return new ImageResponse(
    (
      <JobCard
        title={job.title}
        companyName={job.companyName}
        logo={logo}
        countryCode={job.countryCode}
        location={locationLabel({ city: job.city, countryCode: job.countryCode })}
        salary={salaryLabel(job)}
        workMode={workModeLabel(job.workMode) || null}
      />
    ),
    options,
  );
}
