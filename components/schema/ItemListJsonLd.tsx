/**
 * ItemList JSON-LD. Helps Google understand a listing page as an
 * ordered collection of entities. Each item carries position + url;
 * we deliberately omit the wrapped JobPosting (that's repeated on
 * each detail page) so the list payload stays small.
 */
export interface ListItemRef {
  position: number;
  url: string;
  /** Optional display name; omitted from the markup if not set. */
  name?: string;
}

export function ItemListJsonLd({ items }: { items: ListItemRef[] }) {
  if (items.length === 0) return null;

  const json = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: items.length,
    itemListElement: items.map((it) => ({
      "@type": "ListItem",
      position: it.position,
      url: it.url,
      ...(it.name ? { name: it.name } : {}),
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
