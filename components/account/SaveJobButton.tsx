"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

interface Props {
  jobId: string;
  initialSaved: boolean;
  className?: string;
}

/**
 * Save / unsave a job. Optimistic toggle backed by POST /api/saved. When
 * the user isn't signed in the API returns 401 and we send them to the
 * sign-in page with a `next` back to the page they were on, so the save
 * intent survives the round trip (they can click again once back).
 */
export function SaveJobButton({ jobId, initialSaved, className }: Props) {
  const [saved, setSaved] = useState(initialSaved);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();

  function toggle() {
    const optimistic = !saved;
    setSaved(optimistic);

    startTransition(async () => {
      const response = await fetch("/api/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });

      if (response.status === 401) {
        setSaved(false);
        router.push(`/account/sign-in?next=${encodeURIComponent(pathname)}`);
        return;
      }
      if (!response.ok) {
        setSaved(!optimistic); // revert
        return;
      }
      const data = (await response.json().catch(() => ({}))) as { saved?: boolean };
      if (typeof data.saved === "boolean") setSaved(data.saved);
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      aria-pressed={saved}
      className={
        "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 " +
        (saved
          ? "border-foreground/40 bg-foreground/5"
          : "border-foreground/15 hover:border-foreground/40") +
        (className ? ` ${className}` : "")
      }
    >
      <span aria-hidden>{saved ? "★" : "☆"}</span>
      {saved ? "Saved" : "Save job"}
    </button>
  );
}
