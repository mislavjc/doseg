/**
 * Octilinear geometry for the schematic: chain routing between skeleton
 * nodes, even station spacing along a route, and the segment tests the
 * objective uses.
 */

export interface Pt {
  x: number
  y: number
}

/** 0 = straight or "diagonal first", 1 = "axis first" for one-bend routes. */
export type BendChoice = 0 | 1

export function routeChain(p: Pt, q: Pt, choice: BendChoice): Array<Pt> {
  const dx = q.x - p.x
  const dy = q.y - p.y
  if (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) {
    return [p, q]
  }
  const m = Math.min(Math.abs(dx), Math.abs(dy))
  const d = { x: Math.sign(dx) * m, y: Math.sign(dy) * m }
  const corner =
    choice === 0
      ? { x: p.x + d.x, y: p.y + d.y }
      : { x: q.x - d.x, y: q.y - d.y }
  return [p, corner, q]
}

export const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y)

const lerp = (a: Pt, b: Pt, t: number): Pt => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

export interface Placed {
  points: Array<Pt>
  /** Distance along the route between consecutive stations, ends included. */
  gaps: Array<number>
}

/**
 * Space k stations along a one- or two-segment route. On a bent route the
 * stations split between the legs so that neither sits on the corner and
 * the two legs' spacing is as even as possible.
 */
export function placeStations(route: Array<Pt>, k: number): Placed {
  if (route.length === 2) {
    const gap = dist(route[0], route[1]) / (k + 1)
    const points = Array.from({ length: k }, (_, i) =>
      lerp(route[0], route[1], (i + 1) / (k + 1))
    )
    return { points, gaps: Array.from({ length: k + 1 }, () => gap) }
  }
  const [p, c, q] = route
  const l1 = dist(p, c)
  const l2 = dist(c, q)
  let best = { n1: 0, err: Infinity }
  for (let n1 = 0; n1 <= k; n1++) {
    const g1 = l1 / (n1 + 0.5)
    const g2 = l2 / (k - n1 + 0.5)
    const err = Math.abs(g1 - g2)
    if (err < best.err) {
      best = { n1, err }
    }
  }
  const n1 = best.n1
  const n2 = k - n1
  const g1 = l1 / (n1 + 0.5)
  const g2 = l2 / (n2 + 0.5)
  const points = [
    ...Array.from({ length: n1 }, (_, i) => lerp(p, c, ((i + 1) * g1) / l1)),
    ...Array.from({ length: n2 }, (_, i) =>
      lerp(c, q, (l2 - (n2 - i) * g2) / l2)
    ),
  ]
  const gaps = [
    ...Array.from({ length: n1 }, () => g1),
    (g1 + g2) / 2,
    ...Array.from({ length: n2 }, () => g2),
  ]
  return { points, gaps }
}

const overlap = (u: number, v: number, s: number, t: number) =>
  Math.min(Math.max(u, v), Math.max(s, t)) -
  Math.max(Math.min(u, v), Math.min(s, t))

const cross = (o: Pt, a: Pt, b: Pt) =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

/** Proper intersection or collinear overlap of two segments. */
export function segmentsTouch(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(c, d, a)
  const d2 = cross(c, d, b)
  const d3 = cross(a, b, c)
  const d4 = cross(a, b, d)
  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true
  }
  if (d1 === 0 && d2 === 0) {
    return (
      overlap(a.x, b.x, c.x, d.x) > 1e-6 || overlap(a.y, b.y, c.y, d.y) > 1e-6
    )
  }
  return false
}

export function pointSegDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t =
    len2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

export function segSegDist(a: Pt, b: Pt, c: Pt, d: Pt): number {
  if (segmentsTouch(a, b, c, d)) {
    return 0
  }
  return Math.min(
    pointSegDist(a, c, d),
    pointSegDist(b, c, d),
    pointSegDist(c, a, b),
    pointSegDist(d, a, b)
  )
}

/** Unsigned turn between two direction vectors, in 45-degree steps (0-4). */
export function turnSteps(din: Pt, dout: Pt): number {
  const a = Math.atan2(din.y, din.x)
  const b = Math.atan2(dout.y, dout.x)
  let d = Math.abs(b - a)
  if (d > Math.PI) {
    d = 2 * Math.PI - d
  }
  return Math.round(d / (Math.PI / 4))
}
