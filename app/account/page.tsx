import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { JobCard } from "@/app/jobs/_components/JobCard";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false },
};

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/account/sign-in?next=/account");

  const saved = await prisma.savedJob.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { job: true },
  });

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Your account</h1>
            <p className="mt-1 text-sm text-foreground/60">
              Signed in as <span className="text-foreground">{user.email}</span>
            </p>
          </div>
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-full border border-foreground/15 px-4 py-2 text-sm font-medium hover:border-foreground/40"
            >
              Sign out
            </button>
          </form>
        </header>

        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Saved jobs{saved.length > 0 ? ` (${saved.length})` : ""}
          </h2>

          {saved.length === 0 ? (
            <div className="rounded-xl border border-dashed border-foreground/15 px-8 py-16 text-center">
              <p className="text-sm text-foreground/60">
                You haven&apos;t saved any jobs yet. Hit{" "}
                <span className="font-medium text-foreground">Save job</span> on
                any listing to keep it here.
              </p>
              <Link
                href="/jobs"
                className="mt-6 inline-block rounded-full border border-foreground/15 px-4 py-2 text-sm font-medium hover:border-foreground/40"
              >
                Browse jobs →
              </Link>
            </div>
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
              {saved.map((row) => (
                <li key={row.id}>
                  <JobCard job={row.job} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
