import Link from "next/link";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

/**
 * Shared chrome for /jobs/* (browse) and /job/* (detail) routes — sticky
 * thin top bar with brand + nav + theme toggle. Globe (/) opts out via its
 * own full-bleed layout.
 */
export function SiteHeader() {
  return (
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
  );
}
