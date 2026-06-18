import type { Job } from "@/lib/generated/prisma/client";
import { JobListItem } from "@/app/_components/JobListItem";

export function SimilarJobs({ jobs }: { jobs: Job[] }) {
  if (jobs.length === 0) return null;
  return (
    <section className="mt-16 border-t border-foreground/10 pt-10">
      <h2 className="mb-6 text-xl font-semibold tracking-tight">Similar roles</h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {jobs.map((job) => (
          <li key={job.id} className="min-w-0">
            <JobListItem job={job} />
          </li>
        ))}
      </ul>
    </section>
  );
}
