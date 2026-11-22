import type { Context, Drawn, State } from "./layout"
import {
  GRID,
  LINE_W,
  SPACING,
  bundleWidth,
  dirOf,
  draw,
  riverRow,
} from "./layout"
import type { LabelResult } from "./labels"
import { placeLabels } from "./labels"
import type { Pt } from "./geometry"
import { pointSegDist, segSegDist, segmentsTouch, turnSteps } from "./geometry"

/**
 * The weighted layout objective. Every term is a penalty, lower is better.
 * Topology is not scored: the drawing is built from the GTFS topology, so a
 * wrong order or a missing stop cannot be produced, only checked (validate.ts).
 */

const WEIGHTS = {
  spacing: 6,
  tooClose: 400,
  bend: 6,
  jog: 150,
  turn: 4,
  crossing: 2000,
  clearance: 300,
  direction: 60,
  geography: 300,
  displacement: 400,
  aspect: 3000,
  heading: 40,
  rotation: 60,
  labelOverlap: 4,
  labelSide: 4,
  river: 300,
}

export type Breakdown = Record<keyof typeof WEIGHTS, number> & { total: number }

/** Cost of a line turning by n x 45 degrees at a skeleton node. */
const TURN_COST = [0, 1, 4, 40, 400]

interface Seg {
  a: Pt
  b: Pt
  chain: number
  w: number
}

function spacingTerms(ctx: Context, d: Drawn) {
  let spacing = 0
  let tooClose = 0
  ctx.net.chains.forEach((_, ci) => {
    for (const g of d.placed[ci].gaps) {
      const r = (g - SPACING) / SPACING
      spacing += r < 0 ? 4 * r * r : 2 * r * r
      if (g < 0.9 * SPACING) {
        tooClose += ((0.9 * SPACING - g) / SPACING) ** 2 + 0.05
      }
    }
  })
  return { spacing, tooClose }
}

function turnTerms(ctx: Context, d: Drawn) {
  let turn = 0
  for (const list of ctx.net.lineChains.values()) {
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]
      const next = list[i]
      const din = prev.forward
        ? dirOf(d.routes[prev.chain], false)
        : neg(dirOf(d.routes[prev.chain], true))
      const dout = next.forward
        ? dirOf(d.routes[next.chain], true)
        : neg(dirOf(d.routes[next.chain], false))
      turn += TURN_COST[turnSteps(din, dout)]
    }
  }
  return turn
}

const neg = (p: Pt): Pt => ({ x: -p.x, y: -p.y })

/** A bent chain whose short leg is under JOG_MIN reads as a jog, not a turn. */
const JOG_MIN = 0.8 * SPACING

function jogTerm(d: Drawn) {
  let jog = 0
  for (const r of d.routes) {
    for (let i = 1; i < r.length && r.length > 2; i++) {
      const leg = Math.hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y)
      if (leg > 0.5 && leg < JOG_MIN) {
        jog += ((JOG_MIN - leg) / SPACING) ** 2 + 0.2
      }
    }
  }
  return jog
}

function segmentsOf(ctx: Context, d: Drawn): Array<Seg> {
  return d.routes.flatMap((r, ci) =>
    r.slice(1).map((b, i) => ({
      a: r[i],
      b,
      chain: ci,
      w: bundleWidth(ctx.net.chains[ci].lines.length),
    }))
  )
}

function crossingTerms(ctx: Context, d: Drawn, segs: Array<Seg>) {
  let crossing = 0
  let clearance = 0
  const chains = ctx.net.chains
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const [s, t] = [segs[i], segs[j]]
      if (s.chain === t.chain) {
        continue
      }
      const [cs, ct] = [chains[s.chain], chains[t.chain]]
      const shared =
        cs.a === ct.a || cs.a === ct.b || cs.b === ct.a || cs.b === ct.b
      if (
        ctx.realCrossings.has(
          `${Math.min(s.chain, t.chain)}|${Math.max(s.chain, t.chain)}`
        )
      ) {
        continue
      }
      if (segmentsTouch(s.a, s.b, t.a, t.b)) {
        crossing += 1
        continue
      }
      if (!shared) {
        const need = (s.w + t.w) / 2 + 12
        const gap = segSegDist(s.a, s.b, t.a, t.b)
        if (gap < need) {
          clearance += ((need - gap) / SPACING) ** 2 + 0.1
        }
      }
    }
  }
  d.pos.forEach((p, v) => {
    for (const s of segs) {
      const c = chains[s.chain]
      if (c.a === v || c.b === v || c.mids.includes(v)) {
        continue
      }
      const need = s.w / 2 + 14
      const gap = pointSegDist(p, s.a, s.b)
      if (gap < need) {
        clearance += ((need - gap) / SPACING) ** 2 + 0.1
      }
    }
  })
  return { crossing, clearance }
}

function geoTerms(ctx: Context, d: Drawn) {
  let direction = 0
  ctx.net.chains.forEach((c, ci) => {
    const [ga, gb] = [ctx.net.stations[c.a], ctx.net.stations[c.b]]
    const gv = { x: gb.gx - ga.gx, y: gb.gy - ga.gy }
    const r = d.routes[ci]
    const dv = {
      x: (r.at(-1)?.x ?? 0) - r[0].x,
      y: (r.at(-1)?.y ?? 0) - r[0].y,
    }
    const cos =
      (gv.x * dv.x + gv.y * dv.y) /
      ((Math.hypot(gv.x, gv.y) || 1) * (Math.hypot(dv.x, dv.y) || 1))
    direction += 1 - cos + (cos < 0.5 ? 4 * (0.5 - cos) : 0)
  })
  return { direction, ...fidelityTerms(ctx, d) }
}

const span = (pts: Array<Pt>, axis: "x" | "y") =>
  Math.max(...pts.map((p) => p[axis])) - Math.min(...pts.map((p) => p[axis]))

/** Furthest a station may sit from its fitted real position, in SPACINGs. */
const MAX_DISPLACEMENT = 2

/**
 * Geographic fidelity of every station. The real positions are fitted onto
 * the drawing with one uniform scale and a translation (no stretch, no
 * rotation), so the map may grow or shift but keeps Zagreb's west-east
 * shape. geography is the mean squared residual, displacement the excess
 * over MAX_DISPLACEMENT, aspect the log drift of the bounding box's
 * proportions, heading how far each track between neighbouring stations
 * turns away from its real bearing beyond the 22.5 degrees octilinear
 * drawing has to give up.
 */
function fidelityTerms(ctx: Context, d: Drawn) {
  const geo = ctx.geoAll
  const n = d.pos.length
  let [gx, gy, px, py] = [0, 0, 0, 0]
  for (let i = 0; i < n; i++) {
    gx += geo[i].x
    gy += geo[i].y
    px += d.pos[i].x
    py += d.pos[i].y
  }
  ;[gx, gy, px, py] = [gx / n, gy / n, px / n, py / n]
  let [num, den] = [0, 0]
  for (let i = 0; i < n; i++) {
    const [ax, ay] = [geo[i].x - gx, geo[i].y - gy]
    num += ax * (d.pos[i].x - px) + ay * (d.pos[i].y - py)
    den += ax * ax + ay * ay
  }
  const k = num / (den || 1)
  let geography = 0
  let displacement = 0
  for (let i = 0; i < n; i++) {
    const rx = d.pos[i].x - px - k * (geo[i].x - gx)
    const ry = d.pos[i].y - py - k * (geo[i].y - gy)
    const r = Math.hypot(rx, ry) / SPACING
    geography += r * r
    if (r > MAX_DISPLACEMENT) {
      displacement += (r - MAX_DISPLACEMENT) ** 2 + 0.2
    }
  }
  const aspect =
    Math.log(
      span(d.pos, "x") /
        (span(d.pos, "y") || 1) /
        (span(geo, "x") / (span(geo, "y") || 1))
    ) ** 2
  let heading = 0
  for (const r of ctx.net.routes) {
    if (r.isNight) {
      continue
    }
    for (let i = 1; i < r.stations.length; i++) {
      const [a, b] = [r.stations[i - 1], r.stations[i]]
      const drawn = Math.atan2(d.pos[b].y - d.pos[a].y, d.pos[b].x - d.pos[a].x)
      const real = Math.atan2(geo[b].y - geo[a].y, geo[b].x - geo[a].x)
      const turn = Math.abs(
        Math.atan2(Math.sin(drawn - real), Math.cos(drawn - real))
      )
      heading += Math.max(0, turn - Math.PI / 8) ** 2
    }
  }
  return { geography: geography / n, displacement, aspect, heading }
}

/** Incident chains around each node must keep their geographic cyclic order. */
function rotationTerm(ctx: Context, d: Drawn) {
  const { net } = ctx
  const around = new Map<number, Array<{ drawn: number; geo: number }>>()
  net.chains.forEach((c, ci) => {
    const seq = [c.a, ...c.mids, c.b]
    for (const [end, next, start] of [
      [c.a, seq[1], true],
      [c.b, seq.at(-2) ?? c.a, false],
    ] as const) {
      const dv = start
        ? dirOf(d.routes[ci], true)
        : neg(dirOf(d.routes[ci], false))
      const [p, q] = [net.stations[end], net.stations[next]]
      const list = around.get(end) ?? []
      list.push({
        drawn: Math.atan2(dv.y, dv.x),
        geo: Math.atan2(q.gy - p.gy, q.gx - p.gx),
      })
      around.set(end, list)
    }
  })
  let bad = 0
  for (const list of around.values()) {
    if (list.length < 3) {
      continue
    }
    const byGeo = list.toSorted((p, q) => p.geo - q.geo)
    const order = byGeo.map((e) => e.drawn)
    let descents = 0
    for (let i = 0; i < order.length; i++) {
      if (order[(i + 1) % order.length] < order[i]) {
        descents++
      }
    }
    bad += descents - 1
  }
  return bad
}

/** How far a label must sit from its station centre to clear the bundle. */
const labelReach = (ctx: Context) => (station: number) =>
  (ctx.net.stations[station].lines.filter((l) => Number(l) < 30).length *
    LINE_W) /
    2 +
  3

export function labelsFor(ctx: Context, s: State): LabelResult {
  return placeLabels(ctx, draw(ctx, s), labelReach(ctx))
}

/** Keep every north-bank station and track above the Sava row, every south-bank station below it. */
const RIVER_CLEAR = 30

function riverTerm(ctx: Context, d: Drawn, s: State) {
  const miss = (p: Pt, south: boolean) => {
    const level = riverRow(s.river, p.x / GRID) * GRID
    const y = p.y
    const over = south ? level + RIVER_CLEAR - y : y - (level - RIVER_CLEAR)
    return over > 0 ? (over / SPACING) ** 2 + 0.2 : 0
  }
  let bad = 0
  d.pos.forEach((p, v) => {
    bad += miss(p, ctx.south[v])
  })
  ctx.net.chains.forEach((c, ci) => {
    const south = ctx.south[c.a] && ctx.south[c.b]
    if (ctx.south[c.a] === ctx.south[c.b]) {
      for (const p of d.routes[ci]) {
        bad += miss(p, south)
      }
    }
  })
  return bad
}

export function score(ctx: Context, s: State): Breakdown {
  const d = draw(ctx, s)
  const segs = segmentsOf(ctx, d)
  const labels = placeLabels(ctx, d, labelReach(ctx))
  const raw = {
    labelOverlap: labels.overlap,
    labelSide: labels.preference,
    ...spacingTerms(ctx, d),
    bend: d.routes.reduce(
      (n, r, ci) =>
        n + (r.length > 2 ? 1 + 0.3 * ctx.net.chains[ci].lines.length : 0),
      0
    ),
    jog: jogTerm(d),
    turn: turnTerms(ctx, d),
    ...crossingTerms(ctx, d, segs),
    ...geoTerms(ctx, d),
    rotation: rotationTerm(ctx, d),
    river: riverTerm(ctx, d, s),
  }
  const weighted = { ...raw, total: 0 }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.keys of the WEIGHTS literal is exactly its key union
  for (const key of Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>) {
    weighted[key] = raw[key] * WEIGHTS[key]
    weighted.total += weighted[key]
  }
  return weighted
}
