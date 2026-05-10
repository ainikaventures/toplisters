import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site/SiteFooter";
import { relativeTime } from "@/lib/format";
import { fetchSourceRows, type Health } from "./_data/sources";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Data sources",
  description:
    "The public APIs and job boards Toplisters aggregates from, with current health status and active job counts.",
  alternates: { canonical: `${SITE_URL}/sources` },
};

const HEALTH_LABEL: Record<Health, string> = {
  fresh: "Fresh",
  stale: "Stale",
  silent: "No data yet",
};

const HEALTH_DOT_CLASS: Record<Health, string> = {
  fresh: "bg-emerald-500",
  stale: "bg-amber-500",
  silent: "bg-foreground/30",
};

export default async function SourcesPage() {
  const rows = await fetchSourceRows();
  const fresh = rows.filter((r) => r.health === "fresh").length;
  const totalJobs = rows.reduce((sum, r) => sum + r.jobCount, 0);

  return (
    <>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Data sources
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-foreground/70">
            Toplisters aggregates jobs from {rows.length} public sources —
            free APIs, sitemap-discoverable JSON-LD postings, and direct-
            from-employer ATS feeds. We don't scrape behind logins or
            republish anything we don't have permission to. Click through
            to any source's homepage for the original posting.
          </p>
          <p className="mt-3 text-xs text-foreground/60">
            {fresh} of {rows.length} sources are currently fresh ·{" "}
            {totalJobs.toLocaleString()} active roles in total.
          </p>
        </header>

        <div className="overflow-x-auto rounded-xl border border-foreground/10">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-foreground/60">
              <tr>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Attribution</th>
                <th className="px-4 py-3 text-right font-medium">Active jobs</th>
                <th className="px-4 py-3 font-medium">Last update</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name} className="border-t border-foreground/5">
                  <td className="px-4 py-3 align-top">
                    {row.providerUrl ? (
                      <a
                        href={row.providerUrl}
                        target="_blank"
                        rel="noopener nofollow"
                        className="font-medium hover:underline"
                      >
                        {row.displayName}
                      </a>
                    ) : (
                      <span className="font-medium">{row.displayName}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-foreground/70">
                    {row.attribution ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums">
                    {row.jobCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 align-top text-foreground/70">
                    {row.lastSeenAt ? relativeTime(row.lastSeenAt) : "—"}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden
                        className={`size-2 rounded-full ${HEALTH_DOT_CLASS[row.health]}`}
                      />
                      <span className="text-foreground/70">
                        {HEALTH_LABEL[row.health]}
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="mt-8 space-y-3 text-xs text-foreground/60">
          <p>
            <strong className="text-foreground/80">Fresh</strong> means the
            source produced an active row within roughly twice its scheduled
            cadence (60–90 minutes for most APIs).{" "}
            <strong className="text-foreground/80">Stale</strong> means the
            existing rows are still showing but the worker hasn't refreshed
            recently — usually transient, sometimes a sign of an API outage.{" "}
            <strong className="text-foreground/80">No data yet</strong> means
            we either haven't run the source for the first time or it
            returned zero rows on its last run.
          </p>
          <p>
            Spotted a posting that should be removed, or you operate one of
            these sources and want to discuss attribution / coverage?{" "}
            <Link href="/about" className="underline-offset-2 hover:underline">
              Contact details on the about page
            </Link>
            .
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
