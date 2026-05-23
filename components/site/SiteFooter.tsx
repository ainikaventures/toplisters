import Link from "next/link";
import { ManageCookies } from "@/components/consent/ManageCookies";
import { getTopCountries } from "@/lib/seo/internal-links";

/**
 * Shared footer for /jobs/*, /job/* and the standalone content routes.
 *
 * Beyond the attribution line (brand-name anchors to the owned-network
 * sites — rel=noopener but NOT nofollow, per the spec's network-link
 * rules), the footer carries the sitewide crawlable navigation added in
 * TL-090: links to /jobs, the location directory, the HTML sitemap, and
 * the highest-volume country listings. Because it renders on every page,
 * it guarantees those listings are reachable from anywhere on the site —
 * the country pages no longer depend on the sitemap alone to be found.
 *
 * Async server component: the country links read through the 1-hour
 * cache in lib/seo/internal-links, so this adds no per-request DB load.
 */
export async function SiteFooter() {
  const countries = await getTopCountries(15);

  return (
    <footer className="mt-16 border-t border-foreground/10 px-6 py-10 text-xs text-foreground/60">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <nav
          aria-label="Footer"
          className="flex flex-wrap gap-x-6 gap-y-2 text-sm"
        >
          <Link href="/jobs" className="font-medium text-foreground hover:underline">
            Browse jobs
          </Link>
          <Link
            href="/jobs/locations"
            className="font-medium text-foreground hover:underline"
          >
            Browse by location
          </Link>
          <Link href="/sitemap" className="font-medium text-foreground hover:underline">
            Sitemap
          </Link>
          <Link href="/alerts" className="hover:text-foreground">
            Email alerts
          </Link>
          <Link href="/about" className="hover:text-foreground">
            About
          </Link>
          <Link href="/sources" className="hover:text-foreground">
            Sources
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          {/* Voluntary, cost-recovery only (no paywall / no gated data) —
              keeps the site non-commercial for the job-API free tiers.
              See info/COMPLIANCE.md. */}
          <a
            href="https://github.com/sponsors/ainikaventures"
            target="_blank"
            rel="noopener"
            className="hover:text-foreground"
          >
            Support hosting
          </a>
        </nav>

        {countries.length > 0 ? (
          <nav aria-label="Jobs by country">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-foreground/45">
              Jobs by country
            </h2>
            <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
              {countries.map((c) => (
                <li key={c.countryCode}>
                  <Link
                    href={`/jobs/${c.slug}`}
                    className="text-foreground/75 hover:text-foreground hover:underline"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-foreground/10 pt-6">
          <span>
            Built by{" "}
            <a
              href="https://ainika.xyz"
              target="_blank"
              rel="noopener"
              className="font-medium text-foreground hover:underline"
            >
              Ainika
            </a>
            {" · "}Developed by{" "}
            <a
              href="https://lyrava.com"
              target="_blank"
              rel="noopener"
              className="font-medium text-foreground hover:underline"
            >
              Lyrava
            </a>
          </span>
          <span aria-hidden="true">·</span>
          <ManageCookies />
        </div>
      </div>
    </footer>
  );
}
