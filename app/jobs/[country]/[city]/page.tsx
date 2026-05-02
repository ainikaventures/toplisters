import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { JobCard } from "@/app/jobs/_components/JobCard";
import { cityToSlug, countryToSlug, resolveCountrySlug } from "@/lib/locations";
import { countryName } from "@/lib/format";
import { fetchLocationPageData, resolveCity } from "./_data/location";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

interface PageParams {
  country: string;
  city: string;
}

async function load(params: PageParams) {
  const iso = resolveCountrySlug(params.country);
  if (!iso) return { redirect404: true } as const;

  const canonicalCity = await resolveCity(iso, params.city);
  if (!canonicalCity) return { redirect404: true } as const;

  const canonicalCountrySlug = countryToSlug(iso);
  const canonicalCitySlug = cityToSlug(canonicalCity);
  const isCanonical =
    params.country === canonicalCountrySlug && params.city === canonicalCitySlug;

  if (!isCanonical) {
    return {
      redirectTo: `/jobs/${canonicalCountrySlug}/${canonicalCitySlug}` as const,
    };
  }

  const data = await fetchLocationPageData(iso, canonicalCity);
  if (!data) return { redirect404: true } as const;

  return { data, canonicalCountrySlug, canonicalCitySlug } as const;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const result = await load(await params);
  if ("redirect404" in result || "redirectTo" in result) {
    return { title: "Jobs in this location" };
  }
  const { data, canonicalCountrySlug, canonicalCitySlug } = result;
  const country = countryName(data.countryCode);
  return {
    title: `${data.stats.totalJobs} jobs in ${data.city}, ${country}`,
    description: `Browse ${data.stats.totalJobs} active roles in ${data.city}, ${country}. Updated daily from public job boards.`,
    alternates: {
      canonical: `${SITE_URL}/jobs/${canonicalCountrySlug}/${canonicalCitySlug}`,
    },
  };
}

export default async function LocationPage({
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
    <div className="mx-auto max-w-7xl px-6 py-10">
      <nav className="mb-6 flex items-center gap-2 text-xs text-foreground/60">
        <Link href="/jobs" className="hover:text-foreground">All jobs</Link>
        <span>/</span>
        <span>{country}</span>
        <span>/</span>
        <span className="text-foreground">{data.city}</span>
      </nav>

      <header className="mb-8 flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Jobs in {data.city}, {country}
        </h1>
        <p className="max-w-2xl text-sm text-foreground/70">
          {data.stats.totalJobs.toLocaleString()} active{" "}
          {data.stats.totalJobs === 1 ? "role" : "roles"} in {data.city} across{" "}
          {data.stats.topCompanies.length} hiring{" "}
          {data.stats.topCompanies.length === 1 ? "company" : "companies"}, refreshed
          daily from public job boards.
        </p>
      </header>

      <section className="mb-10 grid gap-4 sm:grid-cols-3">
        <StatCard label="Top categories">
          {data.stats.topCategories.length > 0 ? (
            <ul className="space-y-1">
              {data.stats.topCategories.map((c) => (
                <li key={c.name} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{c.name}</span>
                  <span className="text-foreground/50">{c.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-foreground/50">—</p>
          )}
        </StatCard>
        <StatCard label="Top hiring companies">
          {data.stats.topCompanies.length > 0 ? (
            <ul className="space-y-1">
              {data.stats.topCompanies.map((c) => (
                <li key={c.name} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{c.name}</span>
                  <span className="text-foreground/50">{c.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-foreground/50">—</p>
          )}
        </StatCard>
        <StatCard label="Salary range">
          {data.stats.salaryMin || data.stats.salaryMax ? (
            <p className="text-sm">
              {formatSalary(data.stats.salaryMin)} – {formatSalary(data.stats.salaryMax)}
              <span className="ml-1 text-foreground/50">/yr</span>
            </p>
          ) : (
            <p className="text-sm text-foreground/50">Not disclosed</p>
          )}
        </StatCard>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-foreground/60">
          Open roles
        </h2>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
          {data.jobs.map((job) => (
            <li key={job.id}>
              <JobCard job={job} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-foreground/10 bg-muted/40 p-4">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-foreground/60">
        {label}
      </h3>
      {children}
    </div>
  );
}

function formatSalary(value: number | null): string {
  if (!value) return "—";
  if (value >= 1000) return `$${Math.round(value / 1000)}k`;
  return `$${value}`;
}
