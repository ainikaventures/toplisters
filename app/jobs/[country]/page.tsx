import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { countryToSlug, resolveCountrySlug } from "@/lib/locations";
import { countryName } from "@/lib/format";
import { JobCard } from "../_components/JobCard";
import { fetchCountryPageData } from "./_data/country";
import { BreadcrumbJsonLd } from "@/components/schema/BreadcrumbJsonLd";
import { ItemListJsonLd } from "@/components/schema/ItemListJsonLd";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { TrackJobsList } from "@/components/analytics/TrackJobsList";
import { pageOpenGraph } from "@/lib/seo/og";
import { slugify } from "@/lib/slug";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

interface PageParams {
  country: string;
}

async function load(params: PageParams) {
  const iso = resolveCountrySlug(params.country);
  if (!iso) return { redirect404: true } as const;

  const canonical = countryToSlug(iso);
  if (params.country !== canonical) {
    return { redirectTo: `/jobs/${canonical}` as const };
  }

  const data = await fetchCountryPageData(iso);
  if (!data) return { redirect404: true } as const;
  return { data, canonical } as const;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const result = await load(await params);
  if ("redirect404" in result || "redirectTo" in result) {
    return { title: "Country jobs" };
  }
  const country = countryName(result.data.countryCode);
  const jobsLabel = result.data.totalJobs === 1 ? "job" : "jobs";
  const rolesLabel = result.data.totalJobs === 1 ? "role" : "roles";
  const citiesPhrase =
    result.data.cities.length === 1
      ? "1 city"
      : `${result.data.cities.length} cities`;
  const url = `${SITE_URL}/jobs/${result.canonical}`;
  return {
    title: `${result.data.totalJobs} ${jobsLabel} in ${country}`,
    description: `Browse ${result.data.totalJobs.toLocaleString()} active ${rolesLabel} across ${citiesPhrase} in ${country}.`,
    alternates: { canonical: url },
    openGraph: pageOpenGraph({
      title: `${result.data.totalJobs} ${jobsLabel} in ${country}`,
      description: `Browse ${result.data.totalJobs.toLocaleString()} active ${rolesLabel} across ${citiesPhrase} in ${country}.`,
      url,
    }),
  };
}

export default async function CountryPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const result = await load(await params);
  if ("redirectTo" in result && result.redirectTo) redirect(result.redirectTo);
  if ("redirect404" in result) notFound();

  const { data } = result;
  const country = countryName(data.countryCode);
  const countrySlug = countryToSlug(data.countryCode);

  const breadcrumbs = [
    { name: "Home", url: `${SITE_URL}/` },
    { name: "Browse jobs", url: `${SITE_URL}/jobs` },
    { name: country, url: `${SITE_URL}/jobs/${countrySlug}` },
  ];
  const listItems = data.jobs.map((job, i) => ({
    position: i + 1,
    url: `${SITE_URL}/job/${job.id}/${slugify(job.title)}`,
    name: job.title,
  }));

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <BreadcrumbJsonLd items={breadcrumbs} />
      <ItemListJsonLd items={listItems} />
      <TrackJobsList
        listType="country"
        country={data.countryCode}
        totalJobs={data.totalJobs}
      />
      <Breadcrumbs
        className="mb-6"
        items={[
          { name: "All jobs", href: "/jobs" },
          { name: country, href: `/jobs/${countrySlug}` },
        ]}
      />

      <header className="mb-8 flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Jobs in {country}
        </h1>
        <p className="max-w-2xl text-sm text-foreground/70">
          {data.totalJobs.toLocaleString()} active{" "}
          {data.totalJobs === 1 ? "role" : "roles"} across{" "}
          {data.cities.length} {data.cities.length === 1 ? "city" : "cities"}{" "}
          on file. Pick a city below to see the open positions.
        </p>
      </header>

      {data.cities.length > 0 ? (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Cities
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.cities.map((city) => (
              <li key={city.slug}>
                <Link
                  href={`/jobs/${countryToSlug(data.countryCode)}/${city.slug}`}
                  className="flex items-center justify-between gap-4 rounded-xl border border-foreground/10 bg-muted/40 px-4 py-3 transition-colors hover:border-foreground/30 hover:bg-muted"
                >
                  <span className="font-medium">{city.name}</span>
                  <span className="text-sm text-foreground/60">
                    {city.jobCount} {city.jobCount === 1 ? "role" : "roles"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.jobs.length > 0 ? (
        <section>
          <div className="mb-3 flex items-end justify-between gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
              {data.cities.length > 0 ? "Latest roles" : "All roles"}
            </h2>
            {data.totalJobs > data.jobs.length ? (
              <Link
                href={`/jobs?country=${data.countryCode}`}
                className="text-xs text-foreground/60 underline-offset-2 hover:text-foreground hover:underline"
              >
                View all {data.totalJobs.toLocaleString()} →
              </Link>
            ) : null}
          </div>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
            {data.jobs.map((job) => (
              <li key={job.id}>
                <JobCard job={job} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
