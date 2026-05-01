/**
 * Deterministic SVG avatar for companies that don't have a logo on file yet.
 * Two-letter initials on a hue derived from the company name. Pure function:
 * the same input always renders the same output, so SSR + hydration agree.
 */
function hashHue(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
}

function initials(name: string): string {
  const parts = name
    .split(/[\s.\-_,]+/)
    .map((p) => p.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return ((parts[0][0] ?? "") + (parts[1][0] ?? "")).toUpperCase();
}

export function InitialsAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const text = initials(name);
  const hue = hashHue(name);
  const bg = `hsl(${hue} 55% 38%)`;
  const fg = `hsl(${hue} 35% 96%)`;

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={`${name} logo`}
    >
      <rect width="100" height="100" rx="18" fill={bg} />
      <text
        x="50"
        y="54"
        fill={fg}
        fontSize="38"
        fontWeight={600}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        {text}
      </text>
    </svg>
  );
}
