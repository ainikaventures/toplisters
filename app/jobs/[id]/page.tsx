import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slug";

/**
 * Bare /jobs/[id] (no slug) → canonical /jobs/[id]/[slug] redirect.
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
  redirect(`/jobs/${id}/${slugify(job.title)}`);
}
