/**
 * Tiny Resend wrapper. Uses the public HTTP API directly (no SDK).
 *
 * Phase-1 fallback: when RESEND_API_KEY is missing (local dev / first
 * boot before the user has signed up), the would-be email is logged to
 * stdout instead. The dev gets a copy-pasteable magic link in the
 * server console; production with a real key sends actual mail.
 */
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const FROM_ADDRESS = process.env.RESEND_FROM ?? "Toplisters <onboarding@resend.dev>";

export interface SendArgs {
  to: string;
  subject: string;
  html: string;
  /** Plaintext fallback. If omitted Resend derives one from the HTML. */
  text?: string;
}

export async function sendEmail(args: SendArgs): Promise<{ ok: boolean; preview?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Dev fallback: log everything so the developer can grab the magic link.
    console.log("\n[email/dev] would send via Resend:");
    console.log(`  to:      ${args.to}`);
    console.log(`  subject: ${args.subject}`);
    console.log(`  html:    ${args.html.replace(/\n/g, " ").slice(0, 240)}…`);
    return { ok: true, preview: args.html };
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: args.to,
      subject: args.subject,
      html: args.html,
      ...(args.text ? { text: args.text } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`[email] Resend ${response.status}: ${body.slice(0, 240)}`);
    return { ok: false };
  }
  return { ok: true };
}
