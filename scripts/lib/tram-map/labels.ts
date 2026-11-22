import type { Context, Drawn } from "./layout"
import { CHAR_W, bundleWidth } from "./layout"
import type { Pt } from "./geometry"

/**
 * Greedy horizontal label placement. Each station tries eight positions
 * around its marker and keeps the cheapest given the labels already placed,
 * every line bundle and every station marker. Stations go in skeleton-first,
 * then chain order, so a chain's labels prefer to stay on one side.
 */

const LABEL_H = 14
const GAP = 5

type Side = "e" | "w" | "n" | "s" | "ne" | "nw" | "se" | "sw"
const SIDES: Array<Side> = ["e", "w", "ne", "nw", "se", "sw", "n", "s"]
const SIDE_COST: Record<Side, number> = {
  e: 0,
  w: 0.05,
  ne: 0.3,
  nw: 0.35,
  se: 0.3,
  sw: 0.35,
  n: 0.5,
  s: 0.5,
}

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

interface Label {
  station: number
  side: Side
  box: Box
}

interface Obstacle {
  a: Pt
  b: Pt
  half: number
}

function labelBox(p: Pt, w: number, reach: number, side: Side): Box {
  const h = LABEL_H
  const d = reach * Math.SQRT1_2
  switch (side) {
    case "e":
      return {
        x0: p.x + reach,
        y0: p.y - h / 2,
        x1: p.x + reach + w,
        y1: p.y + h / 2,
      }
    case "w":
      return {
        x0: p.x - reach - w,
        y0: p.y - h / 2,
        x1: p.x - reach,
        y1: p.y + h / 2,
      }
    case "n":
      return {
        x0: p.x - w / 2,
        y0: p.y - reach - h,
        x1: p.x + w / 2,
        y1: p.y - reach,
      }
    case "s":
      return {
        x0: p.x - w / 2,
        y0: p.y + reach,
        x1: p.x + w / 2,
        y1: p.y + reach + h,
      }
    case "ne":
      return { x0: p.x + d, y0: p.y - d - h, x1: p.x + d + w, y1: p.y - d }
    case "nw":
      return { x0: p.x - d - w, y0: p.y - d - h, x1: p.x - d, y1: p.y - d }
    case "se":
      return { x0: p.x + d, y0: p.y + d, x1: p.x + d + w, y1: p.y + d + h }
    case "sw":
      return { x0: p.x - d - w, y0: p.y + d, x1: p.x - d, y1: p.y + d + h }
    default:
      return { x0: p.x, y0: p.y, x1: p.x, y1: p.y }
  }
}

/** Cost of a label that sits as close to another station as to its own. */
const AMBIGUOUS = 40

const boxDist = (b: Box, p: Pt) =>
  Math.hypot(
    Math.max(b.x0 - p.x, 0, p.x - b.x1),
    Math.max(b.y0 - p.y, 0, p.y - b.y1)
  )

const overlapArea = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
  Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))

/** Length of segment a-b inside box grown by half (Liang-Barsky clip). */
function segmentInBox(a: Pt, b: Pt, half: number, box: Box): number {
  const [x0, y0, x1, y1] = [
    box.x0 - half,
    box.y0 - half,
    box.x1 + half,
    box.y1 + half,
  ]
  const dx = b.x - a.x
  const dy = b.y - a.y
  let t0 = 0
  let t1 = 1
  const clip = (p: number, q: number) => {
    if (p === 0) {
      return q >= 0
    }
    const r = q / p
    if (p < 0) {
      t0 = Math.max(t0, r)
    } else {
      t1 = Math.min(t1, r)
    }
    return t0 <= t1
  }
  if (
    clip(-dx, a.x - x0) &&
    clip(dx, x1 - a.x) &&
    clip(-dy, a.y - y0) &&
    clip(dy, y1 - a.y)
  ) {
    return (t1 - t0) * Math.hypot(dx, dy) + 1
  }
  return 0
}

function obstaclesOf(ctx: Context, d: Drawn): Array<Obstacle> {
  return d.routes.flatMap((r, ci) =>
    r.slice(1).map((b, i) => ({
      a: r[i],
      b,
      half: bundleWidth(ctx.net.chains[ci].lines.length) / 2 + 2,
    }))
  )
}

function placementOrder(
  ctx: Context
): Array<{ station: number; prev: number | null }> {
  const out: Array<{ station: number; prev: number | null }> =
    ctx.net.nodes.map((s) => ({ station: s, prev: null }))
  for (const c of ctx.net.chains) {
    out.push(
      ...c.mids.map((m, i) => ({
        station: m,
        prev: i === 0 ? null : c.mids[i - 1],
      }))
    )
  }
  return out
}

export interface LabelResult {
  labels: Array<Label>
  overlap: number
  preference: number
}

export function placeLabels(
  ctx: Context,
  d: Drawn,
  reachOf: (station: number) => number
): LabelResult {
  const obstacles = obstaclesOf(ctx, d)
  const markers: Array<Box> = d.pos.map((p) => ({
    x0: p.x - 4,
    y0: p.y - 4,
    x1: p.x + 4,
    y1: p.y + 4,
  }))
  const placed: Array<Label> = []
  const sideOf = new Map<number, Side>()
  let overlap = 0
  let preference = 0
  for (const { station, prev } of placementOrder(ctx)) {
    const p = d.pos[station]
    const w = ctx.net.stations[station].name.length * CHAR_W
    const reach = reachOf(station) + GAP
    let best = {
      cost: Infinity,
      side: "e" as Side,
      box: labelBox(p, w, reach, "e"),
      hit: 0,
    }
    for (const side of SIDES) {
      const box = labelBox(p, w, reach, side)
      let hit = 0
      for (const o of obstacles) {
        if (
          Math.max(o.a.x, o.b.x) + o.half < box.x0 ||
          Math.min(o.a.x, o.b.x) - o.half > box.x1
        ) {
          continue
        }
        hit += segmentInBox(o.a, o.b, o.half, box) * 4
      }
      const padded = {
        x0: box.x0 - 10,
        y0: box.y0 - 2,
        x1: box.x1 + 10,
        y1: box.y1 + 2,
      }
      for (const l of placed) {
        hit += overlapArea(l.box, padded) / 4
      }
      const own = boxDist(box, p)
      markers.forEach((m, v) => {
        if (v !== station) {
          hit += overlapArea(m, box)
          if (boxDist(box, d.pos[v]) < own + 6) {
            hit += AMBIGUOUS
          }
        }
      })
      const consistency = prev !== null && sideOf.get(prev) !== side ? 0.4 : 0
      const cost = hit + SIDE_COST[side] + consistency
      if (cost < best.cost) {
        best = { cost, side, box, hit }
      }
    }
    placed.push({ station, side: best.side, box: best.box })
    sideOf.set(station, best.side)
    overlap += best.hit
    preference += best.cost - best.hit
  }
  return { labels: placed, overlap, preference }
}
