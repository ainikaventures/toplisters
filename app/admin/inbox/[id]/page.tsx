import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminNav } from "../../_components/AdminNav";
import { prisma } from "@/lib/db";
import { relativeTime } from "@/lib/format";
import { sendReply, setThreadStatus } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Conversation",
  robots: { index: false },
};

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const thread = await prisma.emailThread.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!thread) notFound();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <AdminNav />

        <div className="mb-2 flex items-center justify-between">
          <Link href="/admin/inbox" className="text-sm text-foreground/60 hover:text-foreground">
            ← Inbox
          </Link>
          <form action={setThreadStatus}>
            <input type="hidden" name="threadId" value={thread.id} />
            <input type="hidden" name="status" value={thread.status === "closed" ? "open" : "closed"} />
            <button
              type="submit"
              className="rounded-md border border-foreground/15 px-3 py-1.5 text-xs font-medium hover:border-foreground/40"
            >
              {thread.status === "closed" ? "Reopen" : "Mark closed"}
            </button>
          </form>
        </div>

        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{thread.subject}</h1>
          <p className="mt-1 text-sm text-foreground/60">
            {thread.recruiterName ? `${thread.recruiterName} · ` : ""}
            {thread.recruiterEmail}
          </p>
        </header>

        <ol className="mb-8 flex flex-col gap-3">
          {thread.messages.map((m) => {
            const outbound = m.direction === "outbound";
            return (
              <li
                key={m.id}
                className={`rounded-lg border px-4 py-3 ${
                  outbound
                    ? "border-foreground/10 bg-muted/40"
                    : "border-foreground/15 bg-background"
                }`}
              >
                <div className="mb-1 flex items-center justify-between text-xs text-foreground/50">
                  <span className="font-medium text-foreground/70">
                    {outbound ? "You → recruiter" : `${m.fromAddr} → you`}
                  </span>
                  <span>{relativeTime(m.createdAt)}</span>
                </div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.text}</div>
              </li>
            );
          })}
        </ol>

        <form action={sendReply} className="flex flex-col gap-3">
          <input type="hidden" name="threadId" value={thread.id} />
          <textarea
            name="text"
            required
            rows={6}
            placeholder="Write a reply…"
            className="w-full resize-y rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-foreground/40"
          />
          <button
            type="submit"
            className="self-start rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            Send reply
          </button>
        </form>
      </div>
    </div>
  );
}
