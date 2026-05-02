import { NextResponse, type NextRequest } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { verifyCaptcha } from "@/lib/captcha";
import { sendEmail } from "@/lib/email";
import { resolveCompanyLogo } from "@/lib/logos";
import { geocode } from "@/lib/geocoding/lookup";
import { cleanHtml, htmlToPlainText, computeDedupeHash } from "@/lib/sources/utils";
import type { $Enums } from "@/lib/generated/prisma/client";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const TOKEN_TTL_HOURS = 24;
const UNKNOWN_COUNTRY = "ZZ";

const JOB_TYPES = new Set<$Enums.JobType>([
  "full_time",
  "part_time",
  "contract",
  "temp",
  "internship",
]);
const WORK_MODES = new Set<$Enums.WorkMode>([
  "remote",
  "hybrid",
  "onsite",
]);

function field(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function intOrNull(form: FormData, key: string): number | null {
  const v = field(form, key);
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Convert plain-text descriptions into the safe-HTML shape we render:
 * paragraph splits on double-newlines, soft line-breaks on single newlines.
 * cleanHtml() then strips anything dangerous.
 */
function plainToHtml(text: string): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => `<p>${escape(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return cleanHtml(paragraphs);
}

export async function POST(request: NextRequest) {
  const form = await request.formData();

  // Honeypot: real users leave this blank; bots fill every field.
  if (field(form, "website_url")) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Math captcha verification.
  if (!verifyCaptcha(field(form, "captchaToken"), field(form, "captchaAnswer"))) {
    return NextResponse.json({ error: "Captcha check failed. Try again." }, { status: 400 });
  }

  const title = field(form, "title");
  const companyName = field(form, "companyName");
  const locationText = field(form, "locationText");
  const description = field(form, "descriptionText");
  const applyUrl = field(form, "applyUrl");
  const email = field(form, "email").toLowerCase();
  const jobTypeRaw = field(form, "jobType");
  const workModeRaw = field(form, "workMode");

  if (!title || !companyName || !locationText || !description || !applyUrl || !email) {
    return NextResponse.json({ error: "Please fill in every required field." }, { status: 400 });
  }
  if (description.length < 50) {
    return NextResponse.json({ error: "Description should be at least 50 characters." }, { status: 400 });
  }
  if (!JOB_TYPES.has(jobTypeRaw as $Enums.JobType) || !WORK_MODES.has(workModeRaw as $Enums.WorkMode)) {
    return NextResponse.json({ error: "Pick a valid job type and work mode." }, { status: 400 });
  }

  // Best-effort geocode + logo resolution; misses don't block submission.
  const geo = await geocode(locationText);
  const companyDomain = field(form, "companyDomain") || null;
  const companyLogoUrl = await resolveCompanyLogo(companyName);

  const now = new Date();
  const sourceId = `user-${randomBytes(8).toString("hex")}`;

  const job = await prisma.job.create({
    data: {
      source: "user",
      sourceId,
      title,
      companyName,
      companyDomain,
      companyLogoUrl,
      locationText,
      countryCode: geo?.countryCode ?? UNKNOWN_COUNTRY,
      region: geo?.region ?? null,
      city: geo?.city ?? null,
      lat: geo?.lat ?? 0,
      lng: geo?.lng ?? 0,
      applyUrl,
      descriptionHtml: plainToHtml(description),
      descriptionText: htmlToPlainText(description),
      postedDate: now,
      lastSeenAt: now,
      salaryMin: intOrNull(form, "salaryMin"),
      salaryMax: intOrNull(form, "salaryMax"),
      salaryCurrency: field(form, "salaryCurrency") || null,
      salaryPeriod: intOrNull(form, "salaryMin") || intOrNull(form, "salaryMax") ? "yearly" : null,
      jobType: jobTypeRaw as $Enums.JobType,
      workMode: workModeRaw as $Enums.WorkMode,
      experienceLevel: "unknown",
      category: "other",
      collarType: "unknown",
      skills: [],
      benefits: [],
      isUserSubmitted: true,
      submittedByEmail: email,
      moderationStatus: "pending",
      isActive: false,
      dedupeHash: computeDedupeHash(
        title,
        companyName,
        geo?.countryCode ?? UNKNOWN_COUNTRY,
        geo?.city ?? null,
      ),
    },
  });

  const token = createHash("sha256")
    .update(randomBytes(32))
    .digest("hex");
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_HOURS * 60 * 60 * 1000);

  await prisma.jobSubmission.create({
    data: { jobId: job.id, email, token, expiresAt },
  });

  const link = `${SITE_URL}/api/jobs/submit/confirm?token=${token}`;
  await sendEmail({
    to: email,
    subject: "Confirm your Toplisters job posting",
    html: `<p>Thanks for posting on Toplisters.xyz.</p>
<p>Click the link below within ${TOKEN_TTL_HOURS} hours to confirm your email and send your post to moderation:</p>
<p><a href="${link}">${link}</a></p>
<p>Submitted role: <strong>${title}</strong> at ${companyName}.</p>`,
  });

  return NextResponse.json({ ok: true });
}
