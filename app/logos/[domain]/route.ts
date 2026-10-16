import { getLogo, normalizeLogoDomain } from "@/lib/logos/store";

/**
 * GET /logos/<domain> — self-hosted company logo (lib/logos/store.ts).
 * First request downloads it once via the Logo.dev API; afterwards it's
 * served from Postgres, cached hard by browsers + Cloudflare.
 *
 * Never 404s for a valid domain: <img> tags across the site have no error
 * fallback, so a miss returns a neutral monogram (short cache, so the real
 * logo shows up once Logo.dev has it).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const domain = normalizeLogoDomain((await params).domain);
  if (!domain) return new Response("Not found", { status: 404 });

  const logo = await getLogo(domain);
  if (logo) {
    return new Response(new Uint8Array(logo.bytes), {
      headers: {
        "Content-Type": logo.contentType,
        "Cache-Control": "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400",
      },
    });
  }

  return new Response(monogramSvg(domain), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}

function monogramSvg(domain: string): string {
  const label = domain.split(".")[0].replace(/[^a-z0-9]/g, "").slice(0, 2).toUpperCase() || "?";
  let h = 0;
  for (const c of domain) h = (h * 31 + c.charCodeAt(0)) | 0;
  const hue = Math.abs(h) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="hsl(${hue} 55% 38%)"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="sans-serif" font-size="104" font-weight="700" fill="hsl(${hue} 35% 96%)">${label}</text></svg>`;
}
