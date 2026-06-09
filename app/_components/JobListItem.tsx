import Link from "next/link";
import type { Job } from "@/lib/generated/prisma/client";
import { InitialsAvatar } from "@/app/jobs/_components/InitialsAvatar";
import {
  locationLabel,
  salaryLabel,
  workModeLabel,
  jobTypeLabel,
  relativeTime,
  excerpt,
} from "@/lib/format";
import { slugify } from "@/lib/slug";

/**
 * Text-rich, always-visible job row for the landing page.
 *
 * Unlike the logo-first JobCard used on /jobs (spec line 143, detail hidden
 * behind hover), this surfaces the title, company, location, work mode, type,
 * salary and posted date as crawlable text — better for SEO and for a visitor
 * scanning the latest roles on the home page. Rendered as a semantic <article>
 * with a single <h3> title link and a <time> for the posting date.
 */
export function JobListItem({ job }: { job: Job }) {
  const href = `/job/${job.id}/${slugify(job.title)}`;
  const location = locationLabel({ city: job.city, countryCode: job.countryCode });
  const salary = salaryLabel(job);
  const workMode = workModeLabel(job.workMode);
  const jobType = jobTypeLabel(job.jobType);
  const summary = excerpt(job.descriptionText, 60);
  const postedIso = new Date(job.postedDate).toISOString();

  const tags = [workMode, jobType, salary].filter(Boolean) as string[];

  return (
    <article className="group relative flex gap-4 rounded-xl border border-foreground/10 bg-background p-4 transition-colors hover:border-foreground/30">
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-foreground/10 bg-muted">
        {job.companyLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={job.companyLogoUrl}
            alt={`${job.companyName} logo`}
            loading="lazy"
            className="max-h-10 max-w-10 object-contain"
          />
        ) : (
          <InitialsAvatar name={job.companyName} className="size-full" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold leading-snug">
          {/* Stretched link makes the whole card clickable while keeping the
              title as the accessible link text. */}
          <Link
            href={href}
            className="after:absolute after:inset-0 hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {job.title}
          </Link>
        </h3>

        <p className="mt-0.5 truncate text-sm text-foreground/70">
          <span className="font-medium text-foreground/80">{job.companyName}</span>
          <span className="mx-1.5 text-foreground/30">·</span>
          {location}
        </p>

        {summary ? (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-foreground/60">
            {summary}
          </p>
        ) : null}

        {tags.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <li
                key={t}
                className="rounded-full border border-foreground/10 bg-muted px-2 py-0.5 text-xs text-foreground/70"
              >
                {t}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <time
        dateTime={postedIso}
        className="shrink-0 self-start text-xs text-foreground/50"
      >
        {relativeTime(job.postedDate)}
      </time>

      {job.isFeatured ? (
        <span className="absolute right-2 top-2 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-background">
          Featured
        </span>
      ) : null}
    </article>
  );
}
