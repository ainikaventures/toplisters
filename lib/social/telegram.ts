import type { Job } from "@/lib/generated/prisma/client";
import { composePost } from "./compose";
import type { SocialPoster, SocialPostResult } from "./types";

/**
 * Telegram channel poster via Bot API. Highest ROI per minute of effort
 * — there's no app review, no rate-limit gating, no "your token expired
 * in 60 days" treadmill.
 *
 * Setup (one-time):
 *   1. DM @BotFather → /newbot → pick a name like "Toplisters Jobs".
 *      Save the API token it gives you as TELEGRAM_BOT_TOKEN.
 *   2. Create a public channel (e.g. @toplisters_jobs).
 *   3. Add the bot to the channel as an admin with "Post messages"
 *      permission.
 *   4. Set TELEGRAM_CHANNEL_ID = "@toplisters_jobs" (with the @).
 *
 * Telegram Bot API limit: 30 messages/second per bot, 20 messages/min
 * per chat. Practical daily cap is gated by what subscribers will
 * tolerate; default to 5/day, override via env.
 */
const TG_API = "https://api.telegram.org";

export const telegram: SocialPoster = {
  platform: "telegram",
  label: "Telegram channel",

  enabled() {
    return (
      !!process.env.TELEGRAM_BOT_TOKEN &&
      !!process.env.TELEGRAM_CHANNEL_ID &&
      process.env.SOCIAL_TELEGRAM_ENABLED === "1"
    );
  },

  dailyCap() {
    const fromEnv = Number.parseInt(process.env.SOCIAL_TELEGRAM_DAILY_CAP ?? "", 10);
    if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
    return 5;
  },

  async post(job: Job): Promise<SocialPostResult> {
    const token = process.env.TELEGRAM_BOT_TOKEN!;
    const channelId = process.env.TELEGRAM_CHANNEL_ID!;
    const content = composePost(job);

    // Telegram supports a `parse_mode: "HTML"` with a small whitelist of
    // tags. We render headline as bold + a clickable "Apply →" link, so
    // the layout reads cleanly in the channel.
    const tagLine = content.hashtags.map((t) => `#${t}`).join(" ");
    const text = [
      `<b>${escapeHtml(splitHeadline(content.long).headline)}</b>`,
      escapeHtml(splitHeadline(content.long).rest),
      "",
      `<a href="${escapeHtml(content.url)}">Apply →</a>`,
      tagLine ? `\n${escapeHtml(tagLine)}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const body = {
      chat_id: channelId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
      link_preview_options: { is_disabled: false },
    };

    const response = await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Telegram Bot API ${response.status}: ${errText.slice(0, 300)}`);
    }
    const data = (await response.json()) as {
      ok?: boolean;
      result?: { message_id?: number; chat?: { username?: string } };
      description?: string;
    };
    if (!data.ok || !data.result?.message_id) {
      throw new Error(`Telegram Bot API: ${data.description ?? "unknown error"}`);
    }
    const messageId = data.result.message_id;
    const username =
      data.result.chat?.username ?? channelId.replace(/^@/, "");
    return {
      externalId: String(messageId),
      externalUrl: username ? `https://t.me/${username}/${messageId}` : null,
    };
  },
};

function splitHeadline(longText: string): { headline: string; rest: string } {
  const newline = longText.indexOf("\n");
  if (newline < 0) return { headline: longText, rest: "" };
  return {
    headline: longText.slice(0, newline),
    rest: longText.slice(newline + 1),
  };
}

const HTML_ESCAPE_RE = /[<>&]/g;
const HTML_ESCAPE_MAP: Record<string, string> = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
};
function escapeHtml(s: string): string {
  return s.replace(HTML_ESCAPE_RE, (c) => HTML_ESCAPE_MAP[c] ?? c);
}
