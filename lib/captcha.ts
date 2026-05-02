import { createHmac } from "node:crypto";

const TTL_MS = 10 * 60 * 1000;

function secret(): string {
  return process.env.IP_SALT ?? process.env.ADMIN_PASSWORD ?? "toplisters-dev";
}

function hmac(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex").slice(0, 16);
}

export interface CaptchaChallenge {
  question: string;
  /** Signed payload to round-trip back through the form. */
  token: string;
}

/**
 * Tiny stateless math captcha (per spec line 162). Generates `a + b` with
 * a single-digit answer; signs `<answer>|<expiry>` with HMAC so the
 * client can't forge an "any answer is valid" token. No reCAPTCHA, no
 * cookies, no server state — works behind Cloudflare and survives
 * page-refresh round trips.
 */
export function makeCaptcha(): CaptchaChallenge {
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  const answer = a + b;
  const expiresAt = Date.now() + TTL_MS;
  const payload = `${answer}|${expiresAt}`;
  return {
    question: `${a} + ${b}`,
    token: `${payload}|${hmac(payload)}`,
  };
}

export function verifyCaptcha(token: string | null, userAnswer: string | null): boolean {
  if (!token || !userAnswer) return false;
  const parts = token.split("|");
  if (parts.length !== 3) return false;
  const [answer, expiresAt, sig] = parts;
  if (Date.now() > Number.parseInt(expiresAt, 10)) return false;
  if (hmac(`${answer}|${expiresAt}`) !== sig) return false;
  return userAnswer.trim() === answer;
}
