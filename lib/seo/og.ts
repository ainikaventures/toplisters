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
// Sports vertical has its own card (app/sports/opengraph-image.tsx) so links
// don't unfurl as the jobs board. Absolutised against the apex metadataBase.
export const SPORTS_OG_IMAGE = "/sports/opengraph-image" as const;

type OG = NonNullable<Metadata["openGraph"]>;

export function pageOpenGraph(input: {
  title?: string;
  description?: string;
  url: string;
  /** Override the social image (defaults to the jobs board card). */
  image?: string;
}): OG {
  return {
    title: input.title,
    description: input.description,
    url: input.url,
    type: "website",
    siteName: "Toplisters",
    locale: "en_US",
    images: [{ url: input.image ?? DEFAULT_OG_IMAGE, width: 1200, height: 630 }],
  };
}

/**
 * Full social metadata (openGraph + twitter) for a sports page. The layout
 * sets twitter.images to the jobs card, so sports pages must override BOTH —
 * a page that only sets openGraph still unfurls the jobs board on Twitter/X.
 */
export function sportsSocial(input: {
  title?: string;
  description?: string;
  url: string;
}): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: pageOpenGraph({ ...input, image: SPORTS_OG_IMAGE }),
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      images: [SPORTS_OG_IMAGE],
    },
  };
}
