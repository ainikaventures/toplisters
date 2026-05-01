import Link from "next/link";

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

  return (
    <nav className="flex items-center justify-between gap-4 border-t border-foreground/10 pt-6">
      <PaginationLink href={prev} label="← Previous" disabled={!prev} />
      <span className="text-sm text-foreground/60">
        Page <strong className="text-foreground">{page}</strong> of {totalPages}
      </span>
      <PaginationLink href={next} label="Next →" disabled={!next} />
    </nav>
  );
}

function PaginationLink({
  href,
  label,
  disabled,
}: {
  href: string | null;
  label: string;
  disabled: boolean;
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
      className="rounded-md border border-foreground/15 px-3 py-2 text-sm font-medium hover:border-foreground/40"
    >
      {label}
    </Link>
  );
}
