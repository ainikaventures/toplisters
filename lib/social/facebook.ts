import type { Job } from "@/lib/generated/prisma/client";
import { composePost } from "./compose";
import type { SocialPoster, SocialPostResult } from "./types";

/**
 * Facebook Page poster via Graph API.
 *
 * Setup (one-time):
 *   1. Create a Facebook Page if you don't have one.
 *   2. Create a Meta for Developers app → add the "Pages API" product.
 *   3. Get a long-lived Page Access Token (NOT a user token) with the
 *      `pages_manage_posts` permission. The Page Access Token is what
 *      sets the post author to the Page itself.
 *   4. Find your page id at facebook.com/{page-name} → About → Page ID,
 *      or via /me/accounts on the Graph API explorer.
 *   5. Set FACEBOOK_PAGE_ID + FACEBOOK_PAGE_ACCESS_TOKEN.
 *
 * Page Access Tokens issued via "long-lived" exchange last 60 days.
 * Tokens issued via the "system user" flow on a verified business
 * never expire — use that path for unattended production posting.
 *
 * Endpoint reference:
 *   POST https://graph.facebook.com/v19.0/{page-id}/feed
 *   body: { message, link, access_token }
 *
 * Rate limit: 200 calls/hour per page (Page Token). We're well under.
 */
const GRAPH_API_VERSION = "v19.0";

export const facebook: SocialPoster = {
  platform: "facebook",
  label: "Facebook Page",

  enabled() {
    return (
      !!process.env.FACEBOOK_PAGE_ID &&
      !!process.env.FACEBOOK_PAGE_ACCESS_TOKEN &&
      process.env.SOCIAL_FACEBOOK_ENABLED === "1"
    );
  },

  dailyCap() {
    const fromEnv = Number.parseInt(process.env.SOCIAL_FACEBOOK_DAILY_CAP ?? "", 10);
    if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
    return 3;
  },

  async post(job: Job): Promise<SocialPostResult> {
    const pageId = process.env.FACEBOOK_PAGE_ID!;
    const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN!;
    const content = composePost(job);

    // Facebook strips/auto-renders trailing URLs when `link` is passed,
    // so we keep the message clean (no inlined URL) and let FB do the
    // link unfurl. Hashtags go at the very end where they read as tags.
    const tagLine = content.hashtags.map((t) => `#${t}`).join(" ");
    const message = tagLine ? `${content.long}\n\n${tagLine}` : content.long;

    const body = new URLSearchParams({
      message,
      link: content.url,
      access_token: token,
    });

    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}/feed`,
      {
        method: "POST",
        body,
      },
    );
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Facebook Graph API ${response.status}: ${errText.slice(0, 300)}`);
    }
    const data = (await response.json()) as { id?: string };
    if (!data.id) throw new Error("Facebook Graph API returned no post id");

    // Graph post ids are formatted `{page-id}_{post-id}` — the public
    // permalink slots the post id directly after `/posts/`.
    const postId = data.id.includes("_") ? data.id.split("_")[1] ?? data.id : data.id;
    return {
      externalId: data.id,
      externalUrl: `https://www.facebook.com/${pageId}/posts/${postId}`,
    };
  },
};
