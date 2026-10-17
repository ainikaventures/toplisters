import { prisma } from "@/lib/db";
import type { Job } from "@/lib/generated/prisma/client";
import { locationLabel, salaryLabel, workModeLabel } from "@/lib/format";
import { flagEmoji } from "@/lib/og/flag";
import { slugify } from "@/lib/slug";
import { TELEGRAM_CHANNEL_URL } from "@/lib/social/links";
import { checkLimit, loadQuery, stashQuery } from "./limits";
import { parseQuery, resolveCountry, type ParsedQuery } from "./parse";
import { BOT_PAGE_SIZE, botSearch, type BotSearchResult } from "./search";

/**
 * @toplisters_jobs_bot — job search in Telegram. Handles webhook updates:
 * private messages (plain text = search; /start /help /search /jobs
 * /remote /sponsor), "More ▶" / help buttons, and inline queries
 * (`@toplisters_jobs_bot nurse dubai` from any chat).
 *
 * Every search passes the per-user limiter (lib/telegram/limits) and is
 * logged to telegram_bot_events for /admin/telegram.
 */

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://toplisters.xyz").replace(/\/$/, "");
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME ?? "toplisters_jobs_bot";
const MAX_QUERY_CHARS = 100;

// ── Telegram types (only the fields we read) ──────────────────────────
interface TgUser {
  id: number;
  is_bot?: boolean;
  username?: string;
}
interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string };
  text?: string;
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: { id: string; from: TgUser; message?: TgMessage; data?: string };
  inline_query?: { id: string; from: TgUser; query: string; offset: string };
}

type Button = { text: string; url?: string; callback_data?: string };

// ── Copy ──────────────────────────────────────────────────────────────
const START_TEXT = [
  "👋 <b>Welcome to Toplisters Jobs</b>",
  "Search jobs straight from employers worldwide.",
  "",
  "Just type what you're looking for:",
  "• <code>nurse dubai</code>",
  "• <code>python developer london remote</code>",
  "• <code>accountant uk visa</code>",
  "",
  "/help — every command and search tip",
  `📢 Daily picks: <a href="${TELEGRAM_CHANNEL_URL}">@toplisters_jobs</a>`,
].join("\n");

const HELP_TEXT = [
  "<b>🔎 How to search</b>",
  "Type a role, skill or company. Add a place if you like:",
  "• <code>data analyst</code>",
  "• <code>teacher in uae</code>",
  "• <code>react developer berlin</code>",
  "",
  "<b>⚙️ Filters</b>, add these words anywhere:",
  "• <code>remote</code>, <code>hybrid</code> or <code>onsite</code>",
  "• <code>visa</code> or <code>sponsor</code>: jobs offering visa sponsorship",
  "",
  "<b>⌨️ Commands</b>",
  "/search <i>words</i>: search (same as just typing)",
  "/jobs <i>country</i>: newest jobs in a country, e.g. /jobs india",
  "/remote <i>words</i>: remote jobs only, e.g. /remote designer",
  "/sponsor <i>words</i>: visa-sponsored jobs, e.g. /sponsor nurse uk",
  "/help: this guide",
  "",
  "<b>💬 In any chat</b>",
  `Type <code>@${BOT_USERNAME} nurse dubai</code> to find a job and share it with a friend.`,
  "",
  "<b>💡 Tips</b>",
  "• Fewer words find more: <code>nurse</code> beats <code>registered staff nurse icu nights</code>.",
  "• Start broad (<code>designer</code>), then add a place or filter.",
  "• Countries and big cities are understood: <code>uk</code>, <code>usa</code>, <code>uae</code>, <code>bangalore</code>, <code>toronto</code>.",
  `• Each search shows up to ${BOT_PAGE_SIZE * 3} jobs. Tap <b>See all on toplisters</b> for every listing.`,
  "",
  "Jobs here come directly from employers' own career pages.",
].join("\n");

// ── Entry point ───────────────────────────────────────────────────────
export async function handleUpdate(update: TgUpdate): Promise<void> {
  if (update.inline_query) return handleInline(update.inline_query);
  if (update.callback_query) return handleCallback(update.callback_query);
  const msg = update.message;
  if (!msg?.text || !msg.from || msg.from.is_bot || msg.chat.type !== "private") return;
  return handleMessage(msg, msg.from);
}

async function handleMessage(msg: TgMessage, from: TgUser) {
  const chatId = msg.chat.id;
  const text = msg.text!.trim().slice(0, MAX_QUERY_CHARS);

  if (text.startsWith("/")) {
    const [rawCmd, ...args] = text.split(/\s+/);
    const cmd = rawCmd.slice(1).split("@")[0].toLowerCase();
    const arg = args.join(" ");
    switch (cmd) {
      case "start":
        await log(from, "command", text, 0);
        if (arg === "help") return send(chatId, HELP_TEXT);
        return send(chatId, START_TEXT, [[{ text: "🔎 Search tips", callback_data: "help" }, { text: "🌍 toplisters.xyz", url: SITE_URL }]]);
      case "help":
        await log(from, "command", text, 0);
        return send(chatId, HELP_TEXT);
      case "jobs": {
        const cc = resolveCountry(arg);
        const parsed: ParsedQuery = cc ? { words: [], countryCode: cc, workMode: null, sponsor: false } : parseQuery(arg);
        if (!arg) return send(chatId, "Which country? e.g. /jobs india or /jobs uk");
        return runSearch(chatId, from, parsed, 0, text);
      }
      case "remote":
        return runSearch(chatId, from, { ...parseQuery(arg), workMode: "remote" }, 0, text);
      case "sponsor":
      case "visa":
        return runSearch(chatId, from, { ...parseQuery(arg), sponsor: true }, 0, text);
      case "search":
        if (!arg) return send(chatId, "What should I search for? e.g. /search nurse dubai");
        return runSearch(chatId, from, parseQuery(arg), 0, text);
      default:
        return send(chatId, "I don't know that command. Send /help to see what I can do.");
    }
  }
  return runSearch(chatId, from, parseQuery(text), 0, text);
}

async function runSearch(chatId: number, from: TgUser, parsed: ParsedQuery, page: number, raw: string) {
  const verdict = await checkLimit(String(from.id), "search");
  if (verdict !== "ok") {
    await log(from, verdict === "blocked" ? "blocked" : "limited", raw, 0);
    return send(
      chatId,
      verdict === "blocked"
        ? "You've reached today's search limit. Please try again tomorrow, or browse everything on toplisters.xyz."
        : "You're searching very quickly. Please wait a minute and try again.",
      [[{ text: "🌍 Open toplisters.xyz", url: `${SITE_URL}/jobs` }]],
    );
  }

  const result = await botSearch(parsed, page);
  await log(from, page > 0 ? "more" : "search", raw, result.jobs.length);

  if (result.jobs.length === 0) {
    return send(
      chatId,
      `No direct-from-employer matches for <b>${esc(result.label)}</b> right now.\n\nTry fewer words, drop a filter, or see every listing on toplisters.`,
      [[{ text: "See all on toplisters ↗", url: result.siteUrl }]],
    );
  }

  const buttons: Button[] = [];
  if (result.hasMore) {
    const key = await stashQuery(JSON.stringify({ parsed, raw }));
    if (key) buttons.push({ text: "More ▶", callback_data: `m:${key}:${page + 1}` });
  }
  buttons.push({ text: "See all on toplisters ↗", url: result.siteUrl });
  return send(chatId, formatResults(result, page), [buttons]);
}

async function handleCallback(cb: NonNullable<TgUpdate["callback_query"]>) {
  await tg("answerCallbackQuery", { callback_query_id: cb.id });
  const chatId = cb.message?.chat.id;
  if (!chatId || cb.from.is_bot) return;
  if (cb.data === "help") return send(chatId, HELP_TEXT);
  const m = /^m:([a-z0-9]+):(\d)$/.exec(cb.data ?? "");
  if (!m) return;
  const stored = await loadQuery(m[1]);
  if (!stored) return send(chatId, "That search has expired. Please search again.");
  const { parsed, raw } = JSON.parse(stored) as { parsed: ParsedQuery; raw: string };
  return runSearch(chatId, cb.from, parsed, Number(m[2]), raw);
}

async function handleInline(iq: NonNullable<TgUpdate["inline_query"]>) {
  const query = iq.query.trim().slice(0, MAX_QUERY_CHARS);
  const button = { text: "How to search", start_parameter: "help" };
  if (query.length < 3 || iq.from.is_bot) {
    return tg("answerInlineQuery", { inline_query_id: iq.id, results: [], cache_time: 60, button });
  }
  const verdict = await checkLimit(String(iq.from.id), "inline");
  if (verdict !== "ok") {
    await log(iq.from, verdict === "blocked" ? "blocked" : "limited", `inline: ${query}`, 0);
    return tg("answerInlineQuery", { inline_query_id: iq.id, results: [], cache_time: 30, is_personal: true, button });
  }

  const page = Math.min(Number.parseInt(iq.offset || "0", 10) || 0, 2);
  const result = await botSearch(parseQuery(query), page);
  await log(iq.from, "inline", query, result.jobs.length);

  const results = result.jobs.map((job) => {
    const url = jobUrl(job);
    const meta = [locationLabel({ city: job.city, countryCode: job.countryCode }), salaryLabel(job)].filter(Boolean).join(" · ");
    return {
      type: "article",
      id: job.id,
      title: `${job.title} — ${job.companyName}`,
      description: meta,
      url,
      ...(job.companyLogoUrl?.startsWith("https://") ? { thumbnail_url: job.companyLogoUrl } : {}),
      input_message_content: {
        message_text: `${formatJob(job)}\n\nvia @${BOT_USERNAME}`,
        parse_mode: "HTML",
        link_preview_options: { url, prefer_large_media: true },
      },
    };
  });

  return tg("answerInlineQuery", {
    inline_query_id: iq.id,
    results,
    cache_time: 300,
    next_offset: result.hasMore ? String(page + 1) : "",
    button,
  });
}

// ── Formatting ────────────────────────────────────────────────────────
function jobUrl(job: Job): string {
  return `${SITE_URL}/job/${job.id}/${slugify(job.title)}?utm_source=telegram&utm_medium=bot`;
}

function formatJob(job: Job, n?: number): string {
  const flag = flagEmoji(job.countryCode);
  const meta = [
    `${flag ? flag + " " : ""}${locationLabel({ city: job.city, countryCode: job.countryCode })}`,
    salaryLabel(job) ? `💰 ${salaryLabel(job)}` : null,
    workModeLabel(job.workMode) || null,
  ]
    .filter(Boolean)
    .join(" · ");
  return [
    `<b>${n ? `${n}. ` : ""}${esc(job.title)}</b>`,
    `${esc(job.companyName)} · ${esc(meta)}`,
    `<a href="${esc(jobUrl(job))}">View job →</a>`,
  ].join("\n");
}

function formatResults(result: BotSearchResult, page: number): string {
  const start = page * BOT_PAGE_SIZE;
  return [
    `🔎 <b>${esc(result.label)}</b>${page > 0 ? ` (page ${page + 1})` : ""}`,
    "",
    result.jobs.map((j, i) => formatJob(j, start + i + 1)).join("\n\n"),
  ].join("\n");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Telegram + logging ────────────────────────────────────────────────
async function send(chatId: number, text: string, keyboard?: Button[][]) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

async function tg(method: string, body: unknown): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(`[telegram-bot] ${method} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  } catch (err) {
    console.error(`[telegram-bot] ${method} failed:`, err instanceof Error ? err.message : err);
  }
}

async function log(from: TgUser, kind: string, query: string | null, results: number) {
  await prisma.telegramBotEvent
    .create({
      data: {
        userId: String(from.id),
        username: from.username ?? null,
        kind,
        query: query?.slice(0, 200) ?? null,
        results,
      },
    })
    .catch(() => null);
}
