import { NextResponse, type NextRequest } from "next/server";
import { verifyCaptcha } from "@/lib/captcha";
import { sendEmail } from "@/lib/email";
import { prisma } from "@/lib/db";
import { newThreadToken } from "@/lib/outreach";

/**
 * Contact form handler. Human verification mirrors the post-a-job route:
 * a honeypot field + the stateless HMAC math captcha (lib/captcha.ts) — no
 * third-party captcha, works behind Cloudflare. On success we (1) email the
 * operator with Reply-To set to the sender so a reply goes straight back, and
 * (2) log the message into the admin inbox (/admin/inbox) as a durable,
 * replyable record. The inbox write is best-effort; the email is the contract.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONTACT_TO =
  process.env.CONTACT_TO ?? process.env.ADMIN_EMAIL ?? "ainikaventures@gmail.com";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function field(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData();

  // Honeypot — real users leave this blank; bots fill every field.
  if (field(form, "website_url")) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Human check (math captcha).
  if (!verifyCaptcha(field(form, "captchaToken"), field(form, "captchaAnswer"))) {
    return NextResponse.json({ error: "Captcha check failed. Try again." }, { status: 400 });
  }

  const name = field(form, "name");
  const email = field(form, "email").toLowerCase();
  const subject = field(form, "subject") || "(no subject)";
  const message = field(form, "message");

  if (!name || !email || !message) {
    return NextResponse.json({ error: "Please fill in your name, email and message." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (message.length < 10) {
    return NextResponse.json({ error: "Your message is too short." }, { status: 400 });
  }
  if (message.length > 5000) {
    return NextResponse.json({ error: "Your message is too long (5000 characters max)." }, { status: 400 });
  }

  const taggedSubject = `[Contact] ${subject}`.slice(0, 500);

  // 1) Notify the operator — Reply-To the sender for a one-click reply.
  const sent = await sendEmail({
    to: CONTACT_TO,
    replyTo: email,
    subject: taggedSubject,
    text: `From: ${name} <${email}>\n\n${message}`,
    html:
      `<p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>` +
      `<p style="white-space:pre-wrap">${escapeHtml(message)}</p>`,
  });
  if (!sent.ok) {
    return NextResponse.json({ error: "Couldn't send your message. Please try again later." }, { status: 502 });
  }

  // 2) Durable, replyable record in the admin inbox (best-effort).
  try {
    const thread = await prisma.emailThread.create({
      data: { token: newThreadToken(), recruiterEmail: email, recruiterName: name, subject: taggedSubject },
    });
    await prisma.emailMessage.create({
      data: {
        threadId: thread.id,
        direction: "inbound",
        fromAddr: email,
        toAddr: CONTACT_TO,
        subject: taggedSubject,
        text: message,
      },
    });
  } catch (error) {
    console.error("[contact] inbox store failed:", error instanceof Error ? error.message : error);
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
