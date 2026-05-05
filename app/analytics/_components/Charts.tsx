"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

/**
 * Wraps Recharts BarChart with our themed defaults. `data` is the smaller
 * shape `[{label, value}]` so callers don't have to reach into Recharts'
 * idioms to swap in different metrics.
 */
export function HorizontalBars({
  data,
  height = 280,
  formatTick,
}: {
  data: { label: string; value: number }[];
  height?: number;
  formatTick?: (label: string) => string;
}) {
  if (data.length === 0) {
    return (
      <p className="py-12 text-center text-xs text-foreground/55">
        No data in the selected window.
      </p>
    );
  }
  return (
    <div className="text-foreground/80" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 24, left: 0, bottom: 4 }}
        >
          <CartesianGrid {...GRID_PROPS} />
          <XAxis type="number" {...AXIS_PROPS} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="label"
            width={120}
            tickFormatter={formatTick}
            {...AXIS_PROPS}
          />
          <Tooltip {...TOOLTIP_PROPS} />
          <Bar
            dataKey="value"
            fill="hsl(220 70% 55%)"
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendLine({
  data,
  height = 280,
}: {
  data: { date: string; count: number }[];
  height?: number;
}) {
  return (
    <div className="text-foreground/80" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 24, left: 0, bottom: 4 }}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => {
              const [, m, day] = d.split("-");
              return `${day}/${m}`;
            }}
            interval="preserveStartEnd"
            minTickGap={32}
            {...AXIS_PROPS}
          />
          <YAxis allowDecimals={false} {...AXIS_PROPS} />
          <Tooltip {...TOOLTIP_PROPS} />
          <Line
            type="monotone"
            dataKey="count"
            stroke="hsl(220 70% 55%)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
