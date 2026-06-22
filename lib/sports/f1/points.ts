/**
 * 2026 F1 points tables. Race top-10 only (no fastest-lap point in 2026);
 * sprint top-8. Used by both the deterministic possibility math and the
 * Monte-Carlo simulation.
 */

export const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] as const;
export const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

export const RACE_WIN_POINTS = RACE_POINTS[0]; // 25

/** Points for a finishing position (1-indexed). 0 outside the points. */
export function racePoints(position: number): number {
  return position >= 1 && position <= RACE_POINTS.length ? RACE_POINTS[position - 1] : 0;
}

export function sprintPoints(position: number): number {
  return position >= 1 && position <= SPRINT_POINTS.length ? SPRINT_POINTS[position - 1] : 0;
}

/** Maximum points a driver could still score over the remaining schedule. */
export function maxRemaining(remainingRaces: number, remainingSprints: number): number {
  return remainingRaces * RACE_WIN_POINTS + remainingSprints * SPRINT_POINTS[0];
}
