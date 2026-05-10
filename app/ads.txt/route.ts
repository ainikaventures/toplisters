import { NextResponse } from "next/server";

/**
 * Google AdSense ads.txt declaration (https://iabtechlab.com/ads-txt/).
 *
 * Required to clear the "Ads.txt status: Not found" warning in the
 * AdSense dashboard. Without it, Google can't verify which ad networks
 * are authorised to monetise toplisters.xyz, AdSense verification
 * stalls in the "Getting ready" state, and post-approval fill rates
 * stay capped.
 *
 * Format per record:
 *   <ad-system-domain>, <publisher-id>, <relationship>, <auth-id>
 *
 *   - publisher-id: the bare `pub-…` form (no `ca-` prefix — that's only
 *     for the JS script tag's `data-ad-client` attribute)
 *   - relationship: DIRECT (we work with Google directly) or RESELLER
 *     (a partner is reselling our inventory; not us)
 *   - auth-id: f08c47fec0942fa0 is Google's published AdSense authority
 *     identifier. Not a secret — same value for every AdSense publisher.
 *
 * Add new lines here when other ad networks are wired up. For Phase-3
 * sponsored/featured listings (sold direct, not via an ad network) no
 * ads.txt entry is needed; ads.txt only governs programmatic exchanges.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const pubId = client?.replace(/^ca-/, "").trim();

  const lines: string[] = [
    "# ads.txt — authorised digital sellers for toplisters.xyz",
    "# spec: https://iabtechlab.com/ads-txt/",
  ];
  if (pubId) {
    lines.push(`google.com, ${pubId}, DIRECT, f08c47fec0942fa0`);
  }

  return new NextResponse(lines.join("\n") + "\n", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Crawlers re-fetch ads.txt periodically; an hour cache is plenty
      // and Cloudflare in front will respect it without re-deploys.
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
