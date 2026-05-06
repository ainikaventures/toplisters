import { redirect } from "next/navigation";

/**
 * Bare /admin → moderation queue. Anyone behind the basic-auth gate
 * lands somewhere useful.
 */
export default function AdminLanding() {
  redirect("/admin/queue");
}
