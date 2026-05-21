import type { Metadata } from "next";
import Link from "next/link";
import { countryName } from "@/lib/format";
import { countryToSlug } from "@/lib/locations";
import { SiteFooter } from "@/components/site/SiteFooter";
import { fetchLocationsDirectory } from "@/app/jobs/locations/_data/locations";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sitemap",
  description:
    "A human- and crawler-readable index of every country and major city Toplisters currently has open roles in.",
  alternates: { canonical: `${SITE_URL}/sitemap` },
};

/**
 * HTML sitemap — TL-092. Belt-and-braces internal linking: a single page,
 * linked from the sitewide footer, that links to every country listing and
 * its top cities. Redundant with the XML sitemap (/sitemap.xml) and the
 * footer/homepage blocks, but it gives crawlers one flat hub from which
 * every location landing page is one hop away.
 */
export default async function SitemapPage() {
  const directory = await fetchLocationsDirectory();

  return (
    <>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-10 flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Sitemap
          </h1>
          <p className="max-w-2xl text-sm text-foreground/70">
            Every country and major city we currently have open roles in.
            Looking for the machine-readable version? It lives at{" "}
            <a
              href="/sitemap.xml"
              className="underline underline-offset-2 hover:text-foreground"
            >
              /sitemap.xml
            </a>
            .
          </p>
        </header>

        <nav aria-label="Main pages" className="mb-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Main pages
          </h2>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <li>
              <Link href="/jobs" className="font-medium hover:underline">
                Browse all jobs
              </Link>
            </li>
            <li>
              <Link href="/jobs/locations" className="font-medium hover:underline">
                Browse by location
              </Link>
            </li>
            <li>
              <Link href="/alerts" className="font-medium hover:underline">
                Email alerts
              </Link>
            </li>
            <li>
              <Link href="/about" className="font-medium hover:underline">
                About
              </Link>
            </li>
            <li>
              <Link href="/sources" className="font-medium hover:underline">
                Data sources
              </Link>
            </li>
          </ul>
        </nav>

        {directory.length === 0 ? (
          <p className="text-sm text-foreground/60">
            No active locations on file yet.
          </p>
        ) : (
          <section aria-label="Locations">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-foreground/60">
              {directory.length}{" "}
              {directory.length === 1 ? "country" : "countries"}
            </h2>
            <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
              {directory.map((country) => {
                const slug = countryToSlug(country.countryCode);
                return (
                  <li key={country.countryCode} className="flex flex-col gap-1.5">
                    <Link
                      href={`/jobs/${slug}`}
                      className="font-semibold tracking-tight hover:underline"
                    >
                      {countryName(country.countryCode)}{" "}
                      <span className="text-xs font-normal text-foreground/45">
                        ({country.totalJobs})
                      </span>
                    </Link>
                    {country.cities.length > 0 ? (
                      <ul className="flex flex-col gap-0.5 text-sm text-foreground/75">
                        {country.cities.map((city) => (
                          <li key={city.slug}>
                            <Link
                              href={`/jobs/${slug}/${city.slug}`}
                              className="hover:text-foreground hover:underline"
                            >
                              {city.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
