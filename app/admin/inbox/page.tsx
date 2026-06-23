import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "../_components/AdminNav";
import { prisma } from "@/lib/db";
import { relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Recruiter inbox",
  robots: { index: false },
};

export default async function InboxPage() {
  const threads = await prisma.emailThread.findMany({
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    include: {
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { messages: true } },
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <AdminNav />

        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Recruiter inbox</h1>
            <p className="mt-1 text-sm text-foreground/60">
              Outreach to recruiters for job requirements. Replies thread back here automatically.
            </p>
          </div>
          <Link
            href="/admin/inbox/new"
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            New outreach
          </Link>
        </header>

        {threads.length === 0 ? (
          <div className="rounded-xl border border-dashed border-foreground/15 px-8 py-16 text-center text-sm text-foreground/60">
            No conversations yet. Click <strong>New outreach</strong> to email a recruiter.
          </div>
        ) : (
          <ul className="divide-y divide-foreground/10 rounded-xl border border-foreground/10">
            {threads.map((t) => {
              const last = t.messages[0];
              return (
                <li key={t.id}>
                  <Link
                    href={`/admin/inbox/${t.id}`}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">
                          {t.recruiterName || t.recruiterEmail}
                        </span>
                        {t.status === "closed" ? (
                          <span className="rounded-full border border-foreground/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-foreground/50">
                            closed
                          </span>
                        ) : null}
                      </div>
                      <div className="truncate text-sm text-foreground/70">{t.subject}</div>
                      {last ? (
                        <div className="truncate text-xs text-foreground/45">
                          {last.direction === "inbound" ? "↩ " : "→ "}
                          {last.text.replace(/\s+/g, " ").slice(0, 120)}
                        </div>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right text-xs text-foreground/45">
                      <div>{relativeTime(t.lastMessageAt)}</div>
                      <div>{t._count.messages} msg</div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
