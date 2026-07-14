/**
 * Croatian collation for the stop imenik — shared by the /stanice A–Ž
 * directory and the homepage letter strip (which links to its anchors).
 */

/** Stops below this many lines have pages but aren't promoted on the hub —
 *  the /stanice directory (and its letter anchors) only lists promoted ones. */
export const MIN_LINES = 3

/** Croatian collation order for the A–Ž buckets and strip. */
export const HR_LETTERS = [
  "A", "B", "C", "Č", "Ć", "D", "Đ", "E", "F", "G", "H", "I", "J", "K", "L",
  "M", "N", "O", "P", "R", "S", "Š", "T", "U", "V", "Z", "Ž",
] as const

/** ASCII anchor id for a (possibly diacritic) bucket letter. */
const LETTER_SLUG: Record<string, string> = { "Č": "cc", "Ć": "cy", "Đ": "dj", "Š": "sh", "Ž": "zh" }
export function letterId(letter: string): string {
  return `slovo-${LETTER_SLUG[letter] ?? (/^[A-Za-z]$/.test(letter) ? letter.toLowerCase() : "broj")}`
}

/** Bucket key for a stop name's first character (Croatian letters keep their own). */
export function firstLetter(name: string): string {
  const c = [...name.trim()][0]?.toUpperCase() ?? "#"
  if ((HR_LETTERS as readonly string[]).includes(c)) return c
  if (/[0-9]/.test(c)) return "0-9"
  return c
}
