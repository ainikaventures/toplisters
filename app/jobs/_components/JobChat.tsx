"use client";

import { useEffect, useRef, useState } from "react";

interface ChatJob {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  salary: string | null;
  url: string;
  apply_url: string | null;
}
interface Turn {
  role: "user" | "assistant";
  content: string;
  jobs?: ChatJob[];
}

const SUGGESTIONS = [
  "Remote React developer jobs",
  "Marketing roles in London",
  "Data analyst, £40k+",
  "Entry-level finance jobs in Germany",
];

export function JobChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, loading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const next: Turn[] = [...turns, { role: "user", content: trimmed }];
    setTurns(next);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map((t) => ({ role: t.role, content: t.content })) }),
      });
      if (!res.ok) {
        setError(
          res.status === 503
            ? "AI search isn't configured right now."
            : "Something went wrong — please try again.",
        );
        setLoading(false);
        return;
      }
      const j = (await res.json()) as { reply: string; jobs?: ChatJob[] };
      setTurns((t) => [...t, { role: "assistant", content: j.reply || "", jobs: j.jobs }]);
    } catch {
      setError("Network error — please try again.");
    }
    setLoading(false);
  }

  return (
    <div className="flex h-[calc(100vh-13rem)] min-h-[460px] flex-col rounded-2xl border border-foreground/10">
      {/* Conversation */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {turns.length === 0 && (
          <div className="mx-auto max-w-md pt-8 text-center">
            <p className="text-sm text-foreground/60">
              Describe the job you want — role, location, remote, salary — and I&apos;ll search
              Toplisters&apos; live listings for you.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-foreground/15 px-3 py-1.5 text-xs text-foreground/70 hover:border-foreground/40"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "flex justify-end" : ""}>
            <div
              className={
                t.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-sm bg-foreground px-3.5 py-2 text-sm text-background"
                  : "max-w-[92%] space-y-3"
              }
            >
              {t.content && <p className="whitespace-pre-wrap text-sm leading-relaxed">{t.content}</p>}
              {t.jobs && t.jobs.length > 0 && (
                <ul className="space-y-2">
                  {t.jobs.map((job) => (
                    <li
                      key={job.id}
                      className="rounded-xl border border-foreground/10 bg-muted/20 p-3"
                    >
                      <a href={job.url} className="text-sm font-semibold hover:underline">
                        {job.title}
                      </a>
                      <p className="mt-0.5 text-xs text-foreground/60">
                        {job.company} · {job.location}
                        {job.remote ? " · Remote" : ""}
                        {job.salary ? ` · ${job.salary}` : ""}
                      </p>
                      <div className="mt-2 flex gap-3 text-xs">
                        <a href={job.url} className="font-medium hover:underline">
                          View
                        </a>
                        {job.apply_url && (
                          <a
                            href={job.apply_url}
                            target="_blank"
                            rel="noopener nofollow"
                            className="text-foreground/60 hover:text-foreground"
                          >
                            Apply ↗
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}

        {loading && <p className="text-sm text-foreground/50">Searching…</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t border-foreground/10 p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. remote product manager, £60k+"
          className="flex-1 rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
