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
            background:
              "radial-gradient(circle at 50% 50%, #1e293b 0%, #050714 100%)",
            color: "white",
            fontFamily: "sans-serif",
          }}
        >
          <div style={{ fontSize: 56, fontWeight: 700, opacity: 0.9 }}>
            Job no longer available
          </div>
          <div style={{ fontSize: 28, opacity: 0.5, marginTop: 16 }}>
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
          background:
            "radial-gradient(circle at 30% 20%, #1e293b 0%, #0a0e1a 60%, #050714 100%)",
          color: "white",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 26,
            letterSpacing: "0.02em",
            opacity: 0.65,
          }}
        >
          <span
            style={{
              display: "flex",
              width: 12,
              height: 12,
              borderRadius: 999,
              background: "linear-gradient(135deg, #38bdf8, #fb923c)",
            }}
          />
          <span>toplisters.xyz</span>
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
