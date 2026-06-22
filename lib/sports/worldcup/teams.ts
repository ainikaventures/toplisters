/**
 * FIFA World Cup 2026 — the team/Elo seed.
 *
 * Groups + teams + `code` match the football-data.org draw (code = their TLA),
 * so the live standings overlay (lib/sports/worldcup/standings.ts) joins
 * cleanly. Elo ratings are approximate World-Football-Elo priors — the live
 * results overlay takes over for played games, so these only seed the model.
 * `iso2` drives the flag image (flagcdn; UK home nations use gb-eng/gb-sct).
 *
 * Live stats (played/won/drawn/lost/gf/ga, result) are filled at runtime from
 * the football-data feed — leave them unset here.
 */

export interface WcTeam {
  name: string;
  code: string;
  group: string;
  elo: number;
  iso2: string;
  result?: number;
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
  { name: "South Korea", code: "KOR", iso2: "kr", group: "A", elo: 1770 },
  { name: "Czechia", code: "CZE", iso2: "cz", group: "A", elo: 1750 },
  { name: "South Africa", code: "RSA", iso2: "za", group: "A", elo: 1620 },
  // Group B
  { name: "Canada", code: "CAN", iso2: "ca", group: "B", elo: 1720 },
  { name: "Switzerland", code: "SUI", iso2: "ch", group: "B", elo: 1800 },
  { name: "Bosnia-Herzegovina", code: "BIH", iso2: "ba", group: "B", elo: 1700 },
  { name: "Qatar", code: "QAT", iso2: "qa", group: "B", elo: 1650 },
  // Group C
  { name: "Brazil", code: "BRA", iso2: "br", group: "C", elo: 2020 },
  { name: "Morocco", code: "MAR", iso2: "ma", group: "C", elo: 1870 },
  { name: "Scotland", code: "SCO", iso2: "gb-sct", group: "C", elo: 1740 },
  { name: "Haiti", code: "HAI", iso2: "ht", group: "C", elo: 1500 },
  // Group D
  { name: "United States", code: "USA", iso2: "us", group: "D", elo: 1820 },
  { name: "Australia", code: "AUS", iso2: "au", group: "D", elo: 1720 },
  { name: "Paraguay", code: "PAR", iso2: "py", group: "D", elo: 1690 },
  { name: "Turkey", code: "TUR", iso2: "tr", group: "D", elo: 1780 },
  // Group E
  { name: "Germany", code: "GER", iso2: "de", group: "E", elo: 1960 },
  { name: "Ivory Coast", code: "CIV", iso2: "ci", group: "E", elo: 1700 },
  { name: "Ecuador", code: "ECU", iso2: "ec", group: "E", elo: 1760 },
  { name: "Curaçao", code: "CUW", iso2: "cw", group: "E", elo: 1550 },
  // Group F
  { name: "Netherlands", code: "NED", iso2: "nl", group: "F", elo: 1990 },
  { name: "Japan", code: "JPN", iso2: "jp", group: "F", elo: 1810 },
  { name: "Sweden", code: "SWE", iso2: "se", group: "F", elo: 1730 },
  { name: "Tunisia", code: "TUN", iso2: "tn", group: "F", elo: 1680 },
  // Group G
  { name: "Egypt", code: "EGY", iso2: "eg", group: "G", elo: 1720 },
  { name: "Iran", code: "IRN", iso2: "ir", group: "G", elo: 1760 },
  { name: "Belgium", code: "BEL", iso2: "be", group: "G", elo: 1950 },
  { name: "New Zealand", code: "NZL", iso2: "nz", group: "G", elo: 1500 },
  // Group H
  { name: "Spain", code: "ESP", iso2: "es", group: "H", elo: 2050 },
  { name: "Uruguay", code: "URU", iso2: "uy", group: "H", elo: 1890 },
  { name: "Cape Verde Islands", code: "CPV", iso2: "cv", group: "H", elo: 1600 },
  { name: "Saudi Arabia", code: "KSA", iso2: "sa", group: "H", elo: 1640 },
  // Group I
  { name: "Norway", code: "NOR", iso2: "no", group: "I", elo: 1750 },
  { name: "France", code: "FRA", iso2: "fr", group: "I", elo: 2080 },
  { name: "Senegal", code: "SEN", iso2: "sn", group: "I", elo: 1800 },
  { name: "Iraq", code: "IRQ", iso2: "iq", group: "I", elo: 1620 },
  // Group J
  { name: "Argentina", code: "ARG", iso2: "ar", group: "J", elo: 2100 },
  { name: "Austria", code: "AUT", iso2: "at", group: "J", elo: 1750 },
  { name: "Jordan", code: "JOR", iso2: "jo", group: "J", elo: 1560 },
  { name: "Algeria", code: "ALG", iso2: "dz", group: "J", elo: 1720 },
  // Group K
  { name: "Colombia", code: "COL", iso2: "co", group: "K", elo: 1880 },
  { name: "Congo DR", code: "COD", iso2: "cd", group: "K", elo: 1660 },
  { name: "Portugal", code: "POR", iso2: "pt", group: "K", elo: 2000 },
  { name: "Uzbekistan", code: "UZB", iso2: "uz", group: "K", elo: 1620 },
  // Group L
  { name: "England", code: "ENG", iso2: "gb-eng", group: "L", elo: 2030 },
  { name: "Ghana", code: "GHA", iso2: "gh", group: "L", elo: 1680 },
  { name: "Panama", code: "PAN", iso2: "pa", group: "L", elo: 1600 },
  { name: "Croatia", code: "CRO", iso2: "hr", group: "L", elo: 1900 },
];
