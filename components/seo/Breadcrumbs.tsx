import Link from "next/link";

/**
 * Visible breadcrumb trail. Pair with `<BreadcrumbJsonLd>` from
 * components/schema/ — same items list, two emissions: the structured
 * data for crawlers, this for humans. Renders nothing for trails of
 * length ≤1 (a lone "Home" crumb adds no value).
 *
 * The final crumb is rendered as plain text (current page) — link-less
 * per the IAB / WCAG breadcrumb pattern.
 */
export interface BreadcrumbItem {
  name: string;
  href: string;
}

export function Breadcrumbs({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  if (items.length < 2) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={
        "flex flex-wrap items-center gap-1.5 text-xs text-foreground/60 " +
        (className ?? "")
      }
    >
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${item.href}-${i}`} className="flex items-center gap-1.5">
              {isLast ? (
                <span aria-current="page" className="text-foreground">
                  {item.name}
                </span>
              ) : (
                <Link href={item.href} className="hover:text-foreground">
                  {item.name}
                </Link>
              )}
              {isLast ? null : <span aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
