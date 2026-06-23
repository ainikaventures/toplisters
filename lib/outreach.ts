import "server-only";
import { randomBytes } from "node:crypto";

/**
 * Recruiter-outreach email sending (Resend), with per-thread reply routing.
 *
 * Outbound mail sets Reply-To: reply+<threadToken>@<INBOUND_DOMAIN>. When the
 * recruiter replies, Resend Inbound delivers it to /api/email/inbound and the
 * +<token> tag tells us which thread it belongs to. Falls back to a dev log
 * when RESEND_API_KEY is unset (same pattern as lib/email.ts).
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
export const INBOUND_DOMAIN = process.env.INBOUND_DOMAIN ?? "inbound.toplisters.xyz";
const OUTREACH_FROM =
  process.env.OUTREACH_FROM ?? process.env.RESEND_FROM ?? "Toplisters <onboarding@resend.dev>";

export function newThreadToken(): string {
  return randomBytes(9).toString("hex"); // 18 hex chars
}

export function replyAddress(token: string): string {
  return `reply+${token}@${INBOUND_DOMAIN}`;
}

/** Pull the thread token out of a "reply+<token>@<inbound domain>" address. */
export function tokenFromAddress(addr: string | null | undefined): string | null {
  if (!addr) return null;
  const m = addr.match(/reply\+([a-z0-9]+)@/i);
  return m ? m[1] : null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
}

export interface OutreachArgs {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Thread token → Reply-To routing. */
  token: string;
  /** Message-ID this is replying to (threads it in the recruiter's client). */
  inReplyTo?: string | null;
}

export async function sendOutreachEmail(args: OutreachArgs): Promise<{ ok: boolean; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const replyTo = replyAddress(args.token);
  const html = args.html ?? `<p>${escapeHtml(args.text).replace(/\n/g, "<br>")}</p>`;

  if (!apiKey) {
    console.log("\n[outreach/dev] would send via Resend:");
    console.log(`  from:     ${OUTREACH_FROM}`);
    console.log(`  to:       ${args.to}`);
    console.log(`  reply-to: ${replyTo}`);
    console.log(`  subject:  ${args.subject}`);
    return { ok: true, id: "dev" };
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: OUTREACH_FROM,
      to: args.to,
      reply_to: replyTo,
      subject: args.subject,
      text: args.text,
      html,
      ...(args.inReplyTo
        ? { headers: { "In-Reply-To": args.inReplyTo, References: args.inReplyTo } }
        : {}),
    }),
  });
  if (!res.ok) {
    console.error(`[outreach] Resend ${res.status}: ${(await res.text().catch(() => "")).slice(0, 240)}`);
    return { ok: false };
  }
  const json = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, id: json.id };
}
