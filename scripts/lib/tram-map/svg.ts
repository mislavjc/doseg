import type { TramMapLayout } from "@/lib/tram-map-layout"
import { tramLineToken } from "@/lib/tram-lines"

/**
 * Static SVG of a layout, for the iteration renders. Mirrors what
 * app/karta-tramvaja draws; colours mirror the :root tokens in
 * app/globals.css (ink, ground, zg-blue) because librsvg has no CSS vars.
 */

const INK = "#0a0a0a"
const GROUND = "#ffffff"
const RIVER = "#dbe6f8"
const TOKENS = {
  "tram-blue": "#0072ce",
  "tram-green-dark": "#00843d",
  "tram-green": "#4cb848",
  "tram-yellow": "#ffb81c",
  "tram-pink": "#e4258f",
  "tram-purple": "#7b2d8e",
  navy: "#0e3fb0",
} satisfies Record<ReturnType<typeof tramLineToken>, string>
const color = (broj: string) => TOKENS[tramLineToken(broj)]

export function layoutSvg(
  layout: TramMapLayout,
  opts: { title?: string; scale?: number; under?: string; over?: string } = {}
): string {
  const [x, y, w, h] = layout.viewBox
  const scale = opts.scale ?? 1
  const lw = layout.lineWidth
  const day = layout.lines.filter((l) => !l.isNight)
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w * scale}" height="${h * scale}">`,
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${GROUND}"/>`,
    opts.under ?? "",
    `<path d="${layout.river.d}" fill="none" stroke="${RIVER}" stroke-width="${layout.river.width}" stroke-linecap="round" stroke-linejoin="round"/>`,
    ...day.map(
      (l) =>
        `<path d="${l.d}" fill="none" stroke="${color(l.broj)}" stroke-width="${lw - 1}" stroke-linecap="butt" stroke-linejoin="round"/>`
    ),
  ]
  for (const s of layout.stations) {
    const m = s.mark
    if (s.kind === "interchange") {
      parts.push(
        `<line x1="${m.x1}" y1="${m.y1}" x2="${m.x2}" y2="${m.y2}" stroke="${INK}" stroke-width="${lw + 6}" stroke-linecap="round"/>`,
        `<line x1="${m.x1}" y1="${m.y1}" x2="${m.x2}" y2="${m.y2}" stroke="${GROUND}" stroke-width="${lw + 1}" stroke-linecap="round"/>`
      )
    } else {
      parts.push(
        `<line x1="${m.x1}" y1="${m.y1}" x2="${m.x2}" y2="${m.y2}" stroke="${m.broj === null ? INK : color(m.broj)}" stroke-width="${s.kind === "terminal" ? lw : lw - 1}"/>`
      )
    }
    const weight = s.kind === "tick" ? 400 : 700
    parts.push(
      `<text x="${s.label.x}" y="${s.label.y}" font-family="TeX Gyre Heros" font-size="16" font-weight="${weight}" fill="${INK}">${s.name}</text>`
    )
  }
  if (opts.title !== undefined) {
    parts.push(
      `<text x="${x + 16}" y="${y + 24}" font-family="Geist Mono" font-size="12" fill="${INK}">${opts.title}</text>`
    )
  }
  parts.push(opts.over ?? "", "</svg>")
  return parts.join("")
}
