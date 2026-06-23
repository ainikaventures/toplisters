import { ImageResponse } from "next/og";

/**
 * OG image for the sports vertical (sports.toplisters.xyz / *.toplisters.xyz/sports).
 * Mirrors the jobs image (app/opengraph-image.tsx) for brand consistency but
 * swaps the copy + accent to green so sports links don't unfurl as the jobs
 * board. 1200×630, no DB/network — statically cached, purged on redeploy.
 */

export const alt = "Toplisters Sports — win-path predictions";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#22C55E";

export default function SportsOpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0B1410",
          color: "#F6F4EE",
          padding: 80,
          fontFamily: "sans-serif",
        }}
      >
        {/* Brand mark — three-bar list icon, green-led for the sports vertical */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "flex-start",
              gap: 6,
              width: 88,
              height: 88,
              borderRadius: 20,
              background: "#0B1410",
              border: "1.5px solid rgba(246,244,238,0.18)",
              padding: 18,
            }}
          >
            <span style={{ display: "flex", width: 52, height: 10, borderRadius: 3, background: ACCENT }} />
            <span style={{ display: "flex", width: 36, height: 10, borderRadius: 3, background: "rgba(246,244,238,0.85)" }} />
            <span style={{ display: "flex", width: 26, height: 10, borderRadius: 3, background: "rgba(246,244,238,0.55)" }} />
          </div>
          <div style={{ display: "flex", fontSize: 38, fontWeight: 700, letterSpacing: "-0.025em" }}>
            toplisters
            <span style={{ display: "flex", color: ACCENT }}>.</span>
            <span style={{ display: "flex", marginLeft: 16, opacity: 0.55, fontWeight: 600 }}>sports</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 108, fontWeight: 700, lineHeight: 1.02, letterSpacing: "-0.035em", display: "flex" }}>
            Championships,
          </div>
          <div
            style={{
              fontSize: 108,
              fontWeight: 700,
              lineHeight: 1.02,
              letterSpacing: "-0.035em",
              color: ACCENT,
              display: "flex",
            }}
          >
            mapped to the finish.
          </div>
          <div style={{ fontSize: 32, opacity: 0.7, marginTop: 28, lineHeight: 1.35, maxWidth: 920, display: "flex" }}>
            Win-path predictions for F1 &amp; the World Cup 2026 — live odds, projected brackets,
            and an AI roadmap to the title.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 32,
            fontSize: 22,
            opacity: 0.75,
            letterSpacing: "0.01em",
            alignItems: "center",
          }}
        >
          <span style={{ display: "flex" }}>Formula 1</span>
          <span style={{ display: "flex", opacity: 0.4 }}>·</span>
          <span style={{ display: "flex" }}>World Cup 2026</span>
          <span style={{ display: "flex", opacity: 0.4 }}>·</span>
          <span style={{ display: "flex" }}>AI roadmap</span>
        </div>
      </div>
    ),
    size,
  );
}
