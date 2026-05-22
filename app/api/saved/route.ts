import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

/**
 * Toggle a saved job for the signed-in user. POST { jobId } → JSON
 * { saved: boolean } with the new state. 401 (not 403) when signed out so
 * the client can bounce to the sign-in page. Idempotent per call: saving
 * an already-saved job stays saved, unsaving an unsaved one stays unsaved.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to save jobs." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { jobId?: unknown };
  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId." }, { status: 400 });
  }

  const existing = await prisma.savedJob.findUnique({
    where: { userId_jobId: { userId: user.id, jobId } },
  });

  if (existing) {
    await prisma.savedJob.delete({ where: { id: existing.id } });
    return NextResponse.json({ saved: false });
  }

  try {
    await prisma.savedJob.create({ data: { userId: user.id, jobId } });
  } catch {
    // FK violation → job doesn't exist (or was removed). Treat as not-saved.
    return NextResponse.json({ error: "That job no longer exists." }, { status: 404 });
  }
  return NextResponse.json({ saved: true });
}
