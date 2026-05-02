"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  captchaQuestion: string;
  captchaToken: string;
}

const JOB_TYPES = ["full_time", "part_time", "contract", "temp", "internship"] as const;
const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
const HUMAN: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  temp: "Temp",
  internship: "Internship",
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

export function PostJobForm({ captchaQuestion, captchaToken }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);

    startTransition(async () => {
      const response = await fetch("/api/jobs/submit", {
        method: "POST",
        body: data,
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Something went wrong. Try again.");
        return;
      }
      router.push("/post-a-job/sent");
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {/* Honeypot — real users don't see this. Bots that fill every input get rejected. */}
      <div aria-hidden className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label>
          Don&apos;t fill this in
          <input type="text" name="website_url" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Field label="Job title" required>
        <input
          type="text"
          name="title"
          required
          maxLength={120}
          placeholder="Senior Backend Engineer"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Company" required>
          <input type="text" name="companyName" required maxLength={100} />
        </Field>
        <Field label="Company website (optional)">
          <input
            type="url"
            name="companyDomain"
            placeholder="https://example.com"
            maxLength={200}
          />
        </Field>
      </div>

      <Field label="Location" required hint="City, country — e.g. Coventry, UK or Remote, EU">
        <input type="text" name="locationText" required maxLength={120} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Job type" required>
          <select name="jobType" required defaultValue="full_time">
            {JOB_TYPES.map((t) => (
              <option key={t} value={t}>{HUMAN[t]}</option>
            ))}
          </select>
        </Field>
        <Field label="Work mode" required>
          <select name="workMode" required defaultValue="remote">
            {WORK_MODES.map((m) => (
              <option key={m} value={m}>{HUMAN[m]}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Salary min (yr)">
          <input type="number" name="salaryMin" min={0} step={1000} />
        </Field>
        <Field label="Salary max (yr)">
          <input type="number" name="salaryMax" min={0} step={1000} />
        </Field>
        <Field label="Currency">
          <input
            type="text"
            name="salaryCurrency"
            maxLength={3}
            placeholder="USD"
            defaultValue="USD"
          />
        </Field>
      </div>

      <Field label="Apply URL" required hint="Where applicants click through to apply">
        <input type="url" name="applyUrl" required maxLength={300} />
      </Field>

      <Field label="Description" required hint="Plain text. Newlines preserved.">
        <textarea
          name="descriptionText"
          required
          rows={10}
          minLength={50}
          maxLength={20000}
        />
      </Field>

      <Field label="Your email" required hint="We'll send a confirmation link to this address before publishing.">
        <input type="email" name="email" required maxLength={200} />
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
        {isPending ? "Submitting…" : "Submit for review"}
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
      <div
        className="[&>input]:w-full [&>input]:rounded-md [&>input]:border [&>input]:border-foreground/15 [&>input]:bg-background [&>input]:px-3 [&>input]:py-2 [&>input]:text-sm [&>input]:outline-none [&>input:focus]:border-foreground/40 [&>select]:w-full [&>select]:rounded-md [&>select]:border [&>select]:border-foreground/15 [&>select]:bg-background [&>select]:px-3 [&>select]:py-2 [&>select]:text-sm [&>textarea]:w-full [&>textarea]:rounded-md [&>textarea]:border [&>textarea]:border-foreground/15 [&>textarea]:bg-background [&>textarea]:px-3 [&>textarea]:py-2 [&>textarea]:text-sm [&>textarea:focus]:border-foreground/40"
      >
        {children}
      </div>
      {hint ? <span className="text-xs text-foreground/55">{hint}</span> : null}
    </label>
  );
}
