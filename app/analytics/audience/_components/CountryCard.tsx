import Link from "next/link";
import { countryName } from "@/lib/format";
import { countryToSlug } from "@/lib/locations";
import { countryShape, SHAPE_VIEWBOX } from "@/lib/country-shapes";

/**
 * Country silhouette + visitor count, designed to read at a glance:
 * the country's shape acts as the icon, the count is centered inside
 * the path. Falls back to a bordered tile with just the count when the
 * 110m dataset doesn't carry that country (microstates etc.).
 */
export function CountryCard({
  iso2,
  visitors,
  visits,
}: {
  iso2: string;
  visitors: number;
  visits: number;
}) {
  const shape = countryShape(iso2);
  const name = countryName(iso2);
  const slug = countryToSlug(iso2);

  return (
    <Link
      href={`/jobs/${slug}`}
      className="group flex flex-col items-stretch gap-2 rounded-xl border border-foreground/10 bg-muted/30 p-4 transition hover:border-foreground/30 hover:bg-muted/50"
    >
      <div className="relative aspect-[5/3] w-full overflow-hidden rounded-md bg-foreground/5">
        {shape ? (
          <svg
            viewBox={`0 0 ${SHAPE_VIEWBOX.width} ${SHAPE_VIEWBOX.height}`}
            className="h-full w-full"
            aria-hidden="true"
          >
            <path
              d={shape.d}
              className="fill-foreground/15 stroke-foreground/40 transition group-hover:fill-foreground/25 group-hover:stroke-foreground/60"
              strokeWidth={0.5}
              strokeLinejoin="round"
            />
            <text
              x={shape.cx}
              y={shape.cy}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-foreground font-semibold tabular-nums"
              style={{ fontSize: visitors >= 1000 ? 10 : 12 }}
              paintOrder="stroke"
              stroke="var(--background)"
              strokeWidth={2.4}
              strokeLinejoin="round"
            >
              {visitors.toLocaleString()}
            </text>
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center text-xl font-semibold tabular-nums text-foreground/70">
            {visitors.toLocaleString()}
          </div>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="shrink-0 text-[10px] uppercase tracking-wider text-foreground/50 tabular-nums">
          {visits.toLocaleString()} visits
        </p>
      </div>
    </Link>
  );
}
