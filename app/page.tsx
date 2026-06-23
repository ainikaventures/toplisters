import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { fetchJobs, type JobFilters } from "./jobs/_data/query";
import { JobListItem } from "./_components/JobListItem";
import { TrackJobsList } from "@/components/analytics/TrackJobsList";
import { BreadcrumbJsonLd } from "@/components/schema/BreadcrumbJsonLd";
import { ItemListJsonLd } from "@/components/schema/ItemListJsonLd";
import { SiteHeader } from "@/components/site/SiteHeader";
import { countryFromHeaders } from "@/lib/pageviews";
import { countryName } from "@/lib/format";
import { slugify } from "@/lib/slug";
import { pageOpenGraph } from "@/lib/seo/og";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  description:
    "The latest jobs from across the world, surfaced for your region first. Browse remote and on-site roles, or explore them on an interactive 3D globe.",
  alternates: { canonical: "/" },
  openGraph: pageOpenGraph({
    title: "Toplisters.xyz — The latest jobs, near you",
    description:
      "Fresh remote and on-site roles surfaced for your region first.",
    url: "/",
  }),
};

// Reads request headers (visitor geo) → must render per-request.
export const dynamic = "force-dynamic";

const EMPTY_FILTERS: JobFilters = {
  q: null,
  country: null,
  category: null,
  workMode: null,
  jobType: null,
  collarType: null,
  salaryMin: null,
  salaryMax: null,
  visaSponsor: null,
};

export default async function Home() {
  // Cloudflare gives us the visitor's ISO-2 country via CF-IPCountry. When
  // it's present we lead with that region's latest roles; otherwise (local
  // dev, non-CF edge, or a country with nothing live yet) we fall back to
  // the global latest list so the page is never empty.
  const requestHeaders = await headers();
  const detectedCountry = countryFromHeaders(requestHeaders);

  let country = detectedCountry;
  let result = country
    ? await fetchJobs({ ...EMPTY_FILTERS, country }, 1)
    : await fetchJobs(EMPTY_FILTERS, 1);

  if (country && result.jobs.length === 0) {
    // Region detected but no live roles there yet — show the world instead.
    country = null;
    result = await fetchJobs(EMPTY_FILTERS, 1);
  }

  const { jobs, total } = result;
  const regionLabel = country ? countryName(country) : null;

  const breadcrumbs = [{ name: "Home", url: `${SITE_URL}/` }];
  const listItems = jobs.map((job, i) => ({
    position: i + 1,
    url: `${SITE_URL}/job/${job.id}/${slugify(job.title)}`,
    name: `${job.title} — ${job.companyName}`,
  }));

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <BreadcrumbJsonLd items={breadcrumbs} />
      <ItemListJsonLd items={listItems} />
      <TrackJobsList
        listType={country ? "country" : "all"}
        country={country ?? undefined}
        totalJobs={total}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {regionLabel
                ? `Latest jobs in ${regionLabel}`
                : "Latest jobs worldwide"}
            </h1>
            <p className="mt-2 text-sm text-foreground/60">
              {regionLabel
                ? `Freshly aggregated roles for your region — ${total.toLocaleString()} active ${total === 1 ? "role" : "roles"}.`
                : `Freshly aggregated roles from across the world — ${total.toLocaleString()} active ${total === 1 ? "role" : "roles"}.`}
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/jobs"
              className="rounded-md bg-foreground px-4 py-2 font-medium text-background hover:opacity-90"
            >
              Browse all jobs
            </Link>
            <Link
              href="/globe"
              className="rounded-md border border-foreground/15 px-4 py-2 font-medium hover:border-foreground/40"
            >
              Explore the globe
            </Link>
          </div>
        </header>

        {jobs.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {jobs.map((job) => (
                <li key={job.id} className="min-w-0">
                  <JobListItem job={job} />
                </li>
              ))}
            </ul>
            <div className="mt-10 flex justify-center">
              <Link
                href={country ? `/jobs?country=${country}` : "/jobs"}
                className="rounded-md border border-foreground/15 px-5 py-2.5 text-sm font-medium hover:border-foreground/40"
              >
                {regionLabel ? `See all jobs in ${regionLabel}` : "See all jobs"}
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-foreground/15 px-8 py-16 text-center">
      <h2 className="text-lg font-semibold">No jobs yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-foreground/60">
        The aggregator hasn&apos;t run yet — try{" "}
        <code className="rounded bg-muted px-1.5 py-0.5">
          npm run worker -- --once
        </code>{" "}
        from the project root.
      </p>
    </div>
  );
}
