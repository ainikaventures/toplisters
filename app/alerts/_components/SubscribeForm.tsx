"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  countryOptions: { code: string; name: string }[];
  captchaQuestion: string;
  captchaToken: string;
}

const WORK_MODES: { value: string; label: string }[] = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
];

/**
 * Subscribe form. Shape mirrors the post-a-job form for consistency:
 * honeypot + math captcha, server roundtrip via fetch + JSON, redirect
 * to /alerts/sent on success. Country + work-mode pickers are checkbox
 * groups — multi-select is what the digest pipeline expects later.
 */
export function SubscribeForm({
  countryOptions,
  captchaQuestion,
  captchaToken,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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
      router.push("/alerts/sent");
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {/* Honeypot. */}
      <div aria-hidden className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label>
          Don&apos;t fill this in
          <input type="text" name="website_url" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Field label="Email address" required>
        <input
          type="email"
          name="email"
          required
          maxLength={200}
          placeholder="you@example.com"
          autoComplete="email"
          className="w-full rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
        />
      </Field>

      <fieldset>
        <legend className="text-xs font-medium uppercase tracking-wider text-foreground/60">
          Countries (optional)
        </legend>
        <p className="mt-1 text-xs text-foreground/55">
          Pick none for everywhere. Pick a few to narrow the digest.
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {countryOptions.map((opt) => (
            <li key={opt.code}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="countries"
                  value={opt.code}
                  className="size-4 rounded border-foreground/30"
                />
                <span className="truncate">{opt.name}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset>
        <legend className="text-xs font-medium uppercase tracking-wider text-foreground/60">
          Work mode (optional)
        </legend>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          {WORK_MODES.map((m) => (
            <li key={m.value}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="workModes"
                  value={m.value}
                  className="size-4 rounded border-foreground/30"
                />
                <span>{m.label}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <Field label={`Quick check: ${captchaQuestion} = ?`} required>
        <input
          type="text"
          name="captchaAnswer"
          required
          inputMode="numeric"
          maxLength={3}
          className="w-32 rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
        />
        <input type="hidden" name="captchaToken" value={captchaToken} />
      </Field>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-md bg-foreground px-5 py-3 text-sm font-semibold text-background hover:bg-foreground/90 disabled:opacity-60"
      >
        {isPending ? "Sending confirmation…" : "Subscribe"}
      </button>
      <p className="text-xs text-foreground/55">
        We&apos;ll email you a one-time confirmation link. Unsubscribe link
        in every digest. Decline cookies — this still works.
      </p>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-foreground/60">
        {label}
        {required ? <span className="ml-1 text-destructive/80">*</span> : null}
      </span>
      <div className="flex items-center gap-2">{children}</div>
    </label>
  );
}
