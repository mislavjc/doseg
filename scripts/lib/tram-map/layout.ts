import type { Network } from "./graph"
import type { BendChoice, Placed, Pt } from "./geometry"
import { dist, placeStations, routeChain, segmentsTouch } from "./geometry"

/** Target distance between neighbouring stations, map units (px at 1x). */
export const SPACING = 48
/** Skeleton nodes sit on a grid this fine. */
export const GRID = 20
/** One line's stroke width; a bundle is lines x LINE_W wide. */
export const LINE_W = 5

export interface State {
  /** Grid coordinates per skeleton node, parallel to network.nodes. */
  x: Int32Array
  y: Int32Array
  bend: Array<BendChoice>
  /**
   * The Sava as [west row, east row, grid column of the step]: horizontal at
   * the west row, a 45-degree step at the column, then horizontal at the east
   * row. North-bank stations stay above it, south-bank stations below.
   */
  river: [number, number, number]
}

/** The river's grid row at grid column x. */
export function riverRow(river: [number, number, number], x: number): number {
  const [west, east, step] = river
  const dir = Math.sign(east - west)
  const t = x - step
  if (t <= 0) {
    return west
  }
  return Math.abs(t) >= Math.abs(east - west) ? east : west + dir * t
}

export interface Drawn {
  routes: Array<Array<Pt>>
  placed: Array<Placed>
  pos: Array<Pt>
}

export interface Context {
  net: Network
  nodeIndex: Map<number, number>
  /** Fitted geographic position per skeleton node, grid units. */
  geo: Array<Pt>
  /** Fitted geographic position per station, grid units. */
  geoAll: Array<Pt>
  /** Per station: on the south bank of the Sava. */
  south: Array<boolean>
  /** Chain pairs whose tracks really cross without a shared stop ("i|j"). */
  realCrossings: Set<string>
}

function geoCrossings(net: Network): Set<string> {
  const out = new Set<string>()
  const poly = net.chains.map((c) =>
    [c.a, ...c.mids, c.b].map((v) => ({
      x: net.stations[v].gx,
      y: net.stations[v].gy,
    }))
  )
  for (let i = 0; i < poly.length; i++) {
    for (let j = i + 1; j < poly.length; j++) {
      const [ci, cj] = [net.chains[i], net.chains[j]]
      if (ci.a === cj.a || ci.a === cj.b || ci.b === cj.a || ci.b === cj.b) {
        continue
      }
      const hit = poly[i].some(
        (p, k) =>
          k > 0 &&
          poly[j].some(
            (q, m) =>
              m > 0 && segmentsTouch(poly[i][k - 1], p, poly[j][m - 1], q)
          )
      )
      if (hit) {
        out.add(`${i}|${j}`)
      }
    }
  }
  return out
}

/**
 * The geography the layout is held to: a blend of two views of the real
 * stop positions, each normalised to a median stop gap of 1. The fisheye
 * maps radius r from the busiest station to r^FISHEYE, so the dense centre
 * gets a little room. The evened view walks the network outward from the
 * same station and shortens every stop gap of length l to l^EVEN while
 * keeping its real bearing, so long suburban gaps (the Gračani spur) shrink
 * most and spacing comes out more even, without bending any line.
 */
const FISHEYE = 0.8
const EVEN = 0.4
const EVEN_BLEND = 0.75

const hubOf = (net: Network) =>
  net.stations.reduce(
    (best, s, i) =>
      s.lines.length > net.stations[best].lines.length ? i : best,
    0
  )

function fisheye(net: Network, hub: number): Array<Pt> {
  const h = net.stations[hub]
  return net.stations.map((s) => {
    const dx = s.gx - h.gx
    const dy = s.gy - h.gy
    const r = Math.hypot(dx, dy)
    const k = r === 0 ? 1 : r ** FISHEYE / r
    return { x: dx * k, y: dy * k }
  })
}

function evened(net: Network, hub: number): Array<Pt> {
  const adj = new Map<number, Set<number>>()
  for (const r of net.routes) {
    r.stations.forEach((v, i) => {
      const u = r.stations[i - 1]
      if (u !== undefined) {
        adj.set(u, (adj.get(u) ?? new Set()).add(v))
        adj.set(v, (adj.get(v) ?? new Set()).add(u))
      }
    })
  }
  const pos = new Map<number, Pt>([[hub, { x: 0, y: 0 }]])
  const queue = [hub]
  for (let qi = 0; qi < queue.length; qi++) {
    const v = queue[qi]
    const pv = pos.get(v) ?? { x: 0, y: 0 }
    for (const u of adj.get(v) ?? []) {
      if (pos.has(u)) {
        continue
      }
      const dx = net.stations[u].gx - net.stations[v].gx
      const dy = net.stations[u].gy - net.stations[v].gy
      const l = Math.hypot(dx, dy)
      const k = l === 0 ? 0 : l ** EVEN / l
      pos.set(u, { x: pv.x + dx * k, y: pv.y + dy * k })
      queue.push(u)
    }
  }
  return net.stations.map((_, i) => pos.get(i) ?? { x: 0, y: 0 })
}

function medianGap(net: Network, pts: Array<Pt>) {
  const gaps = net.chains
    .map((c) => {
      const [a, b] = [pts[c.a], pts[c.b]]
      return Math.hypot(b.x - a.x, b.y - a.y) / (c.mids.length + 1)
    })
    .toSorted((p, q) => p - q)
  return gaps[Math.floor(gaps.length / 2)]
}

function reference(net: Network): Array<Pt> {
  const hub = hubOf(net)
  const views = [fisheye(net, hub), evened(net, hub)].map((pts) => {
    const k = 1 / medianGap(net, pts)
    return pts.map((p) => ({ x: p.x * k, y: p.y * k }))
  })
  return views[0].map((f, i) => ({
    x: f.x * (1 - EVEN_BLEND) + views[1][i].x * EVEN_BLEND,
    y: f.y * (1 - EVEN_BLEND) + views[1][i].y * EVEN_BLEND,
  }))
}

export function makeContext(net: Network, south: Array<boolean>): Context {
  const nodeIndex = new Map(net.nodes.map((s, i) => [s, i]))
  const ref = reference(net)
  const scale = SPACING / GRID / medianGap(net, ref)
  const geoAll = ref.map((p) => ({ x: p.x * scale, y: p.y * scale }))
  const geo = net.nodes.map((s) => geoAll[s])
  return {
    net,
    nodeIndex,
    geo,
    geoAll,
    south,
    realCrossings: geoCrossings(net),
  }
}

export function initialState(ctx: Context): State {
  const n = ctx.net.nodes.length
  const x = new Int32Array(n)
  const y = new Int32Array(n)
  const taken = new Set<string>()
  ctx.geo.forEach((g, i) => {
    let gx = Math.round(g.x)
    const gy = Math.round(g.y)
    while (taken.has(`${gx},${gy}`)) {
      gx += 1
    }
    taken.add(`${gx},${gy}`)
    x[i] = gx
    y[i] = gy
  })
  const ys = ctx.geoAll.map((p) => p.y)
  let river = 0
  let fewest = Infinity
  for (
    let r = Math.floor(Math.min(...ys));
    r <= Math.ceil(Math.max(...ys));
    r++
  ) {
    const wrong = ys.filter((v, i) => (ctx.south[i] ? v < r : v > r)).length
    if (wrong < fewest) {
      ;[river, fewest] = [r, wrong]
    }
  }
  const mid = Math.round((Math.min(...x) + Math.max(...x)) / 2)
  return { x, y, bend: ctx.net.chains.map(() => 0), river: [river, river, mid] }
}

export function draw(ctx: Context, s: State): Drawn {
  const { net, nodeIndex } = ctx
  const pos: Array<Pt> = net.stations.map(() => ({ x: 0, y: 0 }))
  const nodePt = (station: number): Pt => {
    const i = nodeIndex.get(station) ?? 0
    return { x: s.x[i] * GRID, y: s.y[i] * GRID }
  }
  for (const v of net.nodes) {
    pos[v] = nodePt(v)
  }
  const routes = net.chains.map((c, ci) =>
    routeChain(nodePt(c.a), nodePt(c.b), s.bend[ci])
  )
  const placed = net.chains.map((c, ci) => {
    const p = placeStations(routes[ci], c.mids.length)
    c.mids.forEach((m, k) => {
      pos[m] = p.points[k]
    })
    return p
  })
  return { routes, placed, pos }
}

export const bundleWidth = (lines: number) => Math.max(1, lines) * LINE_W

export function dirOf(route: Array<Pt>, atStart: boolean): Pt {
  const [a, b] = atStart
    ? [route[0], route[1]]
    : [route.at(-2) ?? route[0], route.at(-1) ?? route[0]]
  const l = dist(a, b) || 1
  return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
}
