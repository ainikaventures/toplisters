"use client";

import Link from "next/link";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const NAV: { href: string; label: string }[] = [
  { href: "/", label: "Globe" },
  { href: "/jobs", label: "Browse" },
  { href: "/jobs/locations", label: "Locations" },
  { href: "/post-a-job", label: "Post a job" },
];

/**
 * Shared chrome for /jobs/* and /job/* routes. On sm+ the four nav links
 * sit inline next to the brand. On narrow screens we collapse to a
 * hamburger button that toggles a dropdown panel — useful state that's
 * only client-state, no router involvement, so no Suspense gymnastics.
 *
 * The toggle button shrinks to icon-only on the smallest screens to leave
 * room for the brand + hamburger.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-foreground/10 bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight hover:underline-offset-2 hover:underline"
          onClick={() => setOpen(false)}
        >
          Toplisters
        </Link>

        <nav className="hidden items-center gap-5 sm:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-xs text-foreground/60 hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="inline-flex size-9 items-center justify-center rounded-md border border-foreground/15 hover:border-foreground/40 sm:hidden"
          >
            <span aria-hidden className="text-base leading-none">
              {open ? "✕" : "☰"}
            </span>
          </button>
        </div>
      </div>

      {open ? (
        <nav className="border-t border-foreground/10 bg-background sm:hidden">
          <ul className="mx-auto flex max-w-7xl flex-col px-4 py-2">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-2 py-2 text-sm hover:bg-muted"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
