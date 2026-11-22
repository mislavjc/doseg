import type { Context, Drawn } from "./layout"
import { LINE_W, bundleWidth, dirOf } from "./layout"
import type { Pt } from "./geometry"
import { dist } from "./geometry"

/**
 * Line bundling: per chain, the left-to-right order of its lines, decided by
 * where each pair of lines eventually splits (the line that turns right at
 * the split runs on the right), then each line drawn as one offset polyline
 * with concentric rounded corners.
 */

const CORNER_R = 22

type Step = { chain: number; forward: boolean }

const travelRoute = (d: Drawn, s: Step) =>
  s.forward ? d.routes[s.chain] : d.routes[s.chain].toReversed()

function signedTurn(din: Pt, dout: Pt): number {
  return Math.atan2(
    din.x * dout.y - din.y * dout.x,
    din.x * dout.x + din.y * dout.y
  )
}

/** Positive when line l1 should run right of l2 on chain ci, walking a to b. */
function compareLines(
  ctx: Context,
  d: Drawn,
  ci: number,
  l1: string,
  l2: string
): number {
  const list1 = ctx.net.lineChains.get(l1) ?? []
  const list2 = ctx.net.lineChains.get(l2) ?? []
  const i1 = list1.findIndex((s) => s.chain === ci)
  const i2 = list2.findIndex((s) => s.chain === ci)
  for (const ahead of [true, false]) {
    const step1 = (k: number) => (list1[i1].forward === ahead ? k + 1 : k - 1)
    const step2 = (k: number) => (list2[i2].forward === ahead ? k + 1 : k - 1)
    const flip1 = list1[i1].forward === ahead
    const flip2 = list2[i2].forward === ahead
    let [k1, k2] = [step1(i1), step2(i2)]
    let prev: Step = { chain: ci, forward: ahead }
    while (k1 >= 0 && k1 < list1.length && k2 >= 0 && k2 < list2.length) {
      const s1 = flip1
        ? list1[k1]
        : { ...list1[k1], forward: !list1[k1].forward }
      const s2 = flip2
        ? list2[k2]
        : { ...list2[k2], forward: !list2[k2].forward }
      if (s1.chain !== s2.chain || s1.forward !== s2.forward) {
        const din = dirOf(travelRoute(d, prev), false)
        const t1 = signedTurn(din, dirOf(travelRoute(d, s1), true))
        const t2 = signedTurn(din, dirOf(travelRoute(d, s2), true))
        const sign = Math.sign(t1 - t2)
        return ahead ? sign : -sign
      }
      prev = s1
      k1 = step1(k1)
      k2 = step2(k2)
    }
  }
  return Number(l2) - Number(l1) > 0 ? 1 : -1
}

/** Offset of each line on each chain, along the chain's right-hand normal. */
export function lineOffsets(
  ctx: Context,
  d: Drawn
): Array<Map<string, number>> {
  return ctx.net.chains.map((c, ci) => {
    const order = c.lines.toSorted((p, q) => -compareLines(ctx, d, ci, p, q))
    const n = order.length
    return new Map(order.map((l, i) => [l, ((n - 1) / 2 - i) * LINE_W]))
  })
}

interface Vertex {
  p: Pt
  off: number
}

const rightNormal = (u: Pt): Pt => ({ x: -u.y, y: u.x })
const unit = (a: Pt, b: Pt): Pt => {
  const l = dist(a, b) || 1
  return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
}

function joinAt(v: Pt, u: Pt, w: Pt, o1: number, o2: number): Array<Vertex> {
  const n1 = rightNormal(u)
  const n2 = rightNormal(w)
  const crossUW = u.x * w.y - u.y * w.x
  if (Math.abs(crossUW) < 1e-9) {
    if (Math.abs(o1 - o2) < 1e-6) {
      return [{ p: { x: v.x + n1.x * o1, y: v.y + n1.y * o1 }, off: o1 }]
    }
    const j = Math.abs(o1 - o2) / 2
    return [
      {
        p: { x: v.x + n1.x * o1 - u.x * j, y: v.y + n1.y * o1 - u.y * j },
        off: 0,
      },
      {
        p: { x: v.x + n2.x * o2 + u.x * j, y: v.y + n2.y * o2 + u.y * j },
        off: 0,
      },
    ]
  }
  const a = { x: v.x + n1.x * o1, y: v.y + n1.y * o1 }
  const b = { x: v.x + n2.x * o2, y: v.y + n2.y * o2 }
  const t = ((b.x - a.x) * w.y - (b.y - a.y) * w.x) / crossUW
  return [{ p: { x: a.x + u.x * t, y: a.y + u.y * t }, off: (o1 + o2) / 2 }]
}

function lineVertices(
  d: Drawn,
  steps: Array<Step>,
  offsets: Array<Map<string, number>>,
  broj: string
) {
  const segs: Array<{ a: Pt; b: Pt; off: number }> = []
  for (const s of steps) {
    const r = travelRoute(d, s)
    const o = (offsets[s.chain].get(broj) ?? 0) * (s.forward ? 1 : -1)
    for (let i = 1; i < r.length; i++) {
      segs.push({ a: r[i - 1], b: r[i], off: o })
    }
  }
  if (segs.length === 0) {
    return []
  }
  const first = segs[0]
  const n0 = rightNormal(unit(first.a, first.b))
  const out: Array<Vertex> = [
    {
      p: { x: first.a.x + n0.x * first.off, y: first.a.y + n0.y * first.off },
      off: first.off,
    },
  ]
  for (let i = 1; i < segs.length; i++) {
    out.push(
      ...joinAt(
        segs[i].a,
        unit(segs[i - 1].a, segs[i - 1].b),
        unit(segs[i].a, segs[i].b),
        segs[i - 1].off,
        segs[i].off
      )
    )
  }
  const last = segs.at(-1) ?? first
  const nl = rightNormal(unit(last.a, last.b))
  out.push({
    p: { x: last.b.x + nl.x * last.off, y: last.b.y + nl.y * last.off },
    off: last.off,
  })
  return out
}

const f = (n: number) => Math.round(n * 10) / 10

/** SVG path through the vertices with concentric arcs at every corner. */
export function roundedPath(vs: Array<Vertex>): string {
  if (vs.length === 0) {
    return ""
  }
  const parts = [`M${f(vs[0].p.x)} ${f(vs[0].p.y)}`]
  for (let i = 1; i < vs.length - 1; i++) {
    const [a, v, b] = [vs[i - 1].p, vs[i].p, vs[i + 1].p]
    const u = unit(a, v)
    const w = unit(v, b)
    const turn = signedTurn(u, w)
    if (Math.abs(turn) < 1e-3) {
      continue
    }
    const tanHalf = Math.tan(Math.abs(turn) / 2)
    let r = Math.max(3, CORNER_R - vs[i].off * Math.sign(turn))
    const t = Math.min(r * tanHalf, dist(a, v) / 2, dist(v, b) / 2)
    r = t / tanHalf
    parts.push(
      `L${f(v.x - u.x * t)} ${f(v.y - u.y * t)}`,
      `A${f(r)} ${f(r)} 0 0 ${turn > 0 ? 1 : 0} ${f(v.x + w.x * t)} ${f(v.y + w.y * t)}`
    )
  }
  const end = vs.at(-1)?.p ?? vs[0].p
  parts.push(`L${f(end.x)} ${f(end.y)}`)
  return parts.join("")
}

export function linePaths(
  ctx: Context,
  d: Drawn,
  offsets: Array<Map<string, number>>
) {
  return ctx.net.routes.map((r) => {
    const steps = ctx.net.lineChains.get(r.broj) ?? []
    const offs = r.isNight
      ? offsets.map(() => new Map<string, number>())
      : offsets
    return {
      broj: r.broj,
      isNight: r.isNight,
      d: roundedPath(lineVertices(d, steps, offs, r.broj)),
    }
  })
}

export { bundleWidth }
