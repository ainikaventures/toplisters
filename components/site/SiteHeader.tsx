"use client";

import Link from "next/link";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

type NavItem = { href: string; label: string; external?: boolean };

// Cross-vertical homes. Absolute in prod (subdomains), relative fallback in dev.
const SPORTS_HOME = process.env.NEXT_PUBLIC_SPORTS_URL || "/sports";
const JOBS_HOME = process.env.NEXT_PUBLIC_SITE_URL || "/";

const JOBS_NAV: NavItem[] = [
  { href: "/jobs", label: "Browse" },
  { href: "/globe", label: "Globe" },
  { href: "/jobs/locations", label: "Locations" },
  { href: "/analytics", label: "Analytics" },
  { href: "/post-a-job", label: "Post a job" },
  { href: SPORTS_HOME, label: "Sports", external: SPORTS_HOME.startsWith("http") },
];

// Sports vertical serves from the subdomain root, so links are root-relative.
const SPORTS_NAV: NavItem[] = [
  { href: "/f1", label: "Formula 1" },
  { href: "/world-cup", label: "World Cup" },
  { href: JOBS_HOME, label: "Jobs", external: JOBS_HOME.startsWith("http") },
];

/**
 * Shared chrome across verticals. `variant` swaps the nav + brand target so
 * the same shell serves jobs (default) and sports — the markup, styling, and
 * theme toggle stay identical (do NOT fork this component per vertical).
 */
export function SiteHeader({ variant = "jobs" }: { variant?: "jobs" | "sports" }) {
  const [open, setOpen] = useState(false);
  const isSports = variant === "sports";
  const nav = isSports ? SPORTS_NAV : JOBS_NAV;
  const brandHref = isSports ? "/" : "/";
  const brandLabel = isSports ? "Toplisters · Sports" : "Toplisters";

  const linkProps = (item: NavItem) =>
    item.external ? { href: item.href } : { href: item.href };

  return (
    <header className="sticky top-0 z-30 border-b border-foreground/10 bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link
          href={brandHref}
          className="text-sm font-semibold tracking-tight hover:underline-offset-2 hover:underline"
          onClick={() => setOpen(false)}
        >
          {brandLabel}
        </Link>

        <nav className="hidden items-center gap-5 sm:flex">
          {nav.map((item) => (
            <Link
              key={item.href + item.label}
              {...linkProps(item)}
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
            {nav.map((item) => (
              <li key={item.href + item.label}>
                <Link
                  {...linkProps(item)}
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
