import type { Job } from "@/lib/generated/prisma/client";

/**
 * How a job's source credit must render on the detail page.
 *
 * Rendered as: `{before}<a href rel>{linkText}</a>{after}`. Most sources
 * use the default ("via {Name}" → apply URL, nofollow). Two providers
 * mandate a specific format in their API terms (see info/COMPLIANCE.md):
 *   - Adzuna  → the exact label "Jobs by Adzuna", with the word "Jobs"
 *               hyperlinked to adzuna.co.uk.
 *   - RemoteOK → a *dofollow* backlink to the RemoteOK listing ("without
 *               nofollow!") plus the "RemoteOK" name, or they suspend API
 *               access.
 */
export interface AttributionParts {
  before: string;
  linkText: string;
  after: string;
  href: string;
  rel: string;
}

// We don't pass link equity to aggregators by default; only where a
// provider's terms explicitly require a follow link do we drop nofollow.
const NOFOLLOW = "noopener nofollow";
const FOLLOW = "noopener";

export function jobAttribution(job: Job, displayName: string): AttributionParts {
  switch (job.source) {
    case "adzuna":
      return {
        before: "",
        linkText: "Jobs",
        after: " by Adzuna",
        href: "https://www.adzuna.co.uk",
        rel: NOFOLLOW,
      };
    case "remoteok":
      return {
        before: "via ",
        linkText: "RemoteOK",
        after: "",
        href: `https://remoteok.com/remote-jobs/${job.sourceId}`,
        rel: FOLLOW,
      };
    default:
      return {
        before: "via ",
        linkText: displayName,
        after: "",
        href: job.applyUrl,
        rel: NOFOLLOW,
      };
  }
}
