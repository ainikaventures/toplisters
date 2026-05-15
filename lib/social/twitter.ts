import { TwitterApi } from "twitter-api-v2";
import type { Job } from "@/lib/generated/prisma/client";
import { composePost } from "./compose";
import type { SocialPoster, SocialPostResult } from "./types";

/**
 * X (Twitter) v2 poster. Uses OAuth 1.0a User Context — that's the auth
 * flow the free tier supports for POST /2/tweets, and the
 * `twitter-api-v2` library wraps the HMAC-SHA1 signing.
 *
 * Setup (one-time):
 *   1. Apply for the X Developer Portal (free tier is fine for posting).
 *   2. Create a project + app. In the app's User auth settings, enable
 *      OAuth 1.0a with "Read and write" permissions.
 *   3. From "Keys and tokens", generate:
 *        - Consumer keys → API Key + API Key Secret
 *        - Access Token + Secret (the "Generate" button at the bottom)
 *      The Access Token must be on the account you want to post AS.
 *      If you generated it before flipping the permissions to R/W, you
 *      must regenerate it — old tokens stay read-only.
 *   4. Set TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN,
 *      TWITTER_ACCESS_SECRET.
 *
 * Free tier limit: 500 posts/month. Default daily cap of 3 puts us at
 * ~90/month, well clear of the ceiling.
 */
export const twitter: SocialPoster = {
  platform: "twitter",
  label: "X (Twitter)",

  enabled() {
    return (
      !!process.env.TWITTER_API_KEY &&
      !!process.env.TWITTER_API_SECRET &&
      !!process.env.TWITTER_ACCESS_TOKEN &&
      !!process.env.TWITTER_ACCESS_SECRET &&
      process.env.SOCIAL_TWITTER_ENABLED === "1"
    );
  },

  dailyCap() {
    const fromEnv = Number.parseInt(process.env.SOCIAL_TWITTER_DAILY_CAP ?? "", 10);
    if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
    return 3;
  },

  async post(job: Job): Promise<SocialPostResult> {
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY!,
      appSecret: process.env.TWITTER_API_SECRET!,
      accessToken: process.env.TWITTER_ACCESS_TOKEN!,
      accessSecret: process.env.TWITTER_ACCESS_SECRET!,
    });

    const content = composePost(job);
    // X uses t.co URL shortening — any URL collapses to 23 chars in the
    // post-length accounting, regardless of actual length. Total post
    // limit is 280 chars on free tier, so: short (≤240) + " " + URL
    // (23) = ≤264. Hashtags go inline since they share the budget.
    const tagLine = content.hashtags
      .slice(0, 2)
      .map((t) => `#${t}`)
      .join(" ");
    const headline = trimToFit(content.short, 230 - tagLine.length);
    const text = [headline, tagLine, content.url].filter(Boolean).join("\n");

    const result = await client.v2.tweet(text);
    return {
      externalId: result.data.id,
      externalUrl: `https://x.com/i/web/status/${result.data.id}`,
    };
  },
};

function trimToFit(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > max * 0.8) return `${cut.slice(0, lastSpace).trimEnd()}…`;
  return `${cut}…`;
}
