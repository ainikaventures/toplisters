"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Chart forms specific to the pipeline / market dashboards.
 *
 * Shares the themed axis, grid and tooltip defaults with Charts.tsx. Series
 * colours come from the validated --chart-cat-* tokens in globals.css (see
 * the comment there before changing any of them) rather than the brand
 * accent trio, which fails CVD separation and contrast as a series set.
 */

const AXIS_PROPS = {
  tick: { fill: "currentColor", fontSize: 11 },
  tickLine: false,
  axisLine: false,
  stroke: "currentColor",
} as const;

const TOOLTIP_PROPS = {
  contentStyle: {
    backgroundColor: "var(--popover)",
    border: "1px solid color-mix(in oklab, currentColor 12%, transparent)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--popover-foreground)",
  },
  cursor: { fill: "color-mix(in oklab, currentColor 6%, transparent)" },
} as const;

const GRID_PROPS = {
  strokeDasharray: "3 3",
  stroke: "color-mix(in oklab, currentColor 10%, transparent)",
  vertical: false,
} as const;

const money = (n: number) => `£${Math.round(n / 1000)}k`;

/**
 * Salary range chart: the p25–p75 band with the median marked.
 *
 * A single bar of "average salary" hides the spread that actually matters
 * when comparing roles, so this plots the interquartile range as a floating
 * bar. Recharts draws that as a transparent p25 offset stacked under the
 * visible band.
 */
export function SalaryRangeChart({
  data,
  height = 360,
}: {
  data: { label: string; count: number; p25: number; p50: number; p75: number }[];
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <p className="py-12 text-center text-xs text-foreground/55">
        Not enough salaried listings to compute a distribution.
      </p>
    );
  }

  const rows = data.map((d) => ({
    ...d,
    offset: d.p25,
    band: Math.max(d.p75 - d.p25, 1),
  }));

  return (
    <div className="text-foreground/80" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 56, left: 0, bottom: 4 }}
          barCategoryGap={6}
        >
          <CartesianGrid {...GRID_PROPS} />
          <XAxis
            type="number"
            tickFormatter={money}
            // Anchored at 0: a salary axis that starts negative is nonsense,
            // and starting at dataMin would exaggerate the gaps between bands.
            domain={[0, "dataMax + 5000"]}
            {...AXIS_PROPS}
          />
          <YAxis type="category" dataKey="label" width={150} {...AXIS_PROPS} />
          <Tooltip
            {...TOOLTIP_PROPS}
            formatter={(_v, _n, item) => {
              const p = item.payload as (typeof rows)[number];
              return [
                `${money(p.p25)} – ${money(p.p75)} · median ${money(p.p50)} (n=${p.count.toLocaleString()})`,
                "Range",
              ];
            }}
          />
          {/* Invisible spacer to the p25 point. */}
          <Bar dataKey="offset" stackId="range" fill="transparent" />
          <Bar
            dataKey="band"
            stackId="range"
            fill="var(--chart-cat-1)"
            radius={4}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const COLLAR_SERIES = [
  { key: "white", label: "White collar", color: "var(--chart-cat-1)" },
  { key: "blue", label: "Blue collar", color: "var(--chart-cat-2)" },
  { key: "grey", label: "Grey collar", color: "var(--chart-cat-3)" },
  { key: "unknown", label: "Unclassified", color: "var(--chart-cat-muted)" },
] as const;

/**
 * Collar mix per country, as a 100%-stacked bar.
 *
 * Absolute counts would just restate "which country has most jobs", so the
 * shares are what's plotted. "Unclassified" is kept in the denominator and
 * drawn in neutral — dropping it would silently overstate how much of the
 * dataset is actually classified.
 *
 * Carries a legend and direct percentage labels: the light-mode steps sit
 * below 3:1 against the surface, which obligates non-colour identification.
 */
export function CollarMixChart({
  data,
  height = 380,
}: {
  /** `label` is resolved server-side — a function can't cross the boundary. */
  data: {
    label: string;
    white: number;
    blue: number;
    grey: number;
    unknown: number;
  }[];
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <p className="py-12 text-center text-xs text-foreground/55">
        No classified listings yet.
      </p>
    );
  }

  const rows = data.map((d) => {
    const total = d.white + d.blue + d.grey + d.unknown || 1;
    return {
      label: d.label,
      total,
      white: (d.white / total) * 100,
      blue: (d.blue / total) * 100,
      grey: (d.grey / total) * 100,
      unknown: (d.unknown / total) * 100,
      raw: d,
    };
  });

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-foreground/70">
        {COLLAR_SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
          </li>
        ))}
      </ul>

      <div className="text-foreground/80" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
            barCategoryGap={6}
          >
            {/* No stackOffset="expand" — the shares are already computed as
                percentages that sum to 100. Letting Recharts normalise them
                again rescaled the axis to 0–1 and printed "0%, 0%, 1%". */}
            <XAxis
              type="number"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v: number) => `${v}%`}
              {...AXIS_PROPS}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={130}
              interval={0}
              {...AXIS_PROPS}
            />
            <Tooltip
              {...TOOLTIP_PROPS}
              formatter={(value, name) => [
                `${Number(value).toFixed(1)}%`,
                COLLAR_SERIES.find((s) => s.key === name)?.label ?? name,
              ]}
            />
            {COLLAR_SERIES.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId="collar"
                fill={s.color}
                // 2px surface gap between stacked segments.
                stroke="var(--background)"
                strokeWidth={2}
                radius={i === 0 ? [4, 0, 0, 4] : i === COLLAR_SERIES.length - 1 ? [0, 4, 4, 0] : 0}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Ordered-bucket bar (listing lifetime). The buckets are ordinal, so this
 * uses one hue at a single step rather than a categorical set — the
 * ordering carries the meaning, colour only separates mark from surface.
 */
export function BucketBars({
  data,
  height = 260,
}: {
  data: { label: string; count: number }[];
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <p className="py-12 text-center text-xs text-foreground/55">
        No lifetime data yet.
      </p>
    );
  }
  return (
    <div className="text-foreground/80" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="label" {...AXIS_PROPS} />
          <YAxis allowDecimals={false} {...AXIS_PROPS} />
          <Tooltip
            {...TOOLTIP_PROPS}
            formatter={(v) => [Number(v).toLocaleString(), "Listings"]}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.label} fill="var(--chart-cat-1)" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
