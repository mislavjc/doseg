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
import type { Breakdown } from "./score"
import { labelsFor } from "./score"
import type { Pt } from "./geometry"
import { dist } from "./geometry"
import { linePaths, lineOffsets } from "./bundles"
import type { RiverResult } from "./river"
import type {
  TramMapLayout,
  TramMapMark,
  TramMapStationLayout,
} from "@/lib/tram-map-layout"
import type { TramMapNetwork } from "@/lib/generated/TramMapNetwork"

const TICK = 5
const r1 = (n: number) => Math.round(n * 10) / 10

/** Direction of the drawn route at a chain's k-th mid station. */
function midDirection(d: Drawn, ci: number, at: Pt): Pt {
  const r = d.routes[ci]
  let best = { dd: Infinity, a: r[0], b: r[1] }
  for (let i = 1; i < r.length; i++) {
    const mid = { x: (r[i - 1].x + r[i].x) / 2, y: (r[i - 1].y + r[i].y) / 2 }
    const len = dist(r[i - 1], r[i])
    const dd = Math.max(0, dist(mid, at) - len / 2)
    if (dd < best.dd) {
      best = { dd, a: r[i - 1], b: r[i] }
    }
  }
  const l = dist(best.a, best.b) || 1
  return { x: (best.b.x - best.a.x) / l, y: (best.b.y - best.a.y) / l }
}

function tickMark(
  p: Pt,
  u: Pt,
  lines: Map<string, number>,
  toward: Pt
): TramMapMark {
  const n = { x: -u.y, y: u.x }
  const side = (toward.x - p.x) * n.x + (toward.y - p.y) * n.y >= 0 ? 1 : -1
  const half = bundleWidth(lines.size) / 2
  const entries = [...lines.entries()].toSorted((a, b) => (b[1] - a[1]) * side)
  return {
    x1: r1(p.x + n.x * side * (half - 0.5)),
    y1: r1(p.y + n.y * side * (half - 0.5)),
    x2: r1(p.x + n.x * side * (half + TICK)),
    y2: r1(p.y + n.y * side * (half + TICK)),
    broj: entries[0]?.[0] ?? null,
  }
}

interface NodeMark {
  kind: TramMapStationLayout["kind"]
  mark: TramMapMark
}

function nodeMark(ctx: Context, d: Drawn, v: number): NodeMark {
  const p = d.pos[v]
  const incident = ctx.net.chains
    .map((c, ci) => ({ c, ci }))
    .filter(({ c }) => c.a === v || c.b === v)
    .toSorted((x, y) => y.c.lines.length - x.c.lines.length)
  const main = incident[0]
  const u =
    main.c.a === v
      ? dirOf(d.routes[main.ci], true)
      : dirOf(d.routes[main.ci], false)
  const n = { x: -u.y, y: u.x }
  const lines = main.c.lines
  if (incident.length === 1 && lines.length === 1) {
    const half = LINE_W / 2 + TICK
    return {
      kind: "terminal",
      mark: {
        x1: r1(p.x - n.x * half),
        y1: r1(p.y - n.y * half),
        x2: r1(p.x + n.x * half),
        y2: r1(p.y + n.y * half),
        broj: lines[0],
      },
    }
  }
  const half = Math.max(0, (bundleWidth(lines.length) - LINE_W) / 2)
  return {
    kind: "interchange",
    mark: {
      x1: r1(p.x - n.x * half),
      y1: r1(p.y - n.y * half),
      x2: r1(p.x + n.x * half),
      y2: r1(p.y + n.y * half),
      broj: null,
    },
  }
}

function stationsLayout(
  ctx: Context,
  d: Drawn,
  raw: TramMapNetwork,
  offsets: Array<Map<string, number>>,
  s: State
) {
  const labels = new Map(labelsFor(ctx, s).labels.map((l) => [l.station, l]))
  const chainOf = new Map<number, number>()
  ctx.net.chains.forEach((c, ci) => {
    for (const m of c.mids) {
      chainOf.set(m, ci)
    }
  })
  return ctx.net.stations.map((st, v): TramMapStationLayout => {
    const p = d.pos[v]
    const label = labels.get(v)
    const box = label?.box ?? { x0: p.x, y0: p.y, x1: p.x, y1: p.y }
    const ci = chainOf.get(v)
    const centre = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 }
    const { kind, mark } =
      ci === undefined
        ? nodeMark(ctx, d, v)
        : {
            kind: "tick" as const,
            mark: tickMark(p, midDirection(d, ci, p), offsets[ci], centre),
          }
    const oneWay = raw.lines.flatMap((l) =>
      l.oneWay
        .filter((o) => o.station === st.id)
        .map((o) => ({ broj: l.broj, towards: o.towards }))
    )
    return {
      id: st.id,
      name: st.name,
      x: r1(p.x),
      y: r1(p.y),
      kind,
      lines: st.lines,
      mark,
      label: { x: r1(box.x0), y: r1(box.y1 - 3) },
      oneWay,
    }
  })
}

function viewBoxOf(
  d: Drawn,
  stations: Array<TramMapStationLayout>,
  ctx: Context
): [number, number, number, number] {
  const xs = [
    ...d.pos.map((p) => p.x),
    ...stations.map((s) => s.label.x + s.name.length * 7.2),
  ]
  const ys = [
    ...d.pos.map((p) => p.y),
    ...stations.map((s) => s.label.y),
    ...stations.map((s) => s.label.y - 14),
  ]
  const pad = SPACING
  const x0 = Math.min(...xs, ...stations.map((s) => s.label.x)) - pad
  const y0 = Math.min(...ys) - pad
  void ctx
  return [
    Math.floor(x0),
    Math.floor(y0),
    Math.ceil(Math.max(...xs) + pad - x0),
    Math.ceil(Math.max(...ys) + pad - y0),
  ]
}

export function assemble(
  ctx: Context,
  s: State,
  raw: TramMapNetwork,
  sc: Breakdown,
  river: (d: Drawn, level: (x: number) => number) => RiverResult
): TramMapLayout {
  const d = draw(ctx, s)
  const offsets = lineOffsets(ctx, d)
  const stations = stationsLayout(ctx, d, raw, offsets, s)
  const paths = linePaths(ctx, d, offsets)
  const rv = river(d, (x) => riverRow(s.river, x / GRID) * GRID)
  const nodes: Record<string, [number, number]> = {}
  ctx.net.nodes.forEach((v, i) => {
    nodes[ctx.net.stations[v].id] = [s.x[i], s.y[i]]
  })
  const bends: Record<string, 0 | 1> = {}
  ctx.net.chains.forEach((c, ci) => {
    bends[
      `${ctx.net.stations[c.a].id}>${ctx.net.stations[c.b].id}>${c.mids.length}`
    ] = s.bend[ci]
  })
  return {
    viewBox: viewBoxOf(d, stations, ctx),
    lineWidth: LINE_W,
    lines: paths.map(({ broj, isNight, d: path }) => {
      const ids = raw.lines.find((l) => l.broj === broj)?.stations ?? []
      const name = (id: string | undefined) =>
        raw.stations.find((st) => st.id === id)?.name ?? ""
      const terminals: [string, string] = [name(ids[0]), name(ids.at(-1))]
      return { broj, isNight, terminals, d: path }
    }),
    stations,
    river: { d: rv.d, width: rv.width },
    skeleton: { nodes, bends, river: s.river },
    score: {
      ...Object.fromEntries(
        Object.entries(sc).map(([k, v]) => [k, Math.round(v * 10) / 10])
      ),
      riverSideErrors: rv.sideErrors,
    },
  }
}
