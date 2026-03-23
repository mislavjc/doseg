import { KM_PER_DEG_LAT, KM_PER_DEG_LON } from "./geo"
import type { WalkingGraph } from "./walk-graph"

interface PathCacheEntry {
  coords: [number, number][]
  weightedDistanceCm: number
}

const pathCache = new WeakMap<
  WalkingGraph,
  Map<string, PathCacheEntry | null>
>()

class PathHeap {
  private times: number[] = []
  private nodes: number[] = []

  get size() {
    return this.times.length
  }

  push(time: number, nodeIdx: number) {
    this.times.push(time)
    this.nodes.push(nodeIdx)
    this.bubbleUp(this.times.length - 1)
  }

  popTime(): number {
    return this.times[0]
  }

  popNode(): number {
    return this.nodes[0]
  }

  pop() {
    const n = this.times.length - 1
    if (n > 0) {
      this.times[0] = this.times[n]
      this.nodes[0] = this.nodes[n]
    }
    this.times.length = n
    this.nodes.length = n
    if (n > 0) this.sinkDown(0)
  }

  private bubbleUp(i: number) {
    const t = this.times
    const nd = this.nodes
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (t[parent] <= t[i]) break
      const tt = t[parent]
      t[parent] = t[i]
      t[i] = tt
      const tn = nd[parent]
      nd[parent] = nd[i]
      nd[i] = tn
      i = parent
    }
  }

  private sinkDown(i: number) {
    const t = this.times
    const nd = this.nodes
    const n = t.length
    while (true) {
      let s = i
      const l = 2 * i + 1
      const r = 2 * i + 2
      if (l < n && t[l] < t[s]) s = l
      if (r < n && t[r] < t[s]) s = r
      if (s === i) break
      const tt = t[s]
      t[s] = t[i]
      t[i] = tt
      const tn = nd[s]
      nd[s] = nd[i]
      nd[i] = tn
      i = s
    }
  }
}

export function distMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dlat = (lat2 - lat1) * KM_PER_DEG_LAT * 1000
  const dlon = (lon2 - lon1) * KM_PER_DEG_LON * 1000
  return Math.sqrt(dlat * dlat + dlon * dlon)
}

function appendCoord(coords: [number, number][], lon: number, lat: number) {
  const last = coords[coords.length - 1]
  if (last && last[0] === lon && last[1] === lat) return
  coords.push([lon, lat])
}

function findNearestNode(
  graph: WalkingGraph,
  lat: number,
  lon: number,
  maxKmSq: number
): number {
  const cellSize = graph.gridCellSize
  const cx = Math.floor(lon / cellSize)
  const cy = Math.floor(lat / cellSize)

  let bestIdx = -1
  let bestDistSq = maxKmSq

  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const cell = graph.grid.get(`${cx + dx},${cy + dy}`)
      if (!cell) continue
      for (const nodeIdx of cell) {
        const dlat = (graph.coords[nodeIdx * 2] - lat) * KM_PER_DEG_LAT
        const dlon = (graph.coords[nodeIdx * 2 + 1] - lon) * KM_PER_DEG_LON
        const dSq = dlat * dlat + dlon * dlon
        if (dSq < bestDistSq) {
          bestDistSq = dSq
          bestIdx = nodeIdx
        }
      }
    }
  }

  return bestIdx
}

function getNodeCoords(graph: WalkingGraph, nodeIdx: number): [number, number] {
  return [graph.coords[nodeIdx * 2], graph.coords[nodeIdx * 2 + 1]]
}

function getCachedPath(
  graph: WalkingGraph,
  startNode: number,
  endNode: number
): PathCacheEntry | null | undefined {
  return pathCache.get(graph)?.get(`${startNode}:${endNode}`)
}

function setCachedPath(
  graph: WalkingGraph,
  startNode: number,
  endNode: number,
  value: PathCacheEntry | null
) {
  let cache = pathCache.get(graph)
  if (!cache) {
    cache = new Map()
    pathCache.set(graph, cache)
  }
  cache.set(`${startNode}:${endNode}`, value)
}

function runDijkstra(
  graph: WalkingGraph,
  startNode: number,
  endNode: number
): { best: Float64Array; prev: Int32Array } {
  const best = new Float64Array(graph.nodeCount).fill(Infinity)
  const prev = new Int32Array(graph.nodeCount).fill(-1)
  const heap = new PathHeap()

  best[startNode] = 0
  heap.push(0, startNode)

  while (heap.size > 0) {
    const time = heap.popTime()
    const nodeIdx = heap.popNode()
    heap.pop()

    if (time > best[nodeIdx]) continue
    if (nodeIdx === endNode) break

    const edgeEnd = graph.offsets[nodeIdx + 1]
    for (let e = graph.offsets[nodeIdx]; e < edgeEnd; e++) {
      const toIdx = graph.edgeTargets[e]
      const next = time + graph.edgeDistCm[e]
      if (next >= best[toIdx]) continue
      best[toIdx] = next
      prev[toIdx] = nodeIdx
      heap.push(next, toIdx)
    }
  }

  return { best, prev }
}

function tracePathChain(
  prev: Int32Array,
  startNode: number,
  endNode: number,
  graph: WalkingGraph
): [number, number][] | null {
  const chain: number[] = []
  let current = endNode
  while (current !== -1) {
    chain.push(current)
    if (current === startNode) break
    current = prev[current]
  }

  if (chain[chain.length - 1] !== startNode) return null

  chain.reverse()
  return chain.map((nodeIdx) => {
    const [lat, lon] = getNodeCoords(graph, nodeIdx)
    return [lon, lat]
  })
}

function findPathBetweenNodes(
  graph: WalkingGraph,
  startNode: number,
  endNode: number
): PathCacheEntry | null {
  const cachedPath = getCachedPath(graph, startNode, endNode)
  if (cachedPath !== undefined) return cachedPath

  const { best, prev } = runDijkstra(graph, startNode, endNode)

  const weightedDistanceCm = best[endNode]
  if (!Number.isFinite(weightedDistanceCm)) {
    setCachedPath(graph, startNode, endNode, null)
    return null
  }

  const coords = tracePathChain(prev, startNode, endNode, graph)
  if (!coords) {
    setCachedPath(graph, startNode, endNode, null)
    return null
  }

  const result = { coords, weightedDistanceCm }
  setCachedPath(graph, startNode, endNode, result)
  return result
}

interface StreetPathResult {
  coords: [number, number][]
  distanceMeters: number
  durationSeconds: number
  startNodeIdx: number
  endNodeIdx: number
}

function resolvePathNodes(
  graph: WalkingGraph,
  startNodeIdx: number,
  endNodeIdx: number
): PathCacheEntry | null {
  if (startNodeIdx === endNodeIdx) {
    const startNodeCoords = getNodeCoords(graph, startNodeIdx)
    return {
      coords: [[startNodeCoords[1], startNodeCoords[0]]],
      weightedDistanceCm: 0,
    }
  }
  return findPathBetweenNodes(graph, startNodeIdx, endNodeIdx)
}

function sumCoordDistance(coords: [number, number][]): number {
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    const [prevLon, prevLat] = coords[i - 1]
    const [lon, lat] = coords[i]
    total += distMeters(prevLat, prevLon, lat, lon)
  }
  return total
}

export function findStreetPath(
  graph: WalkingGraph,
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  speedKmh: number,
  maxNodeDistKmSq: number = 0.25
): StreetPathResult | null {
  const startNodeIdx = findNearestNode(graph, from.lat, from.lon, maxNodeDistKmSq)
  const endNodeIdx = findNearestNode(graph, to.lat, to.lon, maxNodeDistKmSq)
  if (startNodeIdx < 0 || endNodeIdx < 0) return null

  const path = resolvePathNodes(graph, startNodeIdx, endNodeIdx)
  if (!path) return null

  const coords: [number, number][] = []
  appendCoord(coords, from.lon, from.lat)
  for (const [lon, lat] of path.coords) {
    appendCoord(coords, lon, lat)
  }
  appendCoord(coords, to.lon, to.lat)

  const startNodeCoords = getNodeCoords(graph, startNodeIdx)
  const endNodeCoords = getNodeCoords(graph, endNodeIdx)
  const durationSeconds =
    path.weightedDistanceCm * (3600 / (100_000 * speedKmh)) +
    distMeters(from.lat, from.lon, startNodeCoords[0], startNodeCoords[1]) /
      (speedKmh / 3.6) +
    distMeters(to.lat, to.lon, endNodeCoords[0], endNodeCoords[1]) /
      (speedKmh / 3.6)

  return {
    coords,
    distanceMeters: Math.round(sumCoordDistance(coords)),
    durationSeconds: Math.round(durationSeconds),
    startNodeIdx,
    endNodeIdx,
  }
}
