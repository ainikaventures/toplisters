"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Approve a pending user-submitted job: flip moderation_status to approved
 * and is_active=true so it shows up on /jobs and the globe immediately.
 * Notifies the submitter by email.
 */
export async function approveSubmission(jobId: string) {
  const job = await prisma.job.update({
    where: { id: jobId },
    data: { moderationStatus: "approved", isActive: true },
    include: { submission: true },
  });

  if (job.submission?.email) {
    await sendEmail({
      to: job.submission.email,
      subject: "Your Toplisters posting is live",
      html: `<p>Your job <strong>${escape(job.title)}</strong> at ${escape(job.companyName)} is now live on Toplisters.xyz.</p>
<p><a href="${SITE_URL}/job/${job.id}">View it here</a>.</p>`,
    });
  }

  revalidatePath("/admin/queue");
}

/**
 * Reject a pending submission. We don't hard-delete (preserves moderation
 * audit trail per spec line 122 reasoning); we just flag rejected and
 * make sure it stays inactive.
 */
export async function rejectSubmission(jobId: string) {
  await prisma.job.update({
    where: { id: jobId },
    data: { moderationStatus: "rejected", isActive: false },
  });
  revalidatePath("/admin/queue");
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
