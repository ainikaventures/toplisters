"use client";

import Link from "next/link";
import { useConsent } from "./ConsentProvider";

/**
 * Bottom-pinned cookie banner. Renders only when the user has not yet
 * decided (consent="pending") AND the client has hydrated — that gate
 * means SSR sees nothing, so there's no flicker between server "show"
 * and client "hide-because-already-decided" states.
 *
 * Accept turns analytics on for this and future visits. Decline keeps
 * them off. Either choice persists in localStorage; users can change it
 * later via the "Cookies" link in the site footer.
 */
export function CookieBanner() {
  const { consent, hydrated, grant, deny } = useConsent();
  if (!hydrated || consent !== "pending") return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie preferences"
      className="fixed inset-x-3 bottom-3 z-50 flex flex-col gap-3 rounded-xl border border-foreground/15 bg-background p-4 shadow-2xl sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-sm"
    >
      <div className="text-sm">
        <p className="font-medium">Cookies for analytics</p>
        <p className="mt-1 text-foreground/70">
          We use Google Analytics and PostHog to see how the site is used.
          No personal data sold. Decide once — change anytime in the
          footer.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={grant}
          className="flex-1 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-foreground/90"
        >
          Accept
        </button>
        <button
          type="button"
          onClick={deny}
          className="flex-1 rounded-md border border-foreground/15 px-3 py-2 text-sm font-medium hover:border-foreground/40"
        >
          Decline
        </button>
      </div>
      <Link
        href="/privacy"
        className="text-center text-xs text-foreground/55 underline-offset-2 hover:underline"
      >
        Read the privacy notice
      </Link>
    </div>
  );
}
