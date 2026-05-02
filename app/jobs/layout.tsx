import Link from "next/link";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

/**
 * Shared chrome for every /jobs/* route: thin top bar with the brand mark,
 * a quick "Globe" link back home, and the theme toggle. Sits above the
 * existing per-page content. The globe page (/) opts out — it has its own
 * full-bleed layout.
 */
export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-foreground/10 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-5">
            <Link
              href="/"
              className="text-sm font-semibold tracking-tight hover:underline-offset-2 hover:underline"
            >
              Toplisters
            </Link>
            <Link
              href="/"
              className="text-xs text-foreground/60 hover:text-foreground"
            >
              Globe
            </Link>
            <Link
              href="/jobs"
              className="text-xs text-foreground/60 hover:text-foreground"
            >
              Browse
            </Link>
          </div>
          <ThemeToggle />
        </div>
      </header>
      {children}
    </div>
  );
}
