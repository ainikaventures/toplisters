import { NextResponse, type NextRequest } from "next/server";
import { verifyCaptcha } from "@/lib/captcha";
import { sendEmail } from "@/lib/email";
import { issueLoginToken } from "@/lib/auth/login-token";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function field(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/** Keep the post-login redirect target to a same-site path. */
function safeNext(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/account";
}

/**
 * Request a sign-in link. Honeypot + math captcha (same gate as the
 * alerts + post-a-job forms), then mint a single-use token and email the
 * magic link. Always returns ok — we never reveal whether an account
 * exists, and signing in for the first time *is* account creation (the
 * callback upserts the User).
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

  const next = safeNext(field(form, "next"));
  const raw = await issueLoginToken(email);
  const link = `${SITE_URL}/api/auth/callback?token=${raw}&next=${encodeURIComponent(next)}`;

  await sendEmail({
    to: email,
    subject: "Your Toplisters sign-in link",
    html: `<p>Tap the link below to sign in to Toplisters. It works once and expires in 15 minutes.</p>
<p><a href="${link}">${link}</a></p>
<p>If you didn't request this, ignore the email — nothing happens.</p>`,
    text: `Sign in to Toplisters (link works once, expires in 15 minutes):\n${link}\n\nIf you didn't request this, ignore this email.`,
  });

  return NextResponse.json({ ok: true });
}
