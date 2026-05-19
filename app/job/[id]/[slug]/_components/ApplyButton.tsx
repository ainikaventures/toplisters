"use client";

import { track } from "@/lib/analytics/track";

/**
 * Apply form. POSTs to /api/jobs/[id]/click which records the click and
 * 303-redirects to the source's apply URL (per spec line 153). Submits in a
 * new tab so the user keeps our page open behind the application flow.
 *
 * Also fires the `click_apply` analytics event (GA4 + PostHog) on submit —
 * doesn't `preventDefault`, so the form continues its normal flow.
 */
export interface ApplyButtonProps {
  jobId: string;
  company: string;
  city: string | null;
  countryCode: string;
  isRemote: boolean;
}

export function ApplyButton(props: ApplyButtonProps) {
  const handleSubmit = () => {
    track("click_apply", {
      job_id: props.jobId,
      company: props.company,
      city: props.city ?? undefined,
      country: props.countryCode,
      is_remote: props.isRemote,
    });
  };

  return (
    <form
      action={`/api/jobs/${props.jobId}/click`}
      method="POST"
      target="_blank"
      onSubmit={handleSubmit}
    >
      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-md bg-foreground px-5 py-3 text-sm font-semibold text-background transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
      >
        Apply now →
      </button>
    </form>
  );
}
