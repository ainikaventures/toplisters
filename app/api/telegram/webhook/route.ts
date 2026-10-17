import { timingSafeEqual } from "node:crypto";
import { handleUpdate, type TgUpdate } from "@/lib/telegram/bot";

/**
 * POST /api/telegram/webhook — Telegram delivers bot updates here
 * (registered by `npm run telegram:setup`). Telegram echoes our
 * TELEGRAM_WEBHOOK_SECRET in X-Telegram-Bot-Api-Secret-Token; anything
 * without it is rejected, so nobody else can drive the bot through us.
 *
 * Always 200s on a handled (or failed) update — a non-2xx makes Telegram
 * retry the same update repeatedly.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const given = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!secret || !safeEqual(given, secret)) {
    return new Response("Forbidden", { status: 403 });
  }

  let update: TgUpdate;
  try {
    update = (await request.json()) as TgUpdate;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  try {
    await handleUpdate(update);
  } catch (err) {
    console.error("[telegram-bot] update failed:", err instanceof Error ? err.message : err);
  }
  return new Response("ok");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
