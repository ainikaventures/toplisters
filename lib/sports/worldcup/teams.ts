/**
 * FIFA World Cup 2026 — the single editable data source.
 *
 * 48 teams in 12 groups (A–L), each with a World-Football-Elo-style rating.
 * There is no reliable free live WC API, so this file is hand-maintained:
 *
 *   • As the real draw is confirmed, fix the `group` assignments.
 *   • As ratings move, update `elo`.
 *   • As GROUP games finish, set a team's `result` to its FINAL group points
 *     (3/1/0). Teams with a `result` are treated as locked (used as-is for
 *     ranking) instead of simulated. Once the group stage ends, set all 48
 *     and the model runs purely on the knockout bracket.
 *
 * Ratings below are approximate June-2026 placeholders — review before launch.
 */

export interface WcTeam {
  name: string;
  code: string;
  group: string;
  elo: number;
  /** Final group points, once known. Locked teams aren't simulated. */
  result?: number;
}

export const WC_TEAMS: WcTeam[] = [
  // Group A
  { name: "Mexico", code: "MEX", group: "A", elo: 1810 },
  { name: "Croatia", code: "CRO", group: "A", elo: 1900 },
  { name: "Ecuador", code: "ECU", group: "A", elo: 1760 },
  { name: "Saudi Arabia", code: "KSA", group: "A", elo: 1640 },
  // Group B
  { name: "Canada", code: "CAN", group: "B", elo: 1720 },
  { name: "Belgium", code: "BEL", group: "B", elo: 1950 },
  { name: "Egypt", code: "EGY", group: "B", elo: 1720 },
  { name: "Qatar", code: "QAT", group: "B", elo: 1650 },
  // Group C
  { name: "United States", code: "USA", group: "C", elo: 1820 },
  { name: "Netherlands", code: "NED", group: "C", elo: 1990 },
  { name: "Japan", code: "JPN", group: "C", elo: 1810 },
  { name: "Ghana", code: "GHA", group: "C", elo: 1680 },
  // Group D
  { name: "Argentina", code: "ARG", group: "D", elo: 2100 },
  { name: "Denmark", code: "DEN", group: "D", elo: 1790 },
  { name: "Nigeria", code: "NGA", group: "D", elo: 1740 },
  { name: "Panama", code: "PAN", group: "D", elo: 1600 },
  // Group E
  { name: "France", code: "FRA", group: "E", elo: 2080 },
  { name: "Switzerland", code: "SUI", group: "E", elo: 1800 },
  { name: "South Korea", code: "KOR", group: "E", elo: 1770 },
  { name: "Costa Rica", code: "CRC", group: "E", elo: 1620 },
  // Group F
  { name: "Brazil", code: "BRA", group: "F", elo: 2020 },
  { name: "Austria", code: "AUT", group: "F", elo: 1750 },
  { name: "Ivory Coast", code: "CIV", group: "F", elo: 1700 },
  { name: "New Zealand", code: "NZL", group: "F", elo: 1500 },
  // Group G
  { name: "England", code: "ENG", group: "G", elo: 2030 },
  { name: "Senegal", code: "SEN", group: "G", elo: 1800 },
  { name: "Poland", code: "POL", group: "G", elo: 1740 },
  { name: "Jamaica", code: "JAM", group: "G", elo: 1590 },
  // Group H
  { name: "Spain", code: "ESP", group: "H", elo: 2050 },
  { name: "Uruguay", code: "URU", group: "H", elo: 1890 },
  { name: "Australia", code: "AUS", group: "H", elo: 1720 },
  { name: "South Africa", code: "RSA", group: "H", elo: 1620 },
  // Group I
  { name: "Portugal", code: "POR", group: "I", elo: 2000 },
  { name: "Colombia", code: "COL", group: "I", elo: 1880 },
  { name: "Norway", code: "NOR", group: "I", elo: 1740 },
  { name: "Tunisia", code: "TUN", group: "I", elo: 1680 },
  // Group J
  { name: "Germany", code: "GER", group: "J", elo: 1960 },
  { name: "Sweden", code: "SWE", group: "J", elo: 1730 },
  { name: "Iran", code: "IRN", group: "J", elo: 1760 },
  { name: "Chile", code: "CHI", group: "J", elo: 1720 },
  // Group K
  { name: "Italy", code: "ITA", group: "K", elo: 1960 },
  { name: "Morocco", code: "MAR", group: "K", elo: 1870 },
  { name: "Peru", code: "PER", group: "K", elo: 1700 },
  { name: "Cameroon", code: "CMR", group: "K", elo: 1680 },
  // Group L
  { name: "Spain B placeholder — Paraguay", code: "PAR", group: "L", elo: 1680 },
  { name: "Serbia", code: "SRB", group: "L", elo: 1760 },
  { name: "Algeria", code: "ALG", group: "L", elo: 1720 },
  { name: "Costa Rica B — Honduras", code: "HON", group: "L", elo: 1560 },
];
