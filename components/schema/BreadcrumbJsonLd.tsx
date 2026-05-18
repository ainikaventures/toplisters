/**
 * BreadcrumbList JSON-LD. Pass an ordered array of {name, url} starting
 * at "Home" through to the current page. Google uses this to render a
 * breadcrumb trail in SERPs in place of the raw URL.
 *
 * Visible HTML breadcrumbs are a separate concern; this component only
 * emits the schema markup.
 */
export interface Crumb {
  name: string;
  url: string;
}

export function BreadcrumbJsonLd({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;

  const json = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}
