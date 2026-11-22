import type { Network } from "./graph"
import type { BendChoice, Placed, Pt } from "./geometry"
import {
  dist,
  placeStations,
  pointSegDist,
  routeChain,
  segSegDist,
  segmentsTouch,
  turnSteps,
} from "./geometry"

/** Target distance between neighbouring stations, map units (px at 1x). */
export const SPACING = 40
/** Skeleton nodes sit on a grid this fine. */
export const GRID = 20
/** One line's stroke width; a bundle is lines x LINE_W wide. */
export const LINE_W = 5
/** Geist Mono at 12px: advance width per character. */
export const CHAR_W = 7.2

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

/** Map-space geography seen through a fisheye: radius r from the busiest
 * station becomes r^FISHEYE, so the dense centre gets room and the long
 * suburban runs shorten. */
const FISHEYE = 0.75

function fisheye(net: Network): Array<Pt> {
  const hub = net.stations.reduce((best, s) =>
    s.lines.length > best.lines.length ? s : best
  )
  return net.stations.map((s) => {
    const dx = s.gx - hub.gx
    const dy = s.gy - hub.gy
    const r = Math.hypot(dx, dy)
    const k = r === 0 ? 1 : r ** FISHEYE / r
    return { x: dx * k, y: dy * k }
  })
}

export function makeContext(net: Network, south: Array<boolean>): Context {
  const nodeIndex = new Map(net.nodes.map((s, i) => [s, i]))
  const fished = fisheye(net)
  const geoGaps = net.chains
    .map((c) => {
      const [a, b] = [fished[c.a], fished[c.b]]
      return Math.hypot(b.x - a.x, b.y - a.y) / (c.mids.length + 1)
    })
    .toSorted((p, q) => p - q)
  const scale = SPACING / GRID / geoGaps[Math.floor(geoGaps.length / 2)]
  const geoAll = fished.map((p) => ({ x: p.x * scale, y: p.y * scale }))
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

export { pointSegDist, segSegDist, segmentsTouch, turnSteps }
