import { ImageResponse } from "next/og";

/**
 * 180×180 PNG apple-touch-icon. Next.js' file convention requires a
 * raster format here (.jpg/.jpeg/.png/.webp) — SVG isn't auto-handled.
 * We render the brand mark via ImageResponse so the same source-of-
 * truth in brand/assets/logo-mark.svg drives every surface; updating
 * the brand mark only needs the inline tile geometry tweaked below.
 *
 * Reminder: @vercel/og only allows display: flex | block | none |
 * -webkit-box.
 */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          gap: 16,
          background: "#0E1116",
          padding: 36,
          borderRadius: 40, // iOS masks to rounded square anyway; this
                            //  is mainly for non-iOS clients that use the file as-is.
        }}
      >
        <span style={{ display: "flex", width: 108, height: 22, borderRadius: 6, background: "#1F6FEB" }} />
        <span style={{ display: "flex", width: 76, height: 22, borderRadius: 6, background: "rgba(246,244,238,0.85)" }} />
        <span style={{ display: "flex", width: 54, height: 22, borderRadius: 6, background: "rgba(246,244,238,0.55)" }} />
      </div>
    ),
    size,
  );
}
