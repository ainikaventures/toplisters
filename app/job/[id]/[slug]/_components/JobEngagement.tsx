/**
 * Public view / apply counts on a job listing.
 *
 * `views` is Job.viewCount, the counter cache maintained by /api/track
 * (bot-filtered, browser-only). `clicks` is Job.clickCount, incremented on
 * the apply redirect.
 *
 * Wording note: "views", never "viewers". The cookieless visitor hash
 * rotates every UTC day (lib/pageviews.ts), so there is no honest
 * per-listing unique-people figure over a multi-day window. Counting views
 * is the claim the data actually supports.
 *
 * Zero views renders nothing at all — a "0 views" badge on a listing is
 * noise, and on a low-traffic board it reads as "nobody wants this job"
 * to the candidate and "this board is dead" to the employer. Set
 * MIN_VIEWS_TO_DISPLAY to 0 to show the count unconditionally.
 */
const MIN_VIEWS_TO_DISPLAY = 1;

export function JobEngagement({
  views,
  clicks,
}: {
  views: number;
  clicks: number;
}) {
  if (views < MIN_VIEWS_TO_DISPLAY) return null;

  const viewLabel = `${views.toLocaleString()} ${views === 1 ? "view" : "views"}`;

  return (
    <span className="text-foreground/55">
      {viewLabel}
      {clicks > 0 ? (
        <>
          {" · "}
          {/* "clicked apply", not "applied": we see the outbound click,
              never whether the employer received an application. */}
          {clicks.toLocaleString()} clicked apply
        </>
      ) : null}
    </span>
  );
}
