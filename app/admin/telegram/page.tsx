import type { Metadata } from "next";
import { AdminNav } from "../_components/AdminNav";
import { prisma } from "@/lib/db";
import { autoBlockedUsers } from "@/lib/telegram/limits";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Telegram bot", robots: { index: false } };

/**
 * Search-bot monitoring: volume, heaviest users (scraping shows up here as
 * one id with hundreds of searches), who's been throttled or auto-blocked,
 * and zero-result searches (what job seekers want that we don't have).
 * Block an id permanently via TELEGRAM_BLOCKED_USERS.
 */
export default async function TelegramBotPage() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [day, week, users24h, heavy, throttled, zero, recent, blocked] = await Promise.all([
    prisma.telegramBotEvent.count({ where: { createdAt: { gte: since24h } } }),
    prisma.telegramBotEvent.count({ where: { createdAt: { gte: since7d } } }),
    prisma.telegramBotEvent.groupBy({ by: ["userId"], where: { createdAt: { gte: since24h } } }),
    prisma.telegramBotEvent.groupBy({
      by: ["userId", "username"],
      where: { createdAt: { gte: since24h } },
      _count: { _all: true },
      orderBy: { _count: { userId: "desc" } },
      take: 15,
    }),
    prisma.telegramBotEvent.groupBy({
      by: ["userId", "username", "kind"],
      where: { createdAt: { gte: since7d }, kind: { in: ["limited", "blocked"] } },
      _count: { _all: true },
      orderBy: { _count: { userId: "desc" } },
      take: 15,
    }),
    prisma.telegramBotEvent.groupBy({
      by: ["query"],
      where: { createdAt: { gte: since7d }, results: 0, kind: { in: ["search", "inline"] } },
      _count: { _all: true },
      orderBy: { _count: { query: "desc" } },
      take: 20,
    }),
    prisma.telegramBotEvent.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    autoBlockedUsers(),
  ]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <AdminNav />
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight">Telegram bot</h1>
          <p className="mt-1 text-sm text-foreground/60">
            @toplisters_jobs_bot searches. A scraper looks like one id with far more searches than anyone else.
            Over the daily limit = auto-blocked 24h; block for good via <code className="rounded bg-muted px-1 py-0.5">TELEGRAM_BLOCKED_USERS</code>.
          </p>
          <p className="mt-3 text-sm">
            <span className="font-semibold tabular-nums">{day.toLocaleString()}</span> events / 24h ·{" "}
            <span className="font-semibold tabular-nums">{users24h.length.toLocaleString()}</span> users / 24h ·{" "}
            <span className="font-semibold tabular-nums">{week.toLocaleString()}</span> events / 7d ·{" "}
            <span className="font-semibold tabular-nums">{blocked.length}</span> auto-blocked now
          </p>
        </header>

        <Section title="Heaviest users (24h)">
          {heavy.map((u) => (
            <Row key={u.userId + (u.username ?? "")} left={<User id={u.userId} name={u.username} blocked={blocked.includes(u.userId)} />} right={u._count._all} />
          ))}
        </Section>

        <Section title="Throttled / blocked (7d)">
          {throttled.map((u) => (
            <Row key={u.userId + u.kind} left={<><User id={u.userId} name={u.username} blocked={blocked.includes(u.userId)} /> <span className="text-foreground/50">· {u.kind}</span></>} right={u._count._all} />
          ))}
        </Section>

        <Section title="Searches with no results (7d)">
          {zero.map((z) => (
            <Row key={z.query ?? ""} left={<code>{z.query}</code>} right={z._count._all} />
          ))}
        </Section>

        <Section title="Latest">
          {recent.map((e) => (
            <Row
              key={String(e.id)}
              left={
                <>
                  <span className="text-foreground/45">{e.createdAt.toISOString().slice(5, 16).replace("T", " ")}</span>{" "}
                  <User id={e.userId} name={e.username} blocked={blocked.includes(e.userId)} />{" "}
                  <span className="text-foreground/50">{e.kind}</span> <code>{e.query}</code>
                </>
              }
              right={e.results}
            />
          ))}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const empty = Array.isArray(children) && children.length === 0;
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-foreground/45">{title}</h2>
      <div className="overflow-hidden rounded-xl border border-foreground/10">
        {empty ? <p className="px-4 py-3 text-sm text-foreground/50">Nothing yet.</p> : <ul>{children}</ul>}
      </div>
    </section>
  );
}

function Row({ left, right }: { left: React.ReactNode; right: number }) {
  return (
    <li className="flex items-center gap-3 border-t border-foreground/5 px-4 py-2 text-sm first:border-t-0">
      <span className="min-w-0 flex-1 truncate">{left}</span>
      <span className="w-16 text-right tabular-nums text-foreground/70">{right.toLocaleString()}</span>
    </li>
  );
}

function User({ id, name, blocked }: { id: string; name: string | null; blocked: boolean }) {
  return (
    <span>
      {name ? `@${name}` : "—"} <span className="text-foreground/40">({id})</span>
      {blocked ? <span className="ml-1 rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] text-red-600 dark:text-red-400">blocked</span> : null}
    </span>
  );
}
