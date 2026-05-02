"use client";

import Link from "next/link";
import type { GlobeJob } from "@/app/_data/globe";

interface Props {
  open: boolean;
  title: string;
  subtitle: string;
  jobs: GlobeJob[];
  onClose: () => void;
}

/**
 * Slide-in panel for a clicked globe cluster. Anchored to the right edge,
 * uses translate-x for the open/closed transition so it stays GPU-cheap.
 * Backdrop on the left so a click anywhere off-panel closes it.
 */
export function JobPanel({ open, title, subtitle, jobs, onClose }: Props) {
  return (
    <>
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/30 backdrop-blur-[2px] transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        aria-hidden={!open}
        className={`fixed right-0 top-0 z-40 flex h-screen w-full max-w-md flex-col border-l border-foreground/10 bg-background shadow-2xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-foreground/10 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <p className="text-xs text-foreground/60">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-foreground/60 hover:bg-foreground/10 hover:text-foreground"
            aria-label="Close panel"
          >
            <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <ul className="flex-1 divide-y divide-foreground/5 overflow-y-auto">
          {jobs.map((job) => (
            <li key={job.id}>
              <Link
                href={`/jobs/${job.id}/${job.slug}`}
                className="flex items-center gap-3 px-6 py-4 transition-colors hover:bg-foreground/5"
                onClick={onClose}
              >
                <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-foreground/10 bg-muted">
                  {job.companyLogoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={job.companyLogoUrl}
                      alt=""
                      className="size-full object-contain"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-foreground/60">
                      {(job.companyName[0] ?? "?").toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{job.title}</p>
                  <p className="truncate text-xs text-foreground/60">
                    {job.companyName}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </aside>
    </>
  );
}
