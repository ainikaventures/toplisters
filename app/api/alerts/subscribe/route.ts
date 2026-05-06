import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { verifyCaptcha } from "@/lib/captcha";
import { sendEmail } from "@/lib/email";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const VALID_WORK_MODES = new Set(["remote", "hybrid", "onsite"]);

function token(): string {
  return randomBytes(32).toString("hex");
}

function field(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function fieldList(form: FormData, key: string): string[] {
  return form
    .getAll(key)
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Subscribe handler. Honeypot + captcha, then upsert by email — repeat
 * subscribers re-receive a fresh confirmation link rather than seeing an
 * "already subscribed" error (less friction, and we're idempotent on
 * confirmedAt anyway). Sends the magic link via Resend (or logs it in
 * dev when RESEND_API_KEY is unset).
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();

  if (field(form, "website_url")) {
    return NextResponse.json({ ok: true }); // honeypot tripped
  }
  if (!verifyCaptcha(field(form, "captchaToken"), field(form, "captchaAnswer"))) {
    return NextResponse.json(
      { error: "Captcha check failed. Try again." },
      { status: 400 },
    );
  }

  const email = field(form, "email").toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const countries = fieldList(form, "countries")
    .map((c) => c.toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c))
    .slice(0, 30);
  const workModes = fieldList(form, "workModes")
    .map((m) => m.toLowerCase())
    .filter((m) => VALID_WORK_MODES.has(m));

  const confirmToken = token();
  const subscriber = await prisma.subscriber.upsert({
    where: { email },
    update: {
      countries,
      workModes,
      confirmToken,
      // Re-subscribing after a previous unsubscribe wipes that flag too;
      // the confirm step will set confirmedAt fresh.
      confirmedAt: null,
      unsubscribedAt: null,
    },
    create: {
      email,
      countries,
      workModes,
      confirmToken,
      unsubscribeToken: token(),
    },
  });

  const link = `${SITE_URL}/api/alerts/confirm?token=${subscriber.confirmToken}`;
  await sendEmail({
    to: email,
    subject: "Confirm your Toplisters job alerts",
    html: `<p>Tap the link below to confirm your subscription to Toplisters job alerts.</p>
<p><a href="${link}">${link}</a></p>
<p>If you didn't request this, ignore the email — nothing happens.</p>`,
  });

  return NextResponse.json({ ok: true });
}
