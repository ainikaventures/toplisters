// Server-only — uses node:fs and sharp's libvips bindings.
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { Vibrant } from "node-vibrant/node";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://toplisters.xyz";

// Banner dimensions per the user's listing-vs-detail brief: 1000 × 350 max.
// Logo target height leaves comfortable padding at top + bottom.
const WIDTH = 1000;
const HEIGHT = 350;
const LOGO_HEIGHT = 220;
const JPEG_QUALITY = 85;

const BANNER_DIR = path.join(process.cwd(), "public", "banners");

/**
 * Stable hash for the banner filename. Keyed on the company name (lower-
 * cased + trimmed) so multiple jobs from the same company share one
 * banner — generation runs at most once per brand.
 */
function bannerHash(companyName: string): string {
  return createHash("sha1")
    .update(companyName.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);
}

export function bannerPath(companyName: string): {
  fsPath: string;
  publicPath: string;
} {
  const hash = bannerHash(companyName);
  return {
    fsPath: path.join(BANNER_DIR, `${hash}.jpg`),
    publicPath: `/banners/${hash}.jpg`,
  };
}

export async function bannerExists(companyName: string): Promise<boolean> {
  try {
    await fs.access(bannerPath(companyName).fsPath);
    return true;
  } catch {
    return false;
  }
}

interface Palette {
  background: string;
  /** True if the chosen background is dark — caller may want to invert text. */
  isDark: boolean;
}

function pickPalette(
  palette: Awaited<ReturnType<ReturnType<typeof Vibrant.from>["getPalette"]>>,
): Palette {
  // Preference order: LightMuted → LightVibrant → Vibrant → Muted → fallback.
  // Light variants give the logo a softer, more brand-friendly canvas;
  // Vibrant comes through when nothing lighter exists (typical for brands
  // with already-pale logos).
  const candidates = [
    palette.LightMuted,
    palette.LightVibrant,
    palette.Vibrant,
    palette.Muted,
    palette.DarkMuted,
  ];
  for (const swatch of candidates) {
    if (swatch?.hex) {
      return {
        background: swatch.hex,
        isDark:
          swatch === palette.DarkMuted || swatch === palette.DarkVibrant,
      };
    }
  }
  return { background: "#f3f4f6", isDark: false };
}

/**
 * Fetch the logo and produce a 1000×350 JPG with the brand's dominant
 * colour as the background and the logo centred. Idempotent: returns the
 * cached publicPath when the file already exists. Returns null on any
 * fetch / decode / write failure so callers can fall back to the gradient
 * placeholder cleanly.
 *
 * Logo.dev's publishable-key endpoint (img.logo.dev) is referrer-locked,
 * so we set a Referer header matching our site origin — without it, the
 * server-side fetch comes back as 401 even when the browser would succeed.
 */
export async function generateBanner(
  companyName: string,
  logoUrl: string,
): Promise<string | null> {
  const { fsPath, publicPath } = bannerPath(companyName);

  // Cache hit — short-circuit.
  try {
    await fs.access(fsPath);
    return publicPath;
  } catch {
    /* generate below */
  }

  let response: Response;
  try {
    response = await fetch(logoUrl, {
      headers: { Referer: SITE_URL, "User-Agent": "Toplisters/1.0 (banner-gen)" },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  let logoBuffer: Buffer;
  try {
    logoBuffer = Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }

  // Normalise to PNG up-front. sharp transparently rasterises SVG and
  // converts WebP/AVIF, which node-vibrant otherwise can't read.
  let logoPng: Buffer;
  try {
    logoPng = await sharp(logoBuffer)
      .png()
      .toBuffer();
  } catch {
    return null;
  }

  let palette: Palette;
  try {
    const swatches = await Vibrant.from(logoPng).getPalette();
    palette = pickPalette(swatches);
  } catch {
    palette = { background: "#f3f4f6", isDark: false };
  }

  let logoFitted: Buffer;
  try {
    logoFitted = await sharp(logoPng)
      .resize({
        height: LOGO_HEIGHT,
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  } catch {
    return null;
  }

  let banner: Buffer;
  try {
    banner = await sharp({
      create: {
        width: WIDTH,
        height: HEIGHT,
        channels: 3,
        background: palette.background,
      },
    })
      .composite([{ input: logoFitted, gravity: "center" }])
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
  } catch {
    return null;
  }

  try {
    await fs.mkdir(BANNER_DIR, { recursive: true });
    await fs.writeFile(fsPath, banner);
  } catch {
    return null;
  }

  return publicPath;
}
