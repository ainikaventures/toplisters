import Link from "next/link";

/**
 * Listing pagination — TL-091.
 *
 * Previously this emitted only Prev/Next and a "Page X of N" label, so the
 * only crawlable jump was ±1 page: Googlebot had to walk thousands of
 * sequential links to reach deep pages, and most never got crawled. Now we
 * render a windowed run of numbered <a href> links (first … current±2 …
 * last) so any page is reachable in a couple of hops, and tag the
 * Prev/Next anchors rel="prev"/"next" as a sequence hint.
 */
export function Pagination({
  page,
  totalPages,
  searchParams,
}: {
  page: number;
  totalPages: number;
  searchParams: Record<string, string>;
}) {
  if (totalPages <= 1) return null;

  const buildHref = (p: number) => {
    const params = new URLSearchParams(searchParams);
    if (p <= 1) params.delete("page");
    else params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/jobs?${qs}` : "/jobs";
  };

  const prev = page > 1 ? buildHref(page - 1) : null;
  const next = page < totalPages ? buildHref(page + 1) : null;
  const pages = windowedPages(page, totalPages);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-4 border-t border-foreground/10 pt-6"
    >
      <PaginationLink href={prev} label="← Previous" disabled={!prev} rel="prev" />

      <ol className="flex flex-wrap items-center gap-1.5">
        {pages.map((p, i) =>
          p === "…" ? (
            <li
              key={`gap-${i}`}
              aria-hidden="true"
              className="px-1 text-sm text-foreground/40"
            >
              …
            </li>
          ) : (
            <li key={p}>
              <PageNumber
                href={buildHref(p)}
                page={p}
                current={p === page}
              />
            </li>
          ),
        )}
      </ol>

      <PaginationLink href={next} label="Next →" disabled={!next} rel="next" />
    </nav>
  );
}

/**
 * First page, last page, and the current page ±2, with "…" sentinels
 * where the run skips. e.g. page 7 of 20 → [1, …, 5, 6, 7, 8, 9, …, 20].
 */
function windowedPages(page: number, totalPages: number): (number | "…")[] {
  const span = 2;
  const set = new Set<number>([1, totalPages]);
  for (let p = page - span; p <= page + span; p++) {
    if (p >= 1 && p <= totalPages) set.add(p);
  }

  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

function PageNumber({
  href,
  page,
  current,
}: {
  href: string;
  page: number;
  current: boolean;
}) {
  if (current) {
    return (
      <span
        aria-current="page"
        className="inline-flex min-w-9 items-center justify-center rounded-md border border-foreground/40 px-2.5 py-1.5 text-sm font-semibold text-foreground"
      >
        {page}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={`Page ${page}`}
      className="inline-flex min-w-9 items-center justify-center rounded-md border border-foreground/15 px-2.5 py-1.5 text-sm text-foreground/70 hover:border-foreground/40 hover:text-foreground"
    >
      {page}
    </Link>
  );
}

function PaginationLink({
  href,
  label,
  disabled,
  rel,
}: {
  href: string | null;
  label: string;
  disabled: boolean;
  rel?: "prev" | "next";
}) {
  if (disabled || !href) {
    return (
      <span className="rounded-md border border-foreground/10 px-3 py-2 text-sm text-foreground/30">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      rel={rel}
      className="rounded-md border border-foreground/15 px-3 py-2 text-sm font-medium hover:border-foreground/40"
    >
      {label}
    </Link>
  );
}
