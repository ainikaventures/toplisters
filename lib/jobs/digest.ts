import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import {
  Prisma,
  type Job,
  type Subscriber,
} from "@/lib/generated/prisma/client";
import { slugify } from "@/lib/slug";
import { countryName, locationLabel, salaryLabel } from "@/lib/format";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://toplisters.xyz";
const MAX_JOBS_PER_DIGEST = 20;
/**
 * For first-time digests (lastSentAt is null), only look at jobs posted
 * within this many days. Keeps brand-new subscribers from receiving an
 * 800-job dump on their first email.
 */
const FIRST_SEND_LOOKBACK_DAYS = 7;
/**
 * Don't re-send within this many hours, even if the cron fires twice.
 * Defends against accidental double-runs.
 */
const MIN_SEND_GAP_HOURS = 20;

export interface DigestStats {
  scanned: number;
  sent: number;
  skippedNoJobs: number;
  skippedTooSoon: number;
  failed: number;
}

interface DigestArgs {
  /**
   * Send to a single email regardless of cadence — useful for the
   * `npm run send-digests -- --email user@example.com` debug path.
   */
  onlyEmail?: string;
  dryRun?: boolean;
}

/**
 * Top-level digest runner. Walks every confirmed + not-unsubscribed
 * subscriber, composes a digest from new jobs that match their
 * `countries` + `workModes` filters, sends via Resend (or logs in dev
 * when RESEND_API_KEY is unset), and stamps `lastSentAt` on success.
 *
 * Per spec line 268 (Phase 2): "Email alerts (basic: subscribe by
 * country/category)". We use country + workMode as the filter set
 * since those are what the subscribe form already collects; category
 * filtering can be added when the form does too.
 *
 * Throughput: walks subscribers serially with no batching. At Phase-1
 * scale (low hundreds) this is fine. When the list grows past ~500 we
 * should batch the SELECT and the sendEmail calls — Resend's free tier
 * is 100 emails/day so the natural ceiling kicks in long before queue
 * concurrency matters.
 */
export async function runDigest(args: DigestArgs = {}): Promise<DigestStats> {
  const stats: DigestStats = {
    scanned: 0,
    sent: 0,
    skippedNoJobs: 0,
    skippedTooSoon: 0,
    failed: 0,
  };

  const where = {
    confirmedAt: { not: null },
    unsubscribedAt: null,
    ...(args.onlyEmail ? { email: args.onlyEmail.toLowerCase() } : {}),
  };
  const subscribers = await prisma.subscriber.findMany({ where });
  stats.scanned = subscribers.length;

  const minGapMs = MIN_SEND_GAP_HOURS * 60 * 60 * 1000;
  const now = Date.now();

  for (const sub of subscribers) {
    // Throttle: skip if we sent within the last MIN_SEND_GAP_HOURS unless
    // the operator explicitly targeted this email (they're debugging).
    if (
      sub.lastSentAt &&
      !args.onlyEmail &&
      now - sub.lastSentAt.getTime() < minGapMs
    ) {
      stats.skippedTooSoon++;
      continue;
    }

    const jobs = await fetchDigestJobs(sub);
    if (jobs.length === 0) {
      stats.skippedNoJobs++;
      continue;
    }

    if (args.dryRun) {
      // Dry-run: count would-be sends without committing or sending.
      stats.sent++;
      continue;
    }

    const { html, text, subject } = renderDigest(sub, jobs);
    const result = await sendEmail({ to: sub.email, subject, html, text });
    if (!result.ok) {
      stats.failed++;
      continue;
    }
    await prisma.subscriber.update({
      where: { id: sub.id },
      data: { lastSentAt: new Date() },
    });
    stats.sent++;
  }

  return stats;
}

async function fetchDigestJobs(sub: Subscriber): Promise<Job[]> {
  const since =
    sub.lastSentAt ??
    new Date(Date.now() - FIRST_SEND_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const where: Prisma.JobWhereInput = {
    isActive: true,
    postedDate: { gt: since },
  };
  if (sub.countries.length > 0) where.countryCode = { in: sub.countries };
  if (sub.workModes.length > 0) {
    // Subscriber stores work modes as strings; the Prisma enum is the
    // same set of strings so the cast through `in` is safe.
    where.workMode = { in: sub.workModes as never };
  }

  return prisma.job.findMany({
    where,
    orderBy: [
      { isFeatured: "desc" },
      { postedDate: "desc" },
    ],
    take: MAX_JOBS_PER_DIGEST,
  });
}

interface RenderedDigest {
  subject: string;
  html: string;
  text: string;
}

function renderDigest(sub: Subscriber, jobs: Job[]): RenderedDigest {
  const count = jobs.length;
  const subject =
    count === 1
      ? "1 new role on Toplisters"
      : `${count} new roles on Toplisters`;

  const filterLine = describeFilters(sub);
  const unsubUrl = `${SITE_URL}/api/alerts/unsubscribe?token=${encodeURIComponent(sub.unsubscribeToken)}`;
  const manageUrl = `${SITE_URL}/alerts`;

  const htmlJobs = jobs
    .map((j) => htmlJobRow(j))
    .join("");
  const textJobs = jobs
    .map((j) => textJobRow(j))
    .join("\n\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="light">
<title>${escape(subject)}</title>
</head>
<body style="margin:0;padding:24px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fafafa;color:#111;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #eee;border-radius:12px;overflow:hidden;">
    <tr><td style="padding:24px 24px 12px 24px;">
      <h1 style="margin:0 0 8px 0;font-size:20px;font-weight:600;letter-spacing:-0.01em;">Toplisters digest</h1>
      <p style="margin:0;font-size:14px;color:#555;">${count} new ${count === 1 ? "role" : "roles"} matching ${escape(filterLine)}.</p>
    </td></tr>
    <tr><td style="padding:8px 24px 24px 24px;">
      ${htmlJobs}
    </td></tr>
    <tr><td style="padding:16px 24px 24px 24px;border-top:1px solid #eee;font-size:12px;color:#666;">
      <p style="margin:0 0 8px 0;">You're receiving this because you subscribed to alerts at ${escape(SITE_URL)}.</p>
      <p style="margin:0;">
        <a href="${escape(manageUrl)}" style="color:#666;text-decoration:underline;">Update preferences</a>
        &nbsp;·&nbsp;
        <a href="${escape(unsubUrl)}" style="color:#666;text-decoration:underline;">Unsubscribe</a>
      </p>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `Toplisters digest — ${count} new ${count === 1 ? "role" : "roles"} matching ${filterLine}`,
    "",
    textJobs,
    "",
    `Update preferences: ${manageUrl}`,
    `Unsubscribe: ${unsubUrl}`,
  ].join("\n");

  return { subject, html, text };
}

function htmlJobRow(job: Job): string {
  const url = `${SITE_URL}/job/${job.id}/${slugify(job.title)}`;
  const location = locationLabel({ city: job.city, countryCode: job.countryCode });
  const salary = salaryLabel(job);
  const meta = [location, salary].filter(Boolean).join(" · ");
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px 0;">
      <tr><td style="padding:12px;border:1px solid #eee;border-radius:8px;">
        <a href="${escape(url)}" style="color:#111;text-decoration:none;">
          <strong style="display:block;font-size:15px;line-height:1.3;">${escape(job.title)}</strong>
          <span style="display:block;color:#555;font-size:13px;margin-top:2px;">${escape(job.companyName)}</span>
          ${meta ? `<span style="display:block;color:#777;font-size:12px;margin-top:4px;">${escape(meta)}</span>` : ""}
        </a>
      </td></tr>
    </table>`;
}

function textJobRow(job: Job): string {
  const url = `${SITE_URL}/job/${job.id}/${slugify(job.title)}`;
  const location = locationLabel({ city: job.city, countryCode: job.countryCode });
  const salary = salaryLabel(job);
  const meta = [location, salary].filter(Boolean).join(" · ");
  return [
    `• ${job.title} — ${job.companyName}`,
    meta ? `  ${meta}` : null,
    `  ${url}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function describeFilters(sub: Subscriber): string {
  const countries = sub.countries.length
    ? sub.countries.map((c) => countryName(c)).join(", ")
    : "any country";
  const modes = sub.workModes.length ? sub.workModes.join(", ") : "any work mode";
  return `${countries} · ${modes}`;
}

const ESCAPE_RE = /[<>&"']/g;
const ESCAPE_MAP: Record<string, string> = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  '"': "&quot;",
  "'": "&#39;",
};
function escape(value: string): string {
  return value.replace(ESCAPE_RE, (c) => ESCAPE_MAP[c] ?? c);
}
