/**
 * Convert a job title (or any free-form string) into a URL slug.
 * Lowercased, ASCII-only, hyphen-separated, capped at 80 chars to keep URLs
 * sensible — Google truncates display URLs around there anyway.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}
