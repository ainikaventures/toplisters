"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

/**
 * Toggle whether a job appears with the featured ranking boost. The
 * listing query already orders by isFeatured desc → postedDate desc, and
 * JobCard renders the "Featured" ribbon when isFeatured is true; flipping
 * the bit here lights both up.
 */
export async function toggleFeatured(jobId: string, next: boolean) {
  await prisma.job.update({
    where: { id: jobId },
    data: { isFeatured: next },
  });
  revalidatePath("/admin/featured");
  revalidatePath("/jobs");
  revalidatePath(`/job/${jobId}`);
}
