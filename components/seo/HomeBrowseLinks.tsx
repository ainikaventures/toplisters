import Link from "next/link";
import type { CountryLink } from "@/lib/seo/internal-links";

/**
 * Server-rendered internal-link block shown below the (client-only) globe
 * on the homepage — TL-090. The globe's navigation lives entirely in
 * client JS, so without this the most authoritative page on the site
 * emits zero crawlable <a href> links and passes link-authority to
 * nothing. Real anchors here let Googlebot reach /jobs, the location
 * directory, and the highest-volume country listings.
 */
export function HomeBrowseLinks({ countries }: { countries: CountryLink[] }) {
  return (
    <section className="border-t border-foreground/10 bg-background px-6 py-12 text-foreground">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Browse jobs
        </h2>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href="/jobs" className="font-medium hover:underline">
            Browse all jobs
          </Link>
          <Link href="/jobs/locations" className="font-medium hover:underline">
            Browse by location
          </Link>
          <Link href="/sitemap" className="font-medium hover:underline">
            Full sitemap
          </Link>
        </div>

        {countries.length > 0 ? (
          <>
            <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-foreground/60">
              Top countries
            </h3>
            <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3 lg:grid-cols-4">
              {countries.map((c) => (
                <li key={c.countryCode}>
                  <Link
                    href={`/jobs/${c.slug}`}
                    className="flex items-baseline justify-between gap-2 text-foreground/80 hover:text-foreground hover:underline"
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="shrink-0 text-xs text-foreground/45">
                      {c.totalJobs.toLocaleString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </section>
  );
}
