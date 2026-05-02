import type { Metadata } from "next";
import Link from "next/link";
import { countryName } from "@/lib/format";
import { countryToSlug } from "@/lib/locations";
import { fetchLocationsDirectory } from "./_data/locations";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Browse jobs by location",
  description:
    "Every country and major city we currently have open roles in. Pick a region to dive in.",
  alternates: { canonical: `${SITE_URL}/jobs/locations` },
};

export default async function LocationsPage() {
  const directory = await fetchLocationsDirectory();
  const totalJobs = directory.reduce((sum, c) => sum + c.totalJobs, 0);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-10 flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Browse by location
        </h1>
        <p className="max-w-2xl text-sm text-foreground/70">
          {totalJobs.toLocaleString()} active roles across {directory.length}{" "}
          {directory.length === 1 ? "country" : "countries"}. Click a country
          for the full city list, or jump straight to one of the top cities
          shown inline.
        </p>
      </header>

      {directory.length === 0 ? (
        <div className="rounded-xl border border-dashed border-foreground/15 px-8 py-16 text-center text-sm text-foreground/60">
          No active locations on file yet. Run the aggregator (`npm run worker
          -- --once`) to populate.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {directory.map((country) => (
            <li
              key={country.countryCode}
              className="flex flex-col gap-3 rounded-xl border border-foreground/10 bg-muted/40 p-5 transition-colors hover:border-foreground/30"
            >
              <Link
                href={`/jobs/${countryToSlug(country.countryCode)}`}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="text-lg font-semibold tracking-tight">
                  {countryName(country.countryCode)}
                </span>
                <span className="shrink-0 text-xs text-foreground/55">
                  {country.totalJobs}{" "}
                  {country.totalJobs === 1 ? "role" : "roles"}
                </span>
              </Link>

              {country.cities.length > 0 ? (
                <ul className="flex flex-col gap-1 text-sm">
                  {country.cities.map((city) => (
                    <li key={city.slug}>
                      <Link
                        href={`/jobs/${countryToSlug(country.countryCode)}/${city.slug}`}
                        className="flex items-baseline justify-between gap-2 rounded-md px-2 py-1 transition-colors hover:bg-muted"
                      >
                        <span className="truncate">{city.name}</span>
                        <span className="shrink-0 text-xs text-foreground/55">
                          {city.jobCount}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-foreground/55">
                  No cities have crossed the 5-job threshold for a dedicated
                  page yet.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
