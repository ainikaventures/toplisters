"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { newThreadToken, sendOutreachEmail } from "@/lib/outreach";

function field(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

/** Start a new recruiter thread and send the first outreach email. */
export async function sendNewOutreach(formData: FormData): Promise<void> {
  const to = field(formData, "to");
  const recruiterName = field(formData, "name") || null;
  const subject = field(formData, "subject");
  const text = field(formData, "text");
  if (!to || !subject || !text) return;

  const token = newThreadToken();
  const thread = await prisma.emailThread.create({
    data: { token, recruiterEmail: to, recruiterName, subject },
  });
  const sent = await sendOutreachEmail({ to, subject, text, token });
  await prisma.emailMessage.create({
    data: {
      threadId: thread.id,
      direction: "outbound",
      fromAddr: "outreach",
      toAddr: to,
      subject,
      text,
      providerId: sent.id ?? null,
    },
  });
  redirect(`/admin/inbox/${thread.id}`);
}

/** Reply within an existing thread. */
export async function sendReply(formData: FormData): Promise<void> {
  const threadId = field(formData, "threadId");
  const text = field(formData, "text");
  if (!threadId || !text) return;

  const thread = await prisma.emailThread.findUnique({ where: { id: threadId } });
  if (!thread) return;

  const subject = thread.subject.startsWith("Re:") ? thread.subject : `Re: ${thread.subject}`;
  const last = await prisma.emailMessage.findFirst({
    where: { threadId, direction: "inbound" },
    orderBy: { createdAt: "desc" },
  });
  const sent = await sendOutreachEmail({
    to: thread.recruiterEmail,
    subject,
    text,
    token: thread.token,
    inReplyTo: last?.messageId ?? null,
  });
  await prisma.emailMessage.create({
    data: {
      threadId,
      direction: "outbound",
      fromAddr: "outreach",
      toAddr: thread.recruiterEmail,
      subject,
      text,
      providerId: sent.id ?? null,
    },
  });
  await prisma.emailThread.update({
    where: { id: threadId },
    data: { lastMessageAt: new Date() },
  });
  revalidatePath(`/admin/inbox/${threadId}`);
}

/** Toggle a thread between open and closed. */
export async function setThreadStatus(formData: FormData): Promise<void> {
  const threadId = field(formData, "threadId");
  const status = field(formData, "status") === "closed" ? "closed" : "open";
  if (!threadId) return;
  await prisma.emailThread.update({ where: { id: threadId }, data: { status } });
  revalidatePath(`/admin/inbox/${threadId}`);
  revalidatePath("/admin/inbox");
}
