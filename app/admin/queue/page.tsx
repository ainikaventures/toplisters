import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { relativeTime, locationLabel, salaryLabel } from "@/lib/format";
import { approveSubmission, rejectSubmission } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Moderation queue", robots: { index: false } };

/**
 * Spec line 162: admin queue at /admin/queue with HTTP basic auth. The
 * auth gate lives in middleware.ts; this page assumes the operator is
 * already authenticated. Lists user-submitted jobs whose email has been
 * confirmed and that are still pending — the only state where action is
 * needed.
 */
export default async function ModerationQueuePage() {
  const pending = await prisma.job.findMany({
    where: {
      isUserSubmitted: true,
      moderationStatus: "pending",
      submission: { emailConfirmedAt: { not: null } },
    },
    include: { submission: true },
    orderBy: { createdAt: "asc" },
  });

  const recent = await prisma.job.findMany({
    where: { isUserSubmitted: true, moderationStatus: { in: ["approved", "rejected"] } },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8 flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Moderation queue
          </h1>
          <p className="text-sm text-foreground/60">
            {pending.length === 0
              ? "Nothing pending."
              : `${pending.length} confirmed ${pending.length === 1 ? "submission" : "submissions"} awaiting review.`}
          </p>
        </header>

        {pending.length > 0 ? (
          <ul className="space-y-4">
            {pending.map((job) => (
              <li
                key={job.id}
                className="flex flex-col gap-4 rounded-xl border border-foreground/10 bg-muted/40 p-5"
              >
                <div>
                  <h2 className="text-lg font-semibold">{job.title}</h2>
                  <p className="text-sm text-foreground/70">
                    {job.companyName} ·{" "}
                    {locationLabel({ city: job.city, countryCode: job.countryCode })}
                    {salaryLabel(job) ? ` · ${salaryLabel(job)}` : ""} ·{" "}
                    Submitted {relativeTime(job.createdAt)} by{" "}
                    <a
                      href={`mailto:${job.submission?.email}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {job.submission?.email}
                    </a>
                  </p>
                </div>

                {job.descriptionText ? (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-foreground/70 hover:text-foreground">
                      Show description
                    </summary>
                    <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-background p-3 text-xs text-foreground/80">
                      {job.descriptionText}
                    </pre>
                  </details>
                ) : null}

                <div className="flex gap-2">
                  <form action={approveSubmission.bind(null, job.id)}>
                    <button
                      type="submit"
                      className="rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background hover:bg-foreground/90"
                    >
                      Approve & publish
                    </button>
                  </form>
                  <form action={rejectSubmission.bind(null, job.id)}>
                    <button
                      type="submit"
                      className="rounded-md border border-foreground/15 px-4 py-2 text-sm font-medium hover:border-foreground/40"
                    >
                      Reject
                    </button>
                  </form>
                  <a
                    href={job.applyUrl}
                    rel="noopener nofollow"
                    target="_blank"
                    className="rounded-md border border-foreground/15 px-4 py-2 text-sm font-medium hover:border-foreground/40"
                  >
                    Open apply URL ↗
                  </a>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed border-foreground/15 px-8 py-16 text-center text-sm text-foreground/60">
            No confirmed submissions are waiting. They&apos;ll appear here
            after the submitter clicks the magic link in their email.
          </div>
        )}

        {recent.length > 0 ? (
          <section className="mt-12">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-foreground/60">
              Recently moderated
            </h2>
            <ul className="space-y-1 text-sm">
              {recent.map((job) => (
                <li
                  key={job.id}
                  className="flex items-baseline justify-between gap-3 rounded-md px-3 py-1 hover:bg-muted/50"
                >
                  <span className="truncate">
                    <span
                      className={
                        job.moderationStatus === "approved"
                          ? "text-foreground/80"
                          : "text-foreground/40 line-through"
                      }
                    >
                      {job.title} — {job.companyName}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs uppercase tracking-wider text-foreground/50">
                    {job.moderationStatus} · {relativeTime(job.updatedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
