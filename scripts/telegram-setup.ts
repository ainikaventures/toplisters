/**
 * One-time (idempotent) Telegram search-bot setup. Run in the web or worker
 * container after TELEGRAM_BOT_TOKEN + TELEGRAM_WEBHOOK_SECRET are set:
 *
 *   npm run telegram:setup
 *
 * Registers the webhook (with the secret header), the command menu users
 * see when they type "/", and the bot's description texts.
 *
 * Inline mode (`@toplisters_jobs_bot nurse dubai` in any chat) has no API
 * switch — enable it once in @BotFather: /setinline → pick the bot →
 * placeholder e.g. "role and place, e.g. nurse dubai".
 */

import "dotenv/config";

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://toplisters.xyz").replace(/\/$/, "");

async function tg(method: string, body: unknown) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok: boolean; description?: string };
  console.log(`${data.ok ? "✓" : "✗"} ${method}${data.ok ? "" : `: ${data.description}`}`);
  if (!data.ok) process.exitCode = 1;
}

(async () => {
  if (!token || !secret) {
    console.error("Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET first.");
    process.exit(1);
  }
  await tg("setWebhook", {
    url: `${site}/api/telegram/webhook`,
    secret_token: secret,
    allowed_updates: ["message", "callback_query", "inline_query"],
    drop_pending_updates: true,
  });
  await tg("setMyCommands", {
    commands: [
      { command: "search", description: "Search jobs, e.g. /search nurse dubai" },
      { command: "jobs", description: "Newest jobs in a country, e.g. /jobs india" },
      { command: "remote", description: "Remote jobs only, e.g. /remote designer" },
      { command: "sponsor", description: "Visa-sponsored jobs, e.g. /sponsor nurse uk" },
      { command: "help", description: "How to search + tips" },
    ],
  });
  await tg("setMyShortDescription", {
    short_description: "Search jobs straight from employers worldwide. Type a role and place, e.g. nurse dubai.",
  });
  await tg("setMyDescription", {
    description:
      "Find jobs straight from employers' career pages.\n\nType what you want, e.g. \"python developer london remote\", or send /help for commands and tips.\n\nDaily picks: @toplisters_jobs",
  });
})();
