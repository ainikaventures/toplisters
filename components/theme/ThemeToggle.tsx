"use client";

import { useTheme, type Theme } from "./ThemeProvider";

const ORDER: Theme[] = ["light", "dark", "system"];
const ICONS: Record<Theme, string> = {
  light: "☀",
  dark: "🌙",
  system: "🖥",
};
const LABELS: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

/**
 * Cycles light → dark → system → light. Tooltip via aria-label so the
 * current state is announced to screen readers; visible chip shows the
 * next-state hint to keep the affordance discoverable.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const nextTheme = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];

  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme)}
      aria-label={`Theme: ${LABELS[theme]}. Click for ${LABELS[nextTheme]}.`}
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-full border border-foreground/15 bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:border-foreground/40"
      }
    >
      <span aria-hidden>{ICONS[theme]}</span>
      <span>{LABELS[theme]}</span>
    </button>
  );
}
