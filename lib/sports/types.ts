/**
 * Shared contract for the sports vertical's win-path engines.
 *
 * Each sport is a self-contained module behind this interface — they share
 * NO logic (F1 is a points championship, the World Cup is a knockout
 * bracket). The UI calls `load()` for standings/data then `analyse(data,
 * targetId)` for the result object, which is also the JSON shipped to the AI
 * roadmap endpoint.
 */

export type SportId = "f1" | "world-cup";

/** A pickable competitor (driver or national team). */
export interface Competitor {
  id: string;
  name: string;
  /** Constructor (F1) or group (WC) — shown under the name. */
  subtitle?: string;
  /** Current championship points (F1). */
  points?: number;
  /** Elo rating (WC). */
  rating?: number;
  /** True for rows already through / leading, for table highlighting. */
  highlight?: boolean;
}

export interface ProbabilityEntry {
  id: string;
  name: string;
  /** 0..1 simulated title probability. */
  probability: number;
  /** ISO2 (lowercase) for a flag — team nationality (WC) or driver (F1). */
  iso2?: string | null;
  /** Headshot URL (F1 drivers). */
  photoUrl?: string | null;
}

/** Deterministic, exact "is it still possible + what must happen" verdict. */
export interface PossibilityVerdict {
  alive: boolean;
  /** True when the target has mathematically clinched (F1 leader only). */
  clinched: boolean;
  /** One-line human summary. */
  headline: string;
  /** Exact supporting numbers (gap, points available, avg/race needed…). */
  facts: { label: string; value: string }[];
}

/** One step of the prescriptive roadmap / projected path. */
export interface PathStep {
  label: string;
  detail: string;
  /** P(win) for this step, 0..1 (WC per-round; optional for F1). */
  probability?: number;
  /** Cumulative P(reach/clear this step), 0..1. */
  cumulative?: number;
}

export interface AnalysisResult {
  sport: SportId;
  /** The chosen competitor + their simulated title probability. */
  target: ProbabilityEntry;
  /** Top rivals by simulated probability (excludes the target). */
  rivals: ProbabilityEntry[];
  possibility: PossibilityVerdict;
  /** F1: the requirement scenario; WC: the projected bracket path. */
  path: PathStep[];
  /** Free-form context (season, round, remaining races, qualifiers…). */
  meta: Record<string, string | number>;
}

export interface SportEngine<TData> {
  readonly sport: SportId;
  /** Fetch / assemble the live standings or data set. */
  load(): Promise<TData>;
  /** Pure: derive the full analysis for the chosen competitor. */
  analyse(data: TData, targetId: string): AnalysisResult;
  /** The pickable rows for the standings view. */
  competitors(data: TData): Competitor[];
}
