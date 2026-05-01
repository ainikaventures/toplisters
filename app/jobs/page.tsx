import type { Metadata } from "next";
import type { $Enums } from "@/lib/generated/prisma/client";
import { fetchJobs, fetchFacets, PAGE_SIZE, type JobFilters } from "./_data/query";
import { JobCard } from "./_components/JobCard";
import { JobsFilters } from "./_components/JobsFilters";
import { Pagination } from "./_components/Pagination";

export const metadata: Metadata = {
  title: "Browse jobs",
  description:
    "Search remote and on-site roles from across the world. Filter by country, category, work mode, salary, and more.",
};

const WORK_MODE_VALUES = new Set<$Enums.WorkMode>([
  "remote",
  "hybrid",
  "onsite",
  "unknown",
]);
const JOB_TYPE_VALUES = new Set<$Enums.JobType>([
  "full_time",
  "part_time",
  "contract",
  "temp",
  "internship",
]);
const COLLAR_VALUES = new Set<$Enums.CollarType>([
  "blue",
  "white",
  "grey",
  "unknown",
]);

function pickEnum<T extends string>(
  value: string | string[] | undefined,
  allowed: Set<T>,
): T | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v && allowed.has(v as T) ? (v as T) : null;
}

function pickString(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.trim() ? v.trim() : null;
}

function pickInt(value: string | string[] | undefined): number | null {
  const v = Array.isArray(value) ? value[0] : value;
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const filters: JobFilters = {
    q: pickString(params.q),
    country: pickString(params.country),
    category: pickString(params.category),
    workMode: pickEnum<$Enums.WorkMode>(params.workMode, WORK_MODE_VALUES),
    jobType: pickEnum<$Enums.JobType>(params.jobType, JOB_TYPE_VALUES),
    collarType: pickEnum<$Enums.CollarType>(params.collarType, COLLAR_VALUES),
    salaryMin: pickInt(params.salaryMin),
    salaryMax: pickInt(params.salaryMax),
  };
  const page = Math.max(1, pickInt(params.page) ?? 1);

  const [{ jobs, total }, facets] = await Promise.all([
    fetchJobs(filters, page),
    fetchFacets(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Strip undefined/array values so Pagination can build clean URLs.
  const cleanParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && v.trim()) cleanParams[k] = v;
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Browse jobs</h1>
          <p className="text-sm text-foreground/60">
            {total.toLocaleString()} active {total === 1 ? "role" : "roles"}
            {filters.q ? ` matching "${filters.q}"` : ""}
          </p>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto">
          <JobsFilters filters={filters} facets={facets} />
        </aside>

        <main className="flex flex-col gap-8">
          {jobs.length === 0 ? (
            <EmptyState hasFilters={hasAnyFilter(filters)} />
          ) : (
            <>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
                {jobs.map((job) => (
                  <li key={job.id}>
                    <JobCard job={job} />
                  </li>
                ))}
              </ul>
              <Pagination
                page={page}
                totalPages={totalPages}
                searchParams={cleanParams}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function hasAnyFilter(filters: JobFilters): boolean {
  return Object.values(filters).some((v) => v !== null && v !== "");
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-foreground/15 px-8 py-16 text-center">
      <h2 className="text-lg font-semibold">No jobs match</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-foreground/60">
        {hasFilters
          ? "Try clearing some filters or broadening the search."
          : "The aggregator hasn't run yet — try `npm run worker -- --once` from the project root."}
      </p>
      {hasFilters ? (
        <a
          href="/jobs"
          className="mt-6 inline-block rounded-md border border-foreground/15 px-4 py-2 text-sm font-medium hover:border-foreground/40"
        >
          Clear filters
        </a>
      ) : null}
    </div>
  );
}
