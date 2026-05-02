import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { countryToSlug, resolveCountrySlug } from "@/lib/locations";
import { countryName } from "@/lib/format";
import { fetchCountryPageData } from "./_data/country";

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
  return {
    title: `${result.data.totalJobs} jobs in ${country}`,
    description: `Browse ${result.data.totalJobs} active roles across ${result.data.cities.length} cities in ${country}.`,
    alternates: { canonical: `${SITE_URL}/jobs/${result.canonical}` },
  };
}

export default async function CountryPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const result = await load(await params);
  if ("redirectTo" in result) redirect(result.redirectTo);
  if ("redirect404" in result) notFound();

  const { data } = result;
  const country = countryName(data.countryCode);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <nav className="mb-6 flex items-center gap-2 text-xs text-foreground/60">
        <Link href="/jobs" className="hover:text-foreground">All jobs</Link>
        <span>/</span>
        <span className="text-foreground">{country}</span>
      </nav>

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

      {data.cities.length === 0 ? (
        <div className="rounded-xl border border-dashed border-foreground/15 px-8 py-16 text-center">
          <h2 className="text-lg font-semibold">No city pages yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-foreground/60">
            We haven&apos;t reached the 5-job threshold for any city in{" "}
            {country} yet. Try{" "}
            <Link href={`/jobs?country=${data.countryCode}`} className="font-medium underline-offset-2 hover:underline">
              the full {country} listing
            </Link>{" "}
            instead.
          </p>
        </div>
      ) : (
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
      )}
    </div>
  );
}
