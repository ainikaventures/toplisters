import sharp from "sharp";
import { loadLogoBytes } from "@/lib/logos/store";

/**
 * Shared brand kit for the dynamic OG/share cards (job, country, company).
 * Same palette + three-bar mark as app/opengraph-image.tsx, plus the site's
 * Space Grotesk face so cards read as Toplisters, not a generic template.
 *
 * Everything here degrades instead of throwing — a share card must render
 * even when Google Fonts or a company's logo host is down.
 */

export const OG_SIZE = { width: 1200, height: 630 };

export const OG_COLORS = {
  bg: "#0E1116",
  fg: "#F6F4EE",
  accent: "#1F6FEB",
  muted: "rgba(246,244,238,0.6)",
  hairline: "rgba(246,244,238,0.18)",
};

type OgFont = { name: string; data: ArrayBuffer; weight: 500 | 700; style: "normal" };

let fontsPromise: Promise<OgFont[]> | null = null;

/**
 * Space Grotesk 500/700 as TTF (Satori can't read woff2; Google serves TTF
 * when no browser UA is sent). Cached per process. On failure returns [] so
 * ImageResponse falls back to its bundled sans.
 */
export function loadBrandFonts(): Promise<OgFont[]> {
  fontsPromise ??= (async () => {
    try {
      const css = await fetchText(
        "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700",
      );
      const faces = [...css.matchAll(/font-weight:\s*(\d+);[^}]*?src:\s*url\(([^)]+)\)/g)];
      const fonts = await Promise.all(
        faces.map(async ([, weight, url]) => ({
          name: "Space Grotesk",
          data: await fetchBuffer(url),
          weight: Number(weight) as 500 | 700,
          style: "normal" as const,
        })),
      );
      return fonts;
    } catch {
      fontsPromise = null; // retry on the next render
      return [];
    }
  })();
  return fontsPromise;
}

/** ImageResponse options shared by every card: size, brand font, emoji flags. */
export async function ogOptions() {
  return { ...OG_SIZE, fonts: await loadBrandFonts(), emoji: "twemoji" as const };
}

export const OG_FONT_FAMILY = '"Space Grotesk", sans-serif';

export { flagEmoji } from "./flag";

/**
 * Fetch a company logo and normalise it to a PNG data URI Satori can embed
 * (logo hosts serve webp/svg/ico, which Satori can't all decode). null on
 * any failure → caller shows the initials tile instead.
 */
export async function logoDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    // Self-hosted logos come straight from the store — never a server-side
    // fetch of Logo.dev's CDN (not fair use; see lib/logos/store.ts).
    const input = await loadLogoBytes(url);
    if (!input) return null;
    const png = await sharp(input)
      .resize(256, 256, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .flatten({ background: "#ffffff" })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

export function truncate(s: string, n: number): string {
  const trimmed = s.trim();
  return trimmed.length > n ? trimmed.slice(0, n).trim() + "…" : trimmed;
}

/** Three-bar list icon + "toplisters." wordmark. */
export function BrandMark({ scale = 1 }: { scale?: number }) {
  const s = (n: number) => Math.round(n * scale);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: s(18) }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          gap: s(5),
          width: s(66),
          height: s(66),
          borderRadius: s(14),
          border: `1.5px solid ${OG_COLORS.hairline}`,
          padding: s(14),
        }}
      >
        <span style={{ display: "flex", width: s(38), height: s(8), borderRadius: 2, background: OG_COLORS.accent }} />
        <span style={{ display: "flex", width: s(26), height: s(8), borderRadius: 2, background: "rgba(246,244,238,0.85)" }} />
        <span style={{ display: "flex", width: s(18), height: s(8), borderRadius: 2, background: "rgba(246,244,238,0.55)" }} />
      </div>
      <div style={{ display: "flex", fontSize: s(30), fontWeight: 700, letterSpacing: "-0.02em" }}>
        toplisters
        <span style={{ display: "flex", color: OG_COLORS.accent }}>.</span>
      </div>
    </div>
  );
}

/** Company logo on a white rounded tile, or an initials tile as fallback. */
export function LogoTile({ src, name, size }: { src: string | null; name: string; size: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.2),
        background: src ? "#ffffff" : OG_COLORS.accent,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} width={Math.round(size * 0.8)} height={Math.round(size * 0.8)} alt="" />
      ) : (
        <span style={{ display: "flex", fontSize: Math.round(size * 0.38), fontWeight: 700, color: OG_COLORS.fg }}>
          {initials(name)}
        </span>
      )}
    </div>
  );
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function fetchBuffer(url: string, timeoutMs = 6000): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.arrayBuffer();
}
