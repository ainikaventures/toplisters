"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  captchaQuestion: string;
  captchaToken: string;
}

export function ContactForm({ captchaQuestion, captchaToken }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);

    startTransition(async () => {
      const response = await fetch("/api/contact", { method: "POST", body: data });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Something went wrong. Try again.");
        return;
      }
      router.push("/contact/sent");
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {/* Honeypot — hidden from real users; bots that fill it get rejected. */}
      <div aria-hidden className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label>
          Don&apos;t fill this in
          <input type="text" name="website_url" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name" required>
          <input type="text" name="name" required maxLength={120} placeholder="Jane Doe" />
        </Field>
        <Field label="Your email" required hint="We'll reply to this address.">
          <input type="email" name="email" required maxLength={200} placeholder="jane@example.com" />
        </Field>
      </div>

      <Field label="Subject">
        <input type="text" name="subject" maxLength={150} placeholder="What's this about?" />
      </Field>

      <Field label="Message" required hint="Up to 5000 characters.">
        <textarea name="message" required rows={9} minLength={10} maxLength={5000} />
      </Field>

      <Field label={`Quick check: ${captchaQuestion} = ?`} required>
        <input type="text" name="captchaAnswer" required inputMode="numeric" maxLength={3} />
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
        {isPending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-foreground/60">
        {label}
        {required ? <span className="ml-1 text-destructive/80">*</span> : null}
      </span>
      <div className="[&>input]:w-full [&>input]:rounded-md [&>input]:border [&>input]:border-foreground/15 [&>input]:bg-background [&>input]:px-3 [&>input]:py-2 [&>input]:text-sm [&>input]:outline-none [&>input:focus]:border-foreground/40 [&>textarea]:w-full [&>textarea]:rounded-md [&>textarea]:border [&>textarea]:border-foreground/15 [&>textarea]:bg-background [&>textarea]:px-3 [&>textarea]:py-2 [&>textarea]:text-sm [&>textarea:focus]:border-foreground/40">
        {children}
      </div>
      {hint ? <span className="text-xs text-foreground/55">{hint}</span> : null}
    </label>
  );
}
