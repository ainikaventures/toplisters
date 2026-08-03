import Link from "next/link";
import {
  getTopCategories,
  getTopCities,
  getTopCountries,
} from "@/lib/seo/internal-links";

/**
 * Server-rendered "browse by location / role" block.
 *
 * The homepage's other navigation is the WebGL globe, which Googlebot's
 * first indexing wave can't follow — so the most authoritative page on
 * the site passed authority to almost nothing. This block puts the money
 * pages (country hubs, city hubs, role filters) into the raw HTML as
 * plain `<a href>`s, no JS required.
 *
 * Async server component: every list reads through the 1-hour cache in
 * lib/seo/internal-links and degrades to [] on a DB error, so a blip
 * drops the block rather than 500-ing the homepage.
 */
export async function BrowseLinks() {
  const [countries, cities, categories] = await Promise.all([
    getTopCountries(20),
    getTopCities(24),
    getTopCategories(16),
  ]);

  if (!countries.length && !cities.length && !categories.length) return null;

  return (
    <section
      aria-labelledby="browse-links-heading"
      className="mt-16 border-t border-foreground/10 pt-10"
    >
      <h2
        id="browse-links-heading"
        className="text-sm font-medium uppercase tracking-wider text-foreground/60"
      >
        Browse jobs by location and role
      </h2>

      <div className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        <LinkGroup
          title="By country"
          moreHref="/jobs/locations"
          moreLabel="All locations"
        >
          {countries.map((c) => (
            <LinkItem
              key={c.countryCode}
              href={`/jobs/${c.slug}`}
              label={c.name}
              count={c.totalJobs}
            />
          ))}
        </LinkGroup>

        <LinkGroup
          title="By city"
          moreHref="/jobs/locations"
          moreLabel="All cities"
        >
          {cities.map((c) => (
            <LinkItem
              key={c.href}
              href={c.href}
              label={`${c.name}, ${c.countryName}`}
              count={c.totalJobs}
            />
          ))}
        </LinkGroup>

        <LinkGroup title="By role" moreHref="/jobs" moreLabel="All roles">
          {categories.map((c) => (
            <LinkItem
              key={c.value}
              href={c.href}
              label={c.value}
              count={c.totalJobs}
            />
          ))}
        </LinkGroup>
      </div>
    </section>
  );
}

function LinkGroup({
  title,
  moreHref,
  moreLabel,
  children,
}: {
  title: string;
  moreHref: string;
  moreLabel: string;
  children: React.ReactNode;
}) {
  return (
    <nav aria-label={title}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/45">
        {title}
      </h3>
      <ul className="mt-3 space-y-1.5 text-sm">{children}</ul>
      <Link
        href={moreHref}
        className="mt-3 inline-block text-sm font-medium hover:underline"
      >
        {moreLabel} →
      </Link>
    </nav>
  );
}

function LinkItem({
  href,
  label,
  count,
}: {
  href: string;
  label: string;
  count: number;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <Link
        href={href}
        className="min-w-0 truncate text-foreground/75 hover:text-foreground hover:underline"
      >
        {label}
      </Link>
      <span className="shrink-0 font-mono text-xs text-foreground/40">
        {count.toLocaleString()}
      </span>
    </li>
  );
}
