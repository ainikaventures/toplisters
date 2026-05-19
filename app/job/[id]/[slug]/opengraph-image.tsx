import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { locationLabel, salaryLabel } from "@/lib/format";

/**
 * Per-job OG image (TL-060). Generated at request time and cached at the
 * edge — important not to pre-render: the job catalogue is 95k+ rows.
 *
 * Layout: brand chip top-left, large title + company in the middle,
 * location · salary · work-mode pill at the bottom. Matches the radial
 * gradient + sky-blue→orange accent palette from the site-wide OG image
 * so previews feel branded.
 *
 * @vercel/og's CSS subset is strict — only flex/block/none/-webkit-box
 * for `display`, no inline-block. Keep that in mind when editing.
 */

export const dynamic = "force-dynamic";
export const alt = "Job opening — Toplisters";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function truncate(s: string, n: number): string {
  const trimmed = s.trim();
  return trimmed.length > n ? trimmed.slice(0, n).trim() + "…" : trimmed;
}

export default async function JobOgImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await prisma.job.findUnique({
    where: { id },
    select: {
      title: true,
      companyName: true,
      city: true,
      countryCode: true,
      workMode: true,
      salaryMin: true,
      salaryMax: true,
      salaryCurrency: true,
      salaryPeriod: true,
    },
  });

  // Fallback: render a generic card when the job's been removed. Avoids
  // a 404 from the crawler, which some platforms display as a broken
  // preview rather than falling back to the site OG.
  if (!job) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#0E1116",
            color: "#F6F4EE",
            fontFamily: "sans-serif",
          }}
        >
          <div style={{ fontSize: 56, fontWeight: 700, opacity: 0.9, display: "flex" }}>
            Job no longer available
          </div>
          <div style={{ fontSize: 28, opacity: 0.5, marginTop: 16, display: "flex" }}>
            toplisters.xyz
          </div>
        </div>
      ),
      size,
    );
  }

  const location = locationLabel({
    city: job.city,
    countryCode: job.countryCode,
  });
  const salary = salaryLabel(job);
  const workMode = job.workMode !== "unknown" ? job.workMode : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0E1116",
          color: "#F6F4EE",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        {/* Brand mark + wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "flex-start",
              gap: 5,
              width: 66,
              height: 66,
              borderRadius: 14,
              border: "1.5px solid rgba(246,244,238,0.18)",
              padding: 14,
            }}
          >
            <span style={{ display: "flex", width: 38, height: 8, borderRadius: 2, background: "#1F6FEB" }} />
            <span style={{ display: "flex", width: 26, height: 8, borderRadius: 2, background: "rgba(246,244,238,0.85)" }} />
            <span style={{ display: "flex", width: 18, height: 8, borderRadius: 2, background: "rgba(246,244,238,0.55)" }} />
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            toplisters
            <span style={{ display: "flex", color: "#1F6FEB" }}>.</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 1.06,
              letterSpacing: "-0.025em",
              maxWidth: 1056,
              display: "flex",
            }}
          >
            {truncate(job.title, 110)}
          </div>
          <div
            style={{
              fontSize: 38,
              opacity: 0.8,
              fontWeight: 500,
              letterSpacing: "-0.005em",
              display: "flex",
            }}
          >
            {truncate(job.companyName, 60)}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 28,
            fontSize: 26,
            opacity: 0.72,
          }}
        >
          <span style={{ display: "flex" }}>{location}</span>
          {salary ? (
            <>
              <span style={{ display: "flex", opacity: 0.4 }}>·</span>
              <span style={{ display: "flex" }}>{salary}</span>
            </>
          ) : null}
          {workMode ? (
            <>
              <span style={{ display: "flex", opacity: 0.4 }}>·</span>
              <span
                style={{
                  display: "flex",
                  textTransform: "capitalize",
                  padding: "4px 14px",
                  border: "1px solid rgba(255,255,255,0.25)",
                  borderRadius: 999,
                  fontSize: 22,
                }}
              >
                {workMode}
              </span>
            </>
          ) : null}
        </div>
      </div>
    ),
    size,
  );
}
