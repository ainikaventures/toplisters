/**
 * Nationality demonym → ISO-3166 alpha-2 (lowercase) for flag images.
 * Covers the F1 grid + constructor nationalities; extend as needed. UK home
 * nations use flagcdn's gb-eng / gb-sct / gb-wls codes.
 */
const DEMONYM_ISO2: Record<string, string> = {
  british: "gb",
  english: "gb-eng",
  scottish: "gb-sct",
  welsh: "gb-wls",
  "northern irish": "gb",
  irish: "ie",
  dutch: "nl",
  italian: "it",
  monegasque: "mc",
  spanish: "es",
  australian: "au",
  mexican: "mx",
  french: "fr",
  german: "de",
  finnish: "fi",
  canadian: "ca",
  thai: "th",
  japanese: "jp",
  danish: "dk",
  american: "us",
  chinese: "cn",
  "new zealander": "nz",
  argentine: "ar",
  argentinian: "ar",
  brazilian: "br",
  austrian: "at",
  swiss: "ch",
  belgian: "be",
  russian: "ru",
  polish: "pl",
  portuguese: "pt",
  swedish: "se",
  indian: "in",
  estonian: "ee",
};

/** Map a nationality demonym (e.g. "British", "Monégasque") to an ISO2 code. */
export function demonymToIso2(demonym: string | null | undefined): string | null {
  if (!demonym) return null;
  const key = demonym
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
  return DEMONYM_ISO2[key] ?? null;
}
