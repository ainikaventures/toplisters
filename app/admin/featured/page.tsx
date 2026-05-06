import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "../_components/AdminNav";
import {
  locationLabel,
  relativeTime,
  salaryLabel,
} from "@/lib/format";
import { slugify } from "@/lib/slug";
import { fetchAdminJobs, PAGE_SIZE } from "./_data/jobs";
import { toggleFeatured } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Featured listings",
  robots: { index: false },
};

interface PageSearchParams {
  q?: string;
  page?: string;
}

export default async function FeaturedAdminPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const search = params.q?.trim() || null;
  const pageNum = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const { jobs, total, featuredCount } = await fetchAdminJobs({
    search,
    page: pageNum,
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <AdminNav />

        <header className="mb-6 flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Featured listings
          </h1>
          <p className="text-sm text-foreground/60">
            {featuredCount === 0
              ? "Nothing featured. Pick a job below and click Feature."
              : `${featuredCount} ${featuredCount === 1 ? "job" : "jobs"} currently featured. Featured rows rank above the rest of the listing and show a ribbon on /jobs.`}
          </p>
        </header>

        <form
          method="get"
          action="/admin/featured"
          className="mb-6 flex flex-wrap items-end gap-2"
        >
          <label className="flex flex-1 flex-col gap-1.5 sm:max-w-md">
            <span className="text-xs font-medium uppercase tracking-wider text-foreground/60">
              Search title or company
            </span>
            <input
              type="search"
              name="q"
              defaultValue={search ?? ""}
              placeholder="Engineer, Vonage, …"
              className="rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-foreground/90"
          >
            Search
          </button>
          {search ? (
            <Link
              href="/admin/featured"
              className="rounded-md border border-foreground/15 px-4 py-2 text-sm font-medium hover:border-foreground/40"
            >
              Clear
            </Link>
          ) : null}
        </form>

        {jobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-foreground/15 px-8 py-16 text-center text-sm text-foreground/60">
            No active jobs match.
          </div>
        ) : (
          <ul className="divide-y divide-foreground/10 rounded-xl border border-foreground/10">
            {jobs.map((job) => (
              <li
                key={job.id}
                className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 ${
                  job.isFeatured ? "bg-foreground/5" : ""
                }`}
              >
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-foreground/10 bg-muted">
                  {job.companyLogoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={job.companyLogoUrl}
                      alt=""
                      className="size-full object-contain"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-foreground/60">
                      {(job.companyName[0] ?? "?").toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <Link
                      href={`/job/${job.id}/${slugify(job.title)}`}
                      className="truncate text-sm font-medium hover:underline-offset-2 hover:underline"
                    >
                      {job.title}
                    </Link>
                    {job.isFeatured ? (
                      <span className="shrink-0 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-background">
                        Featured
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-foreground/60">
                    {job.companyName} ·{" "}
                    {locationLabel({ city: job.city, countryCode: job.countryCode })}
                    {salaryLabel(job) ? ` · ${salaryLabel(job)}` : ""} ·{" "}
                    Posted {relativeTime(job.postedDate)}
                  </p>
                </div>

                <form action={toggleFeatured.bind(null, job.id, !job.isFeatured)}>
                  <button
                    type="submit"
                    className={
                      job.isFeatured
                        ? "rounded-md border border-foreground/15 px-3 py-2 text-xs font-medium hover:border-foreground/40"
                        : "rounded-md bg-foreground px-3 py-2 text-xs font-semibold text-background hover:bg-foreground/90"
                    }
                  >
                    {job.isFeatured ? "Unfeature" : "Feature"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 ? (
          <nav className="mt-6 flex items-center justify-between gap-4 text-sm">
            <PageLink
              page={pageNum - 1}
              search={search}
              disabled={pageNum <= 1}
              label="← Previous"
            />
            <span className="text-foreground/60">
              Page <strong className="text-foreground">{pageNum}</strong> of{" "}
              {totalPages} · {total.toLocaleString()} total
            </span>
            <PageLink
              page={pageNum + 1}
              search={search}
              disabled={pageNum >= totalPages}
              label="Next →"
            />
          </nav>
        ) : null}
      </div>
    </div>
  );
}

function PageLink({
  page,
  search,
  disabled,
  label,
}: {
  page: number;
  search: string | null;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return (
      <span className="rounded-md border border-foreground/10 px-3 py-2 text-sm text-foreground/30">
        {label}
      </span>
    );
  }
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return (
    <Link
      href={qs ? `/admin/featured?${qs}` : "/admin/featured"}
      className="rounded-md border border-foreground/15 px-3 py-2 text-sm font-medium hover:border-foreground/40"
    >
      {label}
    </Link>
  );
}
