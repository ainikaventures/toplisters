"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * The dashboard is ten aggregates over the whole jobs table; a Postgres
 * hiccup on any one of them used to take the entire route down with an
 * unbranded "server-side exception" page. Failing inside the layout keeps
 * the site navigable and gives a retry that re-runs the render.
 */
export default function AnalyticsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[analytics] render failed", error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-start gap-4 px-6 py-20">
      <h1 className="text-2xl font-semibold tracking-tight">
        Analytics is temporarily unavailable
      </h1>
      <p className="text-sm text-foreground/70">
        The dashboard aggregates the full dataset live, and that query did
        not come back this time. The job listings themselves are unaffected.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={reset}
          className="rounded-md border border-foreground/15 px-3 py-2 text-sm hover:bg-muted"
        >
          Try again
        </button>
        <Link
          href="/jobs"
          className="text-sm underline-offset-2 hover:underline"
        >
          Browse jobs instead
        </Link>
      </div>
      {error.digest ? (
        <p className="text-xs text-foreground/40">Reference: {error.digest}</p>
      ) : null}
    </main>
  );
}
