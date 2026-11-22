import { existsSync } from "node:fs"

import { readJson } from "../json"
import type { Network } from "./graph"
import { toKm } from "./graph"
import type { TramMapLayout } from "@/lib/tram-map-layout"

/**
 * The layout over the real city, for judging geographic fidelity: OSM roads,
 * tram tracks and the Sava (Overpass, cached in .cache/tram-map/basemap.json)
 * are carried onto the drawing by one uniform scale and translation fitted
 * to the true stop positions. Faint dots are the true stops; the pink
 * vectors run from each true stop to where the map draws it.
 */

interface Way {
  tags: Record<string, string>
  geometry: Array<{ lat: number; lon: number }>
}

const mean = (v: Array<number>) => v.reduce((a, b) => a + b, 0) / v.length

const ROAD = "#d4d4d4"
const ROAD_MAJOR = "#b8b8b8"
const TRACK = "#9db4dc"
const RIVER = "#dbe6f8"
const STOP = "#6b6b6b"
const VECTOR = "#e4258f"

interface OverlayLayers {
  under: string
  over: string
}

export function overlayLayers(
  layout: TramMapLayout,
  net: Network,
  basemapPath: string
): OverlayLayers {
  const byId = new Map(layout.stations.map((s) => [s.id, s]))
  const pairs = net.stations.flatMap((s) => {
    const drawn = byId.get(s.id)
    return drawn ? [{ g: { x: s.gx, y: s.gy }, p: drawn }] : []
  })
  const [gx, gy] = [
    mean(pairs.map((q) => q.g.x)),
    mean(pairs.map((q) => q.g.y)),
  ]
  const [px, py] = [
    mean(pairs.map((q) => q.p.x)),
    mean(pairs.map((q) => q.p.y)),
  ]
  let [num, den] = [0, 0]
  for (const { g, p } of pairs) {
    num += (g.x - gx) * (p.x - px) + (g.y - gy) * (p.y - py)
    den += (g.x - gx) ** 2 + (g.y - gy) ** 2
  }
  const k = num / den
  const project = (x: number, y: number) =>
    `${(px + k * (x - gx)).toFixed(1)} ${(py + k * (y - gy)).toFixed(1)}`
  const ways = existsSync(basemapPath)
    ? readJson<{ elements: Array<Way> }>(basemapPath).elements
    : []
  const path = (w: Way) =>
    "M" +
    w.geometry
      .map((g) => {
        const { gx: x, gy: y } = toKm(g.lat, g.lon)
        return project(x, y)
      })
      .join("L")
  const under: Array<string> = []
  const style = (w: Way): [string, number, number] => {
    if (w.tags.waterway === "river") {
      return [RIVER, 0.32 * k, 0]
    }
    if (w.tags.railway === "tram") {
      return [TRACK, 2.5, 1]
    }
    if (w.tags.railway === "rail") {
      return [ROAD_MAJOR, 1.5, 0.5]
    }
    const major = /^(motorway|trunk|primary)$/u.test(w.tags.highway ?? "")
    return [major ? ROAD_MAJOR : ROAD, major ? 2.5 : 1.5, major ? 0.4 : 0.3]
  }
  const order = (w: Way) =>
    w.tags.waterway ? 0 : w.tags.railway === "tram" ? 2 : 1
  for (const w of ways.toSorted((a, b) => order(a) - order(b))) {
    const [color, width] = style(w)
    under.push(
      `<path d="${path(w)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`
    )
  }
  under.push(
    `<rect x="-99999" y="-99999" width="199998" height="199998" fill="#ffffff" opacity="0.35"/>`
  )
  const over = pairs.flatMap(({ g, p }) => {
    const real = project(g.x, g.y).split(" ")
    return [
      `<line x1="${real[0]}" y1="${real[1]}" x2="${p.x}" y2="${p.y}" stroke="${VECTOR}" stroke-width="1.5" opacity="0.8"/>`,
      `<circle cx="${real[0]}" cy="${real[1]}" r="3.5" fill="${STOP}" opacity="0.7"/>`,
    ]
  })
  return { under: under.join(""), over: over.join("") }
}
