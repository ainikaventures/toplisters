import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "../../_components/AdminNav";
import { sendNewOutreach } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "New outreach",
  robots: { index: false },
};

const inputClass =
  "w-full rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40";

export default function NewOutreachPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <AdminNav />

        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-semibold tracking-tight">New outreach</h1>
          <Link href="/admin/inbox" className="text-sm text-foreground/60 hover:text-foreground">
            ← Inbox
          </Link>
        </div>

        <form action={sendNewOutreach} className="flex flex-col gap-4 text-sm">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-foreground/60">
              Recruiter email
            </span>
            <input type="email" name="to" required placeholder="jane@agency.com" className={inputClass} />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-foreground/60">
              Recruiter name (optional)
            </span>
            <input type="text" name="name" placeholder="Jane Doe" className={inputClass} />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-foreground/60">
              Subject
            </span>
            <input
              type="text"
              name="subject"
              required
              defaultValue="Partnering on your open roles — Toplisters"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-foreground/60">
              Message
            </span>
            <textarea
              name="text"
              required
              rows={10}
              defaultValue={
                "Hi,\n\nI run Toplisters, a job board that aggregates and showcases roles across the world. I'd love to feature your current openings and understand the requirements you're hiring for.\n\nCould you share the roles you're working on and what an ideal candidate looks like?\n\nThanks,\nAinika\nToplisters.xyz"
              }
              className={`${inputClass} resize-y font-mono leading-relaxed`}
            />
          </label>

          <p className="text-xs text-foreground/50">
            Sent via Resend. Replies route back to this thread automatically. Keep volume modest
            and include an opt-out to protect deliverability.
          </p>

          <button
            type="submit"
            className="self-start rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            Send outreach
          </button>
        </form>
      </div>
    </div>
  );
}
