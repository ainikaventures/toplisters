import { countryName } from "@/lib/format";
import { BrandMark, flagEmoji, LogoTile, OG_COLORS, OG_FONT_FAMILY, truncate } from "./brand";

/**
 * Pure share-card layouts (no data access) — the opengraph-image routes load
 * data and render these. Kept separate so the cards can be previewed with
 * sample data outside Next.
 *
 * @vercel/og's CSS subset is strict — only flex/block/none/-webkit-box for
 * `display`, no inline-block; every element with children needs display:flex.
 */

const frame = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column" as const,
  justifyContent: "space-between",
  background: OG_COLORS.bg,
  color: OG_COLORS.fg,
  padding: 72,
  fontFamily: OG_FONT_FAMILY,
};

// A drawn dot, not "·": Space Grotesk's middle dot has lopsided side
// bearings, so it hugs the following item.
function Dot() {
  return (
    <span
      style={{ display: "flex", alignSelf: "center", width: 6, height: 6, borderRadius: 3, background: OG_COLORS.fg, opacity: 0.4 }}
    />
  );
}

export function JobCard(props: {
  title: string;
  companyName: string;
  logo: string | null;
  countryCode: string | null;
  location: string;
  salary: string | null;
  workMode: string | null;
}) {
  const flag = flagEmoji(props.countryCode);
  return (
    <div style={frame}>
      <BrandMark />

      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        <LogoTile src={props.logo} name={props.companyName} size={168} />
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 840 }}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.06, letterSpacing: "-0.025em" }}>
            {truncate(props.title, 80)}
          </div>
          <div style={{ display: "flex", fontSize: 36, fontWeight: 500, opacity: 0.8 }}>
            {truncate(props.companyName, 50)}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 28, fontSize: 26, opacity: 0.72 }}>
        <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {flag ? <span style={{ display: "flex" }}>{flag}</span> : null}
          <span style={{ display: "flex" }}>{props.location}</span>
        </span>
        {/* Flat children, not fragments: Satori doesn't apply `gap` inside a fragment. */}
        {props.salary ? <Dot key="d1" /> : null}
        {props.salary ? (
          <span key="salary" style={{ display: "flex" }}>
            {props.salary}
          </span>
        ) : null}
        {props.workMode ? <Dot key="d2" /> : null}
        {props.workMode ? (
          <span
            key="mode"
            style={{
              display: "flex",
              padding: "4px 14px",
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: 999,
              fontSize: 22,
            }}
          >
            {props.workMode}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function CountryCard(props: { iso: string | null; name: string; path: string; stat: string }) {
  return (
    <div style={frame}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <BrandMark />
        <div style={{ display: "flex", fontSize: 24, color: OG_COLORS.muted }}>toplisters.xyz{props.path}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
        {props.iso ? <div style={{ display: "flex", fontSize: 180, lineHeight: 1 }}>{flagEmoji(props.iso)}</div> : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", fontSize: 92, fontWeight: 700, lineHeight: 1.02, letterSpacing: "-0.035em" }}>
            Jobs in {props.name}
          </div>
          <div style={{ display: "flex", fontSize: 52, fontWeight: 700, color: OG_COLORS.accent }}>{props.stat}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 28, fontSize: 24, color: OG_COLORS.muted, alignItems: "center" }}>
        <span style={{ display: "flex" }}>Direct from employers</span>
        <Dot />
        <span style={{ display: "flex" }}>Updated daily</span>
        <Dot />
        <span style={{ display: "flex" }}>Free to apply</span>
      </div>
    </div>
  );
}

export function CompanyCard(props: { name: string; logo: string | null; stat: string; countryCodes: string[] }) {
  return (
    <div style={frame}>
      <BrandMark />

      <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
        <LogoTile src={props.logo} name={props.name} size={200} />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{ display: "flex", fontSize: 84, fontWeight: 700, lineHeight: 1.04, letterSpacing: "-0.03em", maxWidth: 780 }}
          >
            {truncate(props.name, 40)}
          </div>
          <div style={{ display: "flex", fontSize: 48, fontWeight: 700, color: OG_COLORS.accent }}>{props.stat}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 28, fontSize: 26, color: OG_COLORS.muted, alignItems: "center" }}>
        {props.countryCodes.length ? (
          props.countryCodes.slice(0, 4).map((cc) => (
            <span key={cc} style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ display: "flex" }}>{flagEmoji(cc)}</span>
              <span style={{ display: "flex" }}>{countryName(cc)}</span>
            </span>
          ))
        ) : (
          <span style={{ display: "flex" }}>Apply directly on Toplisters</span>
        )}
      </div>
    </div>
  );
}

export function GoneCard() {
  return (
    <div style={{ ...frame, alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: 56, fontWeight: 700, opacity: 0.9, display: "flex" }}>Job no longer available</div>
      <div style={{ fontSize: 28, opacity: 0.5, marginTop: 16, display: "flex" }}>toplisters.xyz</div>
    </div>
  );
}
