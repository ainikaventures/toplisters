import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slug";

/**
 * Bare /job/[id] (no slug) → canonical /job/[id]/[slug] redirect.
 * Lets old links and unslugged inbound URLs settle on the SEO-canonical
 * URL automatically.
 */
export default async function JobIdRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await prisma.job.findUnique({
    where: { id },
    select: { id: true, title: true },
  });
  if (!job) notFound();
  redirect(`/job/${id}/${slugify(job.title)}`);
}
