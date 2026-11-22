import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import type { TramMapNetwork } from "@/lib/generated/TramMapNetwork"
import { parseJson } from "@/lib/json"
import { loadTramMap } from "@/lib/tram-map-data"

const network = parseJson<TramMapNetwork>(
  readFileSync(
    join(import.meta.dirname, "../data/karta-tramvaja/network.json"),
    "utf8"
  )
)
const map = loadTramMap()

/** Straight runs of an SVG path made of M, L and A commands, arcs skipped. */
function straightRuns(d: string): Array<[number, number, number, number]> {
  const runs: Array<[number, number, number, number]> = []
  let at: [number, number] = [0, 0]
  for (const [, cmd, args] of d.matchAll(/([MLA])([^MLA]*)/gu)) {
    const n = args
      .trim()
      .split(/[\s,]+/u)
      .map(Number)
    const next: [number, number] = [n.at(-2) ?? 0, n.at(-1) ?? 0]
    if (cmd === "L") {
      runs.push([...at, ...next])
    }
    at = next
  }
  return runs
}

interface Box {
  x0: number
  x1: number
  y0: number
  y1: number
}

const overlaps = (a: Box, b: Box) =>
  Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) &&
  Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0)

describe("tram map data", () => {
  it("draws every GTFS tram station exactly once", () => {
    const drawn = map.stations.map((s) => s.id).toSorted()
    expect(drawn).toEqual(network.stations.map((s) => s.id).toSorted())
  })

  it("draws every line, day and night, in GTFS stop order", () => {
    for (const line of network.lines) {
      const drawn = map.lines.find((l) => l.broj === line.broj)
      expect(drawn?.d.length).toBeGreaterThan(0)
      expect(drawn?.stations).toEqual(line.stations)
    }
  })

  it("keeps every straight run at 0, 45 or 90 degrees", () => {
    const off = map.lines.flatMap((l) =>
      straightRuns(l.d)
        .filter(([x1, y1, x2, y2]) => Math.hypot(x2 - x1, y2 - y1) > 2)
        .map(
          ([x1, y1, x2, y2]) => (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI
        )
        .filter((a) => Math.abs(a / 45 - Math.round(a / 45)) * 45 > 1.5)
        .map((a) => `${l.broj}: ${a.toFixed(1)}`)
    )
    expect(off).toEqual([])
  })

  it("never overlaps two station labels", () => {
    const boxes = map.stations.map((s) => ({
      name: s.name,
      x0: s.label.x,
      x1: s.label.x + s.label.w,
      y0: s.label.y - 12,
      y1: s.label.y + 4,
    }))
    const clashes = boxes.flatMap((a, i) =>
      boxes
        .slice(i + 1)
        .filter((b) => overlaps(a, b))
        .map((b) => `${a.name} / ${b.name}`)
    )
    expect(clashes).toEqual([])
  })

  it("links stations to their /stanice pages", () => {
    expect(Object.keys(map.slugs).length).toBeGreaterThan(
      map.stations.length * 0.9
    )
  })
})
