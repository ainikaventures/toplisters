/**
 * TopListers logo. Three variants per brand guidelines:
 *   - "mark"       — the rounded-square icon only (square footprint)
 *   - "horizontal" — mark + "toplisters." wordmark side-by-side
 *   - "wordmark"   — type only, no icon
 *
 * SVG source is in /public/ so the same files can be referenced by
 * other systems (favicons, OG images, third-party embeds). Inline SVG
 * would let us tint via currentColor, but the brand uses fixed colors
 * (#0E1116 / #1F6FEB / #F6F4EE) — keeping it as an <img> tag avoids
 * accidental colour drift.
 */
import Image from "next/image";

type Variant = "mark" | "horizontal" | "wordmark";

interface LogoProps {
  variant?: Variant;
  /** Force the light-on-dark version (mark/horizontal only). */
  onDark?: boolean;
  /** Rendered height in pixels. Width is computed from the variant aspect. */
  height?: number;
  className?: string;
  /** Accessible alt text. Empty string for decorative use. */
  alt?: string;
  priority?: boolean;
}

const SOURCES: Record<
  Variant,
  { light: string; dark: string; aspectRatio: number }
> = {
  mark: {
    light: "/logo-mark.svg",
    dark: "/logo-mark-mono-white.svg",
    aspectRatio: 1, // 68×68
  },
  horizontal: {
    light: "/logo-horizontal.svg",
    dark: "/logo-horizontal-light.svg",
    aspectRatio: 520 / 120, // ≈ 4.33
  },
  wordmark: {
    // Same file in both modes — wordmark SVG only sets fill on the
    // period (blue). Text colour inherits from CSS currentColor when
    // we eventually inline it; for now /wordmark.svg paints ink on
    // transparent which reads on the paper background. On dark we
    // tint via CSS filter for the rare wordmark-only use case.
    light: "/wordmark.svg",
    dark: "/wordmark.svg",
    aspectRatio: 440 / 80, // ≈ 5.5
  },
};

export function Logo({
  variant = "horizontal",
  onDark = false,
  height = 32,
  className,
  alt = "Toplisters",
  priority,
}: LogoProps) {
  const source = SOURCES[variant];
  const src = onDark ? source.dark : source.light;
  const width = Math.round(height * source.aspectRatio);

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      className={className}
      // SVGs are vector; we never need Next.js's bitmap optimiser.
      unoptimized
    />
  );
}
