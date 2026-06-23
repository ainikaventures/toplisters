import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { newThreadToken, tokenFromAddress } from "@/lib/outreach";

/**
 * Resend Inbound webhook. Resend POSTs an `email.received` event (signed with
 * Svix) for any mail sent to our receiving domain. We verify the signature,
 * thread the message (by the reply+<token> tag, then In-Reply-To, else a new
 * thread so nothing is lost), and store it. Other event types are acked + ignored.
 *
 * NOTE: confirm the exact payload field names against a real inbound email in
 * the Resend dashboard — we read `text`/`html` defensively and fall back to a
 * placeholder if the body isn't included (then it's viewable in Resend).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface InboundData {
  from?: string | { email?: string; name?: string };
  to?: Array<string | { email?: string; name?: string }> | string;
  subject?: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  in_reply_to?: string;
  email_id?: string;
  id?: string;
}

/** Verify a Svix-signed webhook (the scheme Resend uses). */
function verifySvix(
  secret: string,
  id: string | null,
  ts: string | null,
  sigHeader: string | null,
  body: string,
): boolean {
  if (!id || !ts || !sigHeader) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  const expectedBuf = Buffer.from(expected);
  // Header is space-separated "v1,<sig> v1,<sig2>"; any match passes.
  return sigHeader.split(" ").some((part) => {
    const sig = part.split(",")[1];
    if (!sig) return false;
    const provided = Buffer.from(sig);
    return provided.length === expectedBuf.length && timingSafeEqual(provided, expectedBuf);
  });
}

function addrEmail(a: InboundData["from"]): string {
  if (!a) return "";
  if (typeof a === "string") {
    const m = a.match(/<([^>]+)>/);
    return (m ? m[1] : a).trim();
  }
  return (a.email ?? "").trim();
}
function addrName(a: InboundData["from"]): string | null {
  if (!a || typeof a === "string") return null;
  return a.name?.trim() || null;
}

export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    // Fail closed: until the signing secret is set, the endpoint is disabled.
    return NextResponse.json({ error: "inbound webhook not configured" }, { status: 503 });
  }

  const raw = await req.text();
  if (
    !verifySvix(
      secret,
      req.headers.get("svix-id"),
      req.headers.get("svix-timestamp"),
      req.headers.get("svix-signature"),
      raw,
    )
  ) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: { type?: string; data?: InboundData };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (event.type !== "email.received") {
    return NextResponse.json({ ok: true, ignored: event.type ?? "unknown" });
  }

  const d = event.data ?? {};
  const fromEmail = addrEmail(d.from);
  const toList = Array.isArray(d.to) ? d.to : d.to ? [d.to] : [];
  const subject = (d.subject ?? "(no subject)").toString().slice(0, 500);
  const text = (d.text ?? "").toString();
  const html = d.html ?? null;
  const inReplyTo = d.headers?.["in-reply-to"] ?? d.in_reply_to ?? null;

  // 1) Thread by the reply+<token> tag in any recipient address.
  let token: string | null = null;
  for (const t of toList) {
    token = tokenFromAddress(addrEmail(t as InboundData["from"]));
    if (token) break;
  }
  let thread = token ? await prisma.emailThread.findUnique({ where: { token } }) : null;

  // 2) Fall back to matching the In-Reply-To header to a stored message.
  if (!thread && inReplyTo) {
    const prior = await prisma.emailMessage.findFirst({
      where: { messageId: inReplyTo },
      include: { thread: true },
    });
    thread = prior?.thread ?? null;
  }

  // 3) Unsolicited inbound → open a new thread so the message is never dropped.
  if (!thread) {
    thread = await prisma.emailThread.create({
      data: {
        token: newThreadToken(),
        recruiterEmail: fromEmail || "unknown@unknown",
        recruiterName: addrName(d.from),
        subject,
      },
    });
  }

  await prisma.emailMessage.create({
    data: {
      threadId: thread.id,
      direction: "inbound",
      fromAddr: fromEmail || "unknown",
      toAddr: addrEmail(toList[0] as InboundData["from"]) || "",
      subject,
      text: text || "(no text body in webhook payload — view in Resend)",
      html,
      messageId: (d.headers?.["message-id"] ?? null) as string | null,
      inReplyTo,
      providerId: d.email_id ?? d.id ?? null,
    },
  });
  await prisma.emailThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: new Date(), status: "open" },
  });

  return NextResponse.json({ ok: true, threadId: thread.id });
}
