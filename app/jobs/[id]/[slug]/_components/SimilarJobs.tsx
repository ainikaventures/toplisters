import type { Job } from "@/lib/generated/prisma/client";
import { JobCard } from "@/app/jobs/_components/JobCard";

export function SimilarJobs({ jobs }: { jobs: Job[] }) {
  if (jobs.length === 0) return null;
  return (
    <section className="mt-16 border-t border-foreground/10 pt-10">
      <h2 className="mb-6 text-xl font-semibold tracking-tight">Similar roles</h2>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
        {jobs.map((job) => (
          <li key={job.id}>
            <JobCard job={job} />
          </li>
        ))}
      </ul>
    </section>
  );
}
