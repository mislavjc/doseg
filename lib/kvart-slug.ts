const DIA: Record<string, string> = { č: "c", ć: "c", š: "s", ž: "z", đ: "d" }

/**
 * "Trešnjevka - sjever" → "tresnjevka-sjever" (template-safe, diacritic-free).
 * Standalone (no app/data imports) so both the page-data layer and the bun bake
 * script can share one slug rule — otherwise hero PNG filenames and page routes
 * could silently drift apart.
 */
export function kvartSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[čćšžđ]/g, (c) => DIA[c] ?? c)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
