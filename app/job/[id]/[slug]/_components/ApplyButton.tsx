/**
 * Apply form. POSTs to /api/jobs/[id]/click which records the click and
 * 303-redirects to the source's apply URL (per spec line 153). Submits in a
 * new tab so the user keeps our page open behind the application flow.
 */
export function ApplyButton({ jobId }: { jobId: string }) {
  return (
    <form action={`/api/jobs/${jobId}/click`} method="POST" target="_blank">
      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-md bg-foreground px-5 py-3 text-sm font-semibold text-background transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
      >
        Apply now →
      </button>
    </form>
  );
}
