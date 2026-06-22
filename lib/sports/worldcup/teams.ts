/**
 * FIFA World Cup 2026 — the single editable data source.
 *
 * 48 teams in 12 groups (A–L), each with a World-Football-Elo-style rating.
 * There is no reliable free live WC API, so this file is hand-maintained:
 *
 *   • As the real draw is confirmed, fix the `group` assignments.
 *   • As ratings move, update `elo`.
 *   • As GROUP games finish, fill the live stats: set `played/won/drawn/
 *     lost/gf/ga` (and/or `result` = final group points). Any team with
 *     stats is treated as locked — used as-is for ranking instead of being
 *     simulated. Once the group stage ends, fill all 48 and the model runs
 *     purely on the knockout bracket.
 *
 * `iso2` drives the flag image (flagcdn); UK home nations use gb-eng etc.
 * Ratings below are approximate June-2026 placeholders — review before launch.
 */

export interface WcTeam {
  name: string;
  code: string;
  group: string;
  elo: number;
  /** ISO-3166 alpha-2 (or gb-eng/gb-sct/gb-wls) for the flag. */
  iso2: string;
  /** Final group points, once known. Locked teams aren't simulated. */
  result?: number;
  // ─── Live group-stage stats (optional; fill as games finish) ───
  played?: number;
  won?: number;
  drawn?: number;
  lost?: number;
  gf?: number;
  ga?: number;
}

export const WC_TEAMS: WcTeam[] = [
  // Group A
  { name: "Mexico", code: "MEX", iso2: "mx", group: "A", elo: 1810 },
  { name: "Croatia", code: "CRO", iso2: "hr", group: "A", elo: 1900 },
  { name: "Ecuador", code: "ECU", iso2: "ec", group: "A", elo: 1760 },
  { name: "Saudi Arabia", code: "KSA", iso2: "sa", group: "A", elo: 1640 },
  // Group B
  { name: "Canada", code: "CAN", iso2: "ca", group: "B", elo: 1720 },
  { name: "Belgium", code: "BEL", iso2: "be", group: "B", elo: 1950 },
  { name: "Egypt", code: "EGY", iso2: "eg", group: "B", elo: 1720 },
  { name: "Qatar", code: "QAT", iso2: "qa", group: "B", elo: 1650 },
  // Group C
  { name: "United States", code: "USA", iso2: "us", group: "C", elo: 1820 },
  { name: "Netherlands", code: "NED", iso2: "nl", group: "C", elo: 1990 },
  { name: "Japan", code: "JPN", iso2: "jp", group: "C", elo: 1810 },
  { name: "Ghana", code: "GHA", iso2: "gh", group: "C", elo: 1680 },
  // Group D
  { name: "Argentina", code: "ARG", iso2: "ar", group: "D", elo: 2100 },
  { name: "Denmark", code: "DEN", iso2: "dk", group: "D", elo: 1790 },
  { name: "Nigeria", code: "NGA", iso2: "ng", group: "D", elo: 1740 },
  { name: "Panama", code: "PAN", iso2: "pa", group: "D", elo: 1600 },
  // Group E
  { name: "France", code: "FRA", iso2: "fr", group: "E", elo: 2080 },
  { name: "Switzerland", code: "SUI", iso2: "ch", group: "E", elo: 1800 },
  { name: "South Korea", code: "KOR", iso2: "kr", group: "E", elo: 1770 },
  { name: "Costa Rica", code: "CRC", iso2: "cr", group: "E", elo: 1620 },
  // Group F
  { name: "Brazil", code: "BRA", iso2: "br", group: "F", elo: 2020 },
  { name: "Austria", code: "AUT", iso2: "at", group: "F", elo: 1750 },
  { name: "Ivory Coast", code: "CIV", iso2: "ci", group: "F", elo: 1700 },
  { name: "New Zealand", code: "NZL", iso2: "nz", group: "F", elo: 1500 },
  // Group G
  { name: "England", code: "ENG", iso2: "gb-eng", group: "G", elo: 2030 },
  { name: "Senegal", code: "SEN", iso2: "sn", group: "G", elo: 1800 },
  { name: "Poland", code: "POL", iso2: "pl", group: "G", elo: 1740 },
  { name: "Jamaica", code: "JAM", iso2: "jm", group: "G", elo: 1590 },
  // Group H
  { name: "Spain", code: "ESP", iso2: "es", group: "H", elo: 2050 },
  { name: "Uruguay", code: "URU", iso2: "uy", group: "H", elo: 1890 },
  { name: "Australia", code: "AUS", iso2: "au", group: "H", elo: 1720 },
  { name: "South Africa", code: "RSA", iso2: "za", group: "H", elo: 1620 },
  // Group I
  { name: "Portugal", code: "POR", iso2: "pt", group: "I", elo: 2000 },
  { name: "Colombia", code: "COL", iso2: "co", group: "I", elo: 1880 },
  { name: "Norway", code: "NOR", iso2: "no", group: "I", elo: 1740 },
  { name: "Tunisia", code: "TUN", iso2: "tn", group: "I", elo: 1680 },
  // Group J
  { name: "Germany", code: "GER", iso2: "de", group: "J", elo: 1960 },
  { name: "Sweden", code: "SWE", iso2: "se", group: "J", elo: 1730 },
  { name: "Iran", code: "IRN", iso2: "ir", group: "J", elo: 1760 },
  { name: "Chile", code: "CHI", iso2: "cl", group: "J", elo: 1720 },
  // Group K
  { name: "Italy", code: "ITA", iso2: "it", group: "K", elo: 1960 },
  { name: "Morocco", code: "MAR", iso2: "ma", group: "K", elo: 1870 },
  { name: "Peru", code: "PER", iso2: "pe", group: "K", elo: 1700 },
  { name: "Cameroon", code: "CMR", iso2: "cm", group: "K", elo: 1680 },
  // Group L
  { name: "Paraguay", code: "PAR", iso2: "py", group: "L", elo: 1680 },
  { name: "Serbia", code: "SRB", iso2: "rs", group: "L", elo: 1760 },
  { name: "Algeria", code: "ALG", iso2: "dz", group: "L", elo: 1720 },
  { name: "Honduras", code: "HON", iso2: "hn", group: "L", elo: 1560 },
];
