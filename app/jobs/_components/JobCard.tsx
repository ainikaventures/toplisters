import Link from "next/link";
import type { Job } from "@/lib/generated/prisma/client";
import { InitialsAvatar } from "./InitialsAvatar";
import { shortLocation, salaryLabel } from "@/lib/format";

/**
 * Spec line 143: cards show only the company logo by default; hover reveals
 * the title + location. The overlay uses Tailwind group-hover so no JS is
 * needed — keyboard focus on the wrapping <Link> also triggers the reveal
 * via :focus-within for accessibility.
 */
export function JobCard({ job }: { job: Job }) {
  const salary = salaryLabel(job);
  const location = shortLocation({ city: job.city, countryCode: job.countryCode });

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="group relative block aspect-square overflow-hidden rounded-xl border border-foreground/10 bg-muted transition-colors hover:border-foreground/30 focus-visible:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
    >
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <InitialsAvatar
          name={job.companyName}
          className="size-full max-h-[125px] max-w-[125px]"
        />
      </div>

      <div
        className="absolute inset-0 flex flex-col justify-end gap-1 bg-gradient-to-t from-foreground/95 via-foreground/80 to-foreground/0 p-4 text-background opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug">
          {job.title}
        </h3>
        <p className="text-xs text-background/80">{job.companyName}</p>
        <p className="text-xs text-background/70">
          {location}
          {salary ? <span className="ml-2">· {salary}</span> : null}
        </p>
      </div>

      {job.isFeatured ? (
        <span className="absolute right-2 top-2 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-background">
          Featured
        </span>
      ) : null}
    </Link>
  );
}
