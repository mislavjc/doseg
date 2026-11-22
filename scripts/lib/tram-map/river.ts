import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

import { readJson } from "../json"
import type { Context, Drawn } from "./layout"
import { GRID, SPACING } from "./layout"
import type { Pt } from "./geometry"
import { toKm } from "./graph"

/**
 * The Sava as a stylised band. The real centreline (OSM, cached) is carried
 * into map space by the displacement of the nearest stations, simplified,
 * and smoothed. Stations that land on the wrong bank are counted.
 */

const OVERPASS = "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
const QUERY =
  '[out:json][timeout:60];way["waterway"="river"]["name"="Sava"](45.70,15.80,45.85,16.15);out geom;'
const BAND = 26

export interface RiverResult {
  d: string
  width: number
  sideErrors: number
}

export async function loadSava(cachePath: string): Promise<Array<Pt>> {
  if (!existsSync(cachePath)) {
    const res = await fetch(OVERPASS, {
      method: "POST",
      body: new URLSearchParams({ data: QUERY }),
    })
    if (!res.ok) {
      throw new Error(`Overpass ${res.status}`)
    }
    mkdirSync(dirname(cachePath), { recursive: true })
    writeFileSync(cachePath, await res.text())
  }
  const json = readJson<{
    elements: Array<{ geometry: Array<{ lat: number; lon: number }> }>
  }>(cachePath)
  const pts = json.elements.flatMap((e) =>
    e.geometry.map((g) => toKm(g.lat, g.lon))
  )
  return pts.map((p) => ({ x: p.gx, y: p.gy })).toSorted((a, b) => a.x - b.x)
}

function perp(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l = Math.hypot(dx, dy) || 1
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / l
}

function simplify(pts: Array<Pt>, tol: number): Array<Pt> {
  if (pts.length < 3) {
    return pts
  }
  let [idx, max] = [0, 0]
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perp(pts[i], pts[0], pts.at(-1) ?? pts[0])
    if (d > max) {
      ;[idx, max] = [i, d]
    }
  }
  if (max <= tol) {
    return [pts[0], pts.at(-1) ?? pts[0]]
  }
  return [
    ...simplify(pts.slice(0, idx + 1), tol).slice(0, -1),
    ...simplify(pts.slice(idx), tol),
  ]
}

function chaikin(pts: Array<Pt>, rounds: number): Array<Pt> {
  let cur = pts
  for (let r = 0; r < rounds; r++) {
    const next: Array<Pt> = [cur[0]]
    for (let i = 1; i < cur.length; i++) {
      const [a, b] = [cur[i - 1], cur[i]]
      next.push(
        { x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y },
        { x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y }
      )
    }
    next.push(cur.at(-1) ?? cur[0])
    cur = next
  }
  return cur
}

const yAt = (line: Array<Pt>, x: number) => {
  for (let i = 1; i < line.length; i++) {
    if (line[i].x >= x) {
      const t = (x - line[i - 1].x) / (line[i].x - line[i - 1].x || 1)
      return line[i - 1].y + t * (line[i].y - line[i - 1].y)
    }
  }
  return line.at(-1)?.y ?? 0
}

/** Per station, whether it lies south of the river centreline. */
export function southBank(
  stations: Array<{ gx: number; gy: number }>,
  sava: Array<Pt>
): Array<boolean> {
  return stations.map((s) => s.gy > yAt(sava, s.gx))
}

/**
 * The real centreline carried onto the drawing by the uniform scale and
 * translation that best fits the true stop positions to the drawn ones.
 */
function projectSava(ctx: Context, d: Drawn, sava: Array<Pt>): Array<Pt> {
  const st = ctx.net.stations
  const n = st.length
  const gx = st.reduce((a, s) => a + s.gx, 0) / n
  const gy = st.reduce((a, s) => a + s.gy, 0) / n
  const px = d.pos.reduce((a, p) => a + p.x, 0) / n
  const py = d.pos.reduce((a, p) => a + p.y, 0) / n
  let [num, den] = [0, 0]
  st.forEach((s, i) => {
    num += (s.gx - gx) * (d.pos[i].x - px) + (s.gy - gy) * (d.pos[i].y - py)
    den += (s.gx - gx) ** 2 + (s.gy - gy) ** 2
  })
  const k = num / (den || 1)
  return sava.map((p) => ({ x: px + k * (p.x - gx), y: py + k * (p.y - gy) }))
}

/**
 * The band follows the real Sava wherever the drawing leaves room for it,
 * and otherwise is pushed into the corridor between the drawn north-bank
 * tracks and the drawn south-bank stations, so every station stays on its
 * real bank.
 */
export function riverFor(ctx: Context, sava: Array<Pt>) {
  return (d: Drawn): RiverResult => {
    const real = projectSava(ctx, d, sava)
    const north: Array<[Pt, Pt]> = []
    d.routes.forEach((r, ci) => {
      const c = ctx.net.chains[ci]
      const seq = [c.a, ...c.mids, c.b]
      if (seq.every((v) => !ctx.south[v])) {
        north.push(...r.slice(1).map((b, i): [Pt, Pt] => [r[i], b]))
      }
    })
    const southPts = d.pos.filter((_, v) => ctx.south[v])
    const xs = d.pos.map((p) => p.x)
    const [minX, maxX] = [Math.min(...xs) - 120, Math.max(...xs) + 120]
    const window = SPACING * 1.5
    const samples: Array<Pt> = []
    for (let x = minX; x <= maxX; x += GRID) {
      let yN = -Infinity
      for (const [a, b] of north) {
        if (
          Math.max(a.x, b.x) < x - window ||
          Math.min(a.x, b.x) > x + window
        ) {
          continue
        }
        const t =
          a.x === b.x ? 0.5 : Math.max(0, Math.min(1, (x - a.x) / (b.x - a.x)))
        yN = Math.max(
          yN,
          a.y + t * (b.y - a.y),
          Math.abs(a.x - b.x) < 1 ? Math.max(a.y, b.y) : -Infinity
        )
      }
      const yS = Math.min(
        Infinity,
        ...southPts.filter((p) => Math.abs(p.x - x) < window).map((p) => p.y)
      )
      const lo = yN + CLEAR
      const hi = yS - CLEAR
      const want = yAt(real, x)
      samples.push({
        x,
        y: lo > hi ? (yN + yS) / 2 : Math.max(lo, Math.min(hi, want)),
      })
    }
    const smooth = chaikin(smoothY(samples, 4), 3)
    let sideErrors = 0
    ctx.net.stations.forEach((_, i) => {
      if (ctx.south[i] !== d.pos[i].y > yAt(smooth, d.pos[i].x)) {
        sideErrors++
      }
    })
    const dPath = simplify(smooth, 1)
      .map(
        (p, i) => `${i === 0 ? "M" : "L"}${Math.round(p.x)} ${Math.round(p.y)}`
      )
      .join("")
    return { d: dPath, width: BAND, sideErrors }
  }
}

const CLEAR = 30

function smoothY(pts: Array<Pt>, radius: number): Array<Pt> {
  return pts.map((p, i) => {
    const win = pts.slice(Math.max(0, i - radius), i + radius + 1)
    return { x: p.x, y: win.reduce((a, q) => a + q.y, 0) / win.length }
  })
}
