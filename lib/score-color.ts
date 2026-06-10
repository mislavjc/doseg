/**
 * Statistika editorial score ramp — navy → pale by score (0–100).
 *
 * High score (good connectivity) = navy `#0E3FB0`; low score = pale `#F4F8FE`.
 * Shared by the ranking board, the povezanost choropleth, and any score fill so
 * the colour language stays identical across the page. See docs/design-system.md.
 */

// Ramp endpoints (must match --rank-100 / --rank-0 in globals.css).
const HI: [number, number, number] = [0x0e, 0x3f, 0xb0] // score 100 — navy
const LO: [number, number, number] = [0xf4, 0xf8, 0xfe] // score 0   — pale

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, "0")

/** Fill colour for a 0–100 score on the navy→pale ramp. */
export function scoreColor(score: number): string {
  // Slight ease keeps mid scores visually distinct from the pale low end.
  const t = Math.pow(clamp01(score / 100), 0.85)
  const mix = (hi: number, lo: number) => lo + (hi - lo) * t
  return `#${hex2(mix(HI[0], LO[0]))}${hex2(mix(HI[1], LO[1]))}${hex2(mix(HI[2], LO[2]))}`
}

/** Whether `scoreColor(score)` is dark enough to need light text on top. */
export function isDarkScore(score: number): boolean {
  return score >= 75
}

/** Readable text colour to sit on top of `scoreColor(score)`. */
export function scoreTextColor(score: number): string {
  return isDarkScore(score) ? "#ffffff" : "#0a0a0a"
}
