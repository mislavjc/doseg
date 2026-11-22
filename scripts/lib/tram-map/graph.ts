import { readJson } from "../json"

import type { TramMapNetwork } from "@/lib/generated/TramMapNetwork"

/**
 * The tram network as a graph, and its skeleton: junctions, terminals and
 * places where the set of day lines changes are skeleton nodes, and the runs
 * of plain stations between them are chains. The optimizer positions skeleton
 * nodes only; chain stations are spaced evenly along each chain's route.
 */

const LAT0 = 45.8
const LON0 = 15.98
const KM_PER_DEG_LAT = 111.13
const KM_PER_DEG_LON = KM_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180)

export interface Station {
  id: string
  name: string
  /** Geographic position in km east / km south of the city centre. */
  gx: number
  gy: number
  lines: Array<string>
}

export interface LineRoute {
  broj: string
  isNight: boolean
  stations: Array<number>
}

export interface Chain {
  a: number
  b: number
  /** Station indices strictly between a and b, in order from a. */
  mids: Array<number>
  /** Day lines on this chain, in line-number order. */
  lines: Array<string>
}

export interface Network {
  stations: Array<Station>
  routes: Array<LineRoute>
  chains: Array<Chain>
  /** Skeleton node station indices. */
  nodes: Array<number>
  /** Per line, its chains in travel order with the direction each is run in. */
  lineChains: Map<string, Array<{ chain: number; forward: boolean }>>
}

export const toKm = (lat: number, lon: number) => ({
  gx: (lon - LON0) * KM_PER_DEG_LON,
  gy: (LAT0 - lat) * KM_PER_DEG_LAT,
})

const edgeKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`)

function buildEdges(routes: Array<LineRoute>) {
  const edgeLines = new Map<string, Set<string>>()
  const adj = new Map<number, Set<number>>()
  for (const r of routes) {
    for (let i = 1; i < r.stations.length; i++) {
      const [a, b] = [r.stations[i - 1], r.stations[i]]
      const key = edgeKey(a, b)
      const set = edgeLines.get(key) ?? new Set<string>()
      if (!r.isNight) {
        set.add(r.broj)
      }
      edgeLines.set(key, set)
      adj.set(a, (adj.get(a) ?? new Set()).add(b))
      adj.set(b, (adj.get(b) ?? new Set()).add(a))
    }
  }
  return { edgeLines, adj }
}

const sameSet = (x: Set<string>, y: Set<string>) =>
  x.size === y.size && [...x].every((v) => y.has(v))

function walkChains(
  isNode: (v: number) => boolean,
  adj: Map<number, Set<number>>,
  linesOf: (a: number, b: number) => Set<string>
): Array<Chain> {
  const chains: Array<Chain> = []
  const seen = new Set<string>()
  for (const start of adj.keys()) {
    if (!isNode(start)) {
      continue
    }
    for (const first of adj.get(start) ?? []) {
      if (seen.has(edgeKey(start, first))) {
        continue
      }
      const path = [start, first]
      while (!isNode(path.at(-1) ?? start)) {
        const cur = path.at(-1) ?? start
        const prev = path.at(-2) ?? start
        const next = [...(adj.get(cur) ?? [])].find((n) => n !== prev)
        if (next === undefined) {
          break
        }
        path.push(next)
      }
      for (let i = 1; i < path.length; i++) {
        seen.add(edgeKey(path[i - 1], path[i]))
      }
      const lines = [...linesOf(start, first)].toSorted(
        (p, q) => Number(p) - Number(q)
      )
      chains.push({
        a: start,
        b: path.at(-1) ?? start,
        mids: path.slice(1, -1),
        lines,
      })
    }
  }
  return chains
}

function routeChains(routes: Array<LineRoute>, chains: Array<Chain>) {
  const byEdge = new Map<string, { chain: number; forward: boolean }>()
  chains.forEach((c, ci) => {
    const seq = [c.a, ...c.mids, c.b]
    byEdge.set(`${seq[0]}>${seq[1]}`, { chain: ci, forward: true })
    byEdge.set(`${seq.at(-1)}>${seq.at(-2)}`, { chain: ci, forward: false })
  })
  const out = new Map<string, Array<{ chain: number; forward: boolean }>>()
  for (const r of routes) {
    const list: Array<{ chain: number; forward: boolean }> = []
    for (let i = 1; i < r.stations.length; i++) {
      const hit = byEdge.get(`${r.stations[i - 1]}>${r.stations[i]}`)
      if (hit) {
        list.push(hit)
      }
    }
    out.set(r.broj, list)
  }
  return out
}

export function loadNetwork(path: string): Network {
  const raw = readJson<TramMapNetwork>(path)
  const index = new Map(raw.stations.map((s, i) => [s.id, i]))
  const stations: Array<Station> = raw.stations.map((s) => ({
    id: s.id,
    name: s.name,
    lines: s.lines,
    ...toKm(s.lat, s.lon),
  }))
  const routes: Array<LineRoute> = raw.lines.map((l) => ({
    broj: l.broj,
    isNight: l.isNight,
    stations: l.stations.map((id) => {
      const i = index.get(id)
      if (i === undefined) {
        throw new Error(`line ${l.broj}: unknown station ${id}`)
      }
      return i
    }),
  }))
  const { edgeLines, adj } = buildEdges(routes)
  const linesOf = (a: number, b: number) =>
    edgeLines.get(edgeKey(a, b)) ?? new Set<string>()
  const terminals = new Set(
    routes.flatMap((r) => [r.stations[0], r.stations.at(-1) ?? 0])
  )
  const isNode = (v: number) => {
    const n = [...(adj.get(v) ?? [])]
    return (
      n.length !== 2 ||
      terminals.has(v) ||
      !sameSet(linesOf(v, n[0]), linesOf(v, n[1]))
    )
  }
  const chains = walkChains(isNode, adj, linesOf)
  const nodes = [...adj.keys()].filter((v) => isNode(v))
  return {
    stations,
    routes,
    chains,
    nodes,
    lineChains: routeChains(routes, chains),
  }
}
