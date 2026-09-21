"use client";

import { useState, useTransition } from "react";

interface Props {
  captchaQuestion: string;
  captchaToken: string;
  /** Pre-selects the digest's country filter (ISO-2), when we know one. */
  defaultCountry?: string;
}

/**
 * Compact one-line subscribe form for the homepage / job pages.
 *
 * Deliberately thinner than the full form on /alerts: email + the same
 * honeypot-and-math-captcha pair the API requires, nothing else. Country
 * and work-mode preferences stay on /alerts (linked below the form) so
 * the inline version is a single decision.
 *
 * Posts to the same /api/alerts/subscribe endpoint and confirms inline
 * rather than redirecting — bouncing someone off a job page they were
 * reading to a /alerts/sent screen would cost the page view.
 */
export function InlineSubscribeForm({
  captchaQuestion,
  captchaToken,
  defaultCountry,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;

    startTransition(async () => {
      const response = await fetch("/api/alerts/subscribe", {
        method: "POST",
        body: new FormData(form),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <p className="text-sm text-foreground/75">
        Check your inbox — we sent a one-time confirmation link. You&apos;re
        subscribed once you tap it.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {/* Honeypot — same field name the API checks. */}
      <div
        aria-hidden
        className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden"
      >
        <label>
          Don&apos;t fill this in
          <input
            type="text"
            name="website_url"
            tabIndex={-1}
            autoComplete="off"
          />
        </label>
      </div>

      {defaultCountry ? (
        <input type="hidden" name="countries" value={defaultCountry} />
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-foreground/60">
            Email address
          </span>
          <input
            type="email"
            name="email"
            required
            maxLength={200}
            placeholder="you@example.com"
            autoComplete="email"
            className="w-full rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-foreground/60">
            {captchaQuestion} = ?
          </span>
          <input
            type="text"
            name="captchaAnswer"
            required
            inputMode="numeric"
            maxLength={3}
            className="w-24 rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
          />
        </label>
        <input type="hidden" name="captchaToken" value={captchaToken} />

        <button
          type="submit"
          disabled={isPending}
          className="shrink-0 rounded-md bg-foreground px-5 py-2 text-sm font-semibold text-background hover:bg-foreground/90 disabled:opacity-60"
        >
          {isPending ? "Sending…" : "Get alerts"}
        </button>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
