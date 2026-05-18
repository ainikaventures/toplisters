/**
 * Per-page openGraph helper. Next.js shallow-merges `openGraph` between
 * layout and page metadata — when a page sets its own `openGraph: {…}`,
 * the layout's `images` (and `type`, `siteName`, `locale`) are dropped
 * unless the page repeats them. This helper folds in the layout-level
 * defaults so each page only has to supply page-specific bits.
 *
 * Returns an object that goes directly under `metadata.openGraph`.
 */
import type { Metadata } from "next";

export const DEFAULT_OG_IMAGE = "/opengraph-image" as const;

type OG = NonNullable<Metadata["openGraph"]>;

export function pageOpenGraph(input: {
  title?: string;
  description?: string;
  url: string;
}): OG {
  return {
    title: input.title,
    description: input.description,
    url: input.url,
    type: "website",
    siteName: "Toplisters",
    locale: "en_US",
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630 }],
  };
}
