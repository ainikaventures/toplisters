import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { InitialsAvatar } from "@/app/jobs/_components/InitialsAvatar";
import { pageOpenGraph } from "@/lib/seo/og";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 48;

export const metadata: Metadata = {
  title: "Companies hiring",
  description:
    "Browse companies hiring across the world on Toplisters — their locations, logos, and live openings, with direct apply links where we have them.",
  alternates: { canonical: "/companies" },
  openGraph: pageOpenGraph({
    title: "Companies hiring — Toplisters",
    description: "Browse employers, their locations, and live openings.",
    url: "/companies",
  }),
};

function flagEmoji(cc: string): string {
  if (cc.length !== 2) return "";
  return cc.toUpperCase().replace(/[A-Z]/g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() || null;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const where: Prisma.CompanyWhereInput = q
    ? { name: { contains: q, mode: "insensitive" } }
    : {};

  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy: [{ jobCount: "desc" }, { name: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.company.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Companies hiring</h1>
          <p className="mt-2 text-sm text-foreground/60">
            {total.toLocaleString()} employers with live roles — locations, logos, and openings.
            Direct apply links where we have them.
          </p>
        </header>

        <form method="get" action="/companies" className="mb-6 max-w-md">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search companies…"
            className="w-full rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
          />
        </form>

        {companies.length === 0 ? (
          <p className="rounded-xl border border-dashed border-foreground/15 p-8 text-center text-sm text-foreground/50">
            {q ? `No companies match “${q}”.` : "The directory is being built — check back soon."}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {companies.map((c) => (
              <li key={c.id} className="min-w-0">
                <Link
                  href={`/company/${c.slug}`}
                  className="flex h-full items-center gap-3 rounded-xl border border-foreground/10 bg-background p-4 transition-colors hover:border-foreground/30"
                >
                  <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-foreground/10 bg-muted">
                    {c.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.logoUrl} alt="" loading="lazy" className="max-h-9 max-w-9 object-contain" />
                    ) : (
                      <InitialsAvatar name={c.name} className="size-full" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{c.name}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-foreground/55">
                      <span>{c.jobCount} {c.jobCount === 1 ? "role" : "roles"}</span>
                      {c.countryCodes.length > 0 ? (
                        <span className="truncate" aria-hidden>
                          {c.countryCodes.slice(0, 4).map(flagEmoji).join(" ")}
                        </span>
                      ) : null}
                      {c.hasDirect ? <span className="text-emerald-600 dark:text-emerald-400">· direct</span> : null}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 ? (
          <nav className="mt-8 flex items-center justify-center gap-3 text-sm">
            {page > 1 ? (
              <Link
                href={`/companies?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page - 1) })}`}
                className="rounded-md border border-foreground/15 px-3 py-1.5 hover:border-foreground/40"
              >
                ← Prev
              </Link>
            ) : null}
            <span className="text-foreground/50">Page {page} of {totalPages}</span>
            {page < totalPages ? (
              <Link
                href={`/companies?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page + 1) })}`}
                className="rounded-md border border-foreground/15 px-3 py-1.5 hover:border-foreground/40"
              >
                Next →
              </Link>
            ) : null}
          </nav>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}
