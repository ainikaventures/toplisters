"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  captchaQuestion: string;
  captchaToken: string;
  /** Same-site path to return to after sign-in. */
  next?: string;
}

/**
 * Request-a-sign-in-link form. Same shape as the alerts SubscribeForm —
 * honeypot + math captcha, server roundtrip via fetch, redirect to the
 * check-email page on success. No password field by design.
 */
export function SignInForm({ captchaQuestion, captchaToken, next }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;

    startTransition(async () => {
      const response = await fetch("/api/auth/request", {
        method: "POST",
        body: new FormData(form),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      router.push("/account/check-email");
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {/* Honeypot. */}
      <div aria-hidden className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label>
          Don&apos;t fill this in
          <input type="text" name="website_url" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {next ? <input type="hidden" name="next" value={next} /> : null}

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Email address</span>
        <input
          type="email"
          name="email"
          required
          maxLength={200}
          autoComplete="email"
          placeholder="you@example.com"
          className="rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">
          Quick check: what is {captchaQuestion}?
        </span>
        <input
          type="text"
          name="captchaAnswer"
          required
          inputMode="numeric"
          autoComplete="off"
          className="w-24 rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
        />
        <input type="hidden" name="captchaToken" value={captchaToken} />
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Sending…" : "Email me a sign-in link"}
      </button>

      <p className="text-xs text-foreground/55">
        No password needed. We&apos;ll email you a link that signs you in —
        and creates your account if you don&apos;t have one yet.
      </p>
    </form>
  );
}
