import { KM_PER_DEG_LAT, KM_PER_DEG_LON, fastDistKm } from "./geo"
import type { WalkingGraph } from "./walk-graph"

const WALK_SPEED = 5 // km/h
const MAX_SECONDS = 45 * 60
const RENDER_CAP_SECONDS = MAX_SECONDS - 60 // trim fringe edges near boundary
const MIN_RENDER_EDGE_METERS = 40

// Pre-computed: converts edge distance in cm to walk time in seconds
// cm → km: /100_000, km → hours: /WALK_SPEED, hours → seconds: *3600
const CM_TO_SECONDS = 3600 / (100_000 * WALK_SPEED) // 0.0072

interface StopWalkSnap {
  nodeIdx: number
  walkSeconds: number
}

let cachedStopSnapSource: {
  graph: WalkingGraph
  transitStops: ReadonlyMap<string, { lat: number; lon: number }>
  snaps: Map<string, StopWalkSnap>
} | null = null

// Reusable best buffer for expandWalking (avoids 3.4MB alloc+fill per call)
let expandBestBuf: Float64Array | null = null
let expandBestBufSize = 0

/**
 * Find the nearest walking graph node to a given coordinate.
 * Uses squared distance to avoid sqrt.
 */
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

function getTransitStopSnaps(
  graph: WalkingGraph,
  transitStops: ReadonlyMap<string, { lat: number; lon: number }>
): Map<string, StopWalkSnap> {
  if (
    cachedStopSnapSource?.graph === graph &&
    cachedStopSnapSource.transitStops === transitStops
  ) {
    return cachedStopSnapSource.snaps
  }

  const snaps = new Map<string, StopWalkSnap>()

  for (const [key, stop] of transitStops) {
    const nodeIdx = findNearestNode(graph, stop.lat, stop.lon, 0.09) // 0.3² = 0.09
    if (nodeIdx < 0) continue

    const nlat = graph.coords[nodeIdx * 2]
    const nlon = graph.coords[nodeIdx * 2 + 1]
    snaps.set(key, {
      nodeIdx,
      walkSeconds:
        (fastDistKm(stop.lat, stop.lon, nlat, nlon) / WALK_SPEED) * 3600,
    })
  }

  cachedStopSnapSource = { graph, transitStops, snaps }
  return snaps
}

/** Specialized min-heap for walk Dijkstra. Uses flat arrays to avoid object allocation. */
class WalkHeap {
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

/**
 * Expand transit stop arrival times onto the walking street network.
 * Returns GeoJSON MultiLineString features bucketed by travel time.
 */
export function expandWalking(
  graph: WalkingGraph,
  transitTimes: Map<string, number>,
  transitStops: ReadonlyMap<string, { lat: number; lon: number }>,
  originLat: number,
  originLon: number
): GeoJSON.Feature[] {
  // Reuse best buffer (avoids 3.4MB alloc+fill per call)
  if (!expandBestBuf || expandBestBufSize < graph.nodeCount) {
    expandBestBuf = new Float64Array(graph.nodeCount).fill(Infinity)
    expandBestBufSize = graph.nodeCount
  }
  const best = expandBestBuf
  const touched: number[] = []
  const heap = new WalkHeap()
  const stopSnaps = getTransitStopSnaps(graph, transitStops)

  // Seed 1: Origin point → nearest walk node
  const originNode = findNearestNode(graph, originLat, originLon, 0.25) // 0.5² = 0.25
  if (originNode >= 0) {
    const olat = graph.coords[originNode * 2]
    const olon = graph.coords[originNode * 2 + 1]
    const walkTime =
      (fastDistKm(originLat, originLon, olat, olon) / WALK_SPEED) * 3600
    if (walkTime < MAX_SECONDS) {
      touched.push(originNode)
      best[originNode] = walkTime
      heap.push(walkTime, originNode)
    }
  }

  // Seed 2: Each reachable transit stop → nearest walk node
  for (const [key, time] of transitTimes) {
    if (time >= MAX_SECONDS) continue
    const snap = stopSnaps.get(key)
    if (!snap) continue

    const totalTime = time + snap.walkSeconds

    if (totalTime < MAX_SECONDS && totalTime < best[snap.nodeIdx]) {
      touched.push(snap.nodeIdx)
      best[snap.nodeIdx] = totalTime
      heap.push(totalTime, snap.nodeIdx)
    }
  }

  // Dijkstra on walking graph: track reached nodes for fast feature generation
  const reached: number[] = []
  const { offsets, edgeTargets, edgeDistCm } = graph

  while (heap.size > 0) {
    const time = heap.popTime()
    const nodeIdx = heap.popNode()
    heap.pop()

    if (time > best[nodeIdx]) continue
    if (time > MAX_SECONDS) break

    reached.push(nodeIdx)

    const edgeEnd = offsets[nodeIdx + 1]
    for (let e = offsets[nodeIdx]; e < edgeEnd; e++) {
      const toIdx = edgeTargets[e]
      const arrivalTime = time + edgeDistCm[e] * CM_TO_SECONDS

      if (arrivalTime < MAX_SECONDS && arrivalTime < best[toIdx]) {
        touched.push(toIdx)
        best[toIdx] = arrivalTime
        heap.push(arrivalTime, toIdx)
      }
    }
  }

  // Batch edges into MultiLineStrings by 60-second time buckets.
  // Only iterate reached nodes (~25K) instead of all 422K.
  const BUCKET_SECONDS = 60
  const buckets = new Map<number, [number, number][][]>()
  const { coords } = graph

  for (const nodeIdx of reached) {
    const nodeTime = best[nodeIdx]
    const ni2 = nodeIdx * 2
    const fromLat = coords[ni2]
    const fromLon = coords[ni2 + 1]
    const edgeEnd = offsets[nodeIdx + 1]

    for (let e = offsets[nodeIdx]; e < edgeEnd; e++) {
      const toIdx = edgeTargets[e]
      const toTime = best[toIdx]
      if (toTime === Infinity || toIdx <= nodeIdx) continue
      if (nodeTime > RENDER_CAP_SECONDS || toTime > RENDER_CAP_SECONDS) continue
      if (edgeDistCm[e] < MIN_RENDER_EDGE_METERS * 100) continue

      const ti2 = toIdx * 2
      const bucket =
        Math.floor(Math.min(nodeTime, toTime) / BUCKET_SECONDS) * BUCKET_SECONDS

      let lines = buckets.get(bucket)
      if (!lines) {
        lines = []
        buckets.set(bucket, lines)
      }
      lines.push([
        [
          Math.round(fromLon * 10000) / 10000,
          Math.round(fromLat * 10000) / 10000,
        ],
        [
          Math.round(coords[ti2 + 1] * 10000) / 10000,
          Math.round(coords[ti2] * 10000) / 10000,
        ],
      ])
    }
  }

  const features: GeoJSON.Feature[] = []
  for (const [time, lines] of buckets) {
    features.push({
      type: "Feature",
      properties: { time },
      geometry: { type: "MultiLineString", coordinates: lines },
    })
  }

  // Reset only touched nodes (not all 422K)
  for (let i = 0; i < touched.length; i++) best[touched[i]] = Infinity

  return features
}

/**
 * Lightweight walk expansion that counts unique reachable grid cells (~200m×200m)
 * instead of generating GeoJSON. Used for batch scoring (neighbourhood rankings).
 *
 * Counting grid cells instead of raw nodes removes bias from street-network density:
 * downtown has 2-3x more nodes/km² than suburbs, but cells normalize to area.
 *
 * Expects bestBuf pre-filled with Infinity. Resets only touched nodes at end
 * (avoids filling 422K entries every call, ~10x less memory traffic).
 */
export function countReachableCells(
  graph: WalkingGraph,
  transitTimes: Map<string, number>,
  transitStops: ReadonlyMap<string, { lat: number; lon: number }>,
  originLat: number,
  originLon: number,
  maxSeconds: number,
  bestBuf: Float64Array
): number {
  // Track touched nodes for targeted reset instead of bestBuf.fill(Infinity)
  const touched: number[] = []
  const heap = new WalkHeap()
  const stopSnaps = getTransitStopSnaps(graph, transitStops)

  // Seed 1: Origin point → nearest walk node
  const originNode = findNearestNode(graph, originLat, originLon, 0.25)
  if (originNode >= 0) {
    const olat = graph.coords[originNode * 2]
    const olon = graph.coords[originNode * 2 + 1]
    const walkTime =
      (fastDistKm(originLat, originLon, olat, olon) / WALK_SPEED) * 3600
    if (walkTime < maxSeconds) {
      touched.push(originNode)
      bestBuf[originNode] = walkTime
      heap.push(walkTime, originNode)
    }
  }

  // Seed 2: Each reachable transit stop → nearest walk node
  for (const [key, time] of transitTimes) {
    if (time >= maxSeconds) continue
    const snap = stopSnaps.get(key)
    if (!snap) continue

    const totalTime = time + snap.walkSeconds

    if (totalTime < maxSeconds && totalTime < bestBuf[snap.nodeIdx]) {
      touched.push(snap.nodeIdx)
      bestBuf[snap.nodeIdx] = totalTime
      heap.push(totalTime, snap.nodeIdx)
    }
  }

  // Dijkstra on walking graph: count unique grid cells reached
  const cells = new Set<number>()
  const { offsets, edgeTargets, edgeDistCm, coords, gridCellSize } = graph

  while (heap.size > 0) {
    const time = heap.popTime()
    const nodeIdx = heap.popNode()
    heap.pop()

    if (time > bestBuf[nodeIdx]) continue
    if (time > maxSeconds) break

    // Compute cell key as single integer (faster than string)
    const ni2 = nodeIdx * 2
    const cx = Math.floor(coords[ni2 + 1] / gridCellSize) // lon
    const cy = Math.floor(coords[ni2] / gridCellSize) // lat
    cells.add(cx * 100000 + cy)

    const edgeEnd = offsets[nodeIdx + 1]
    for (let e = offsets[nodeIdx]; e < edgeEnd; e++) {
      const toIdx = edgeTargets[e]
      const arrivalTime = time + edgeDistCm[e] * CM_TO_SECONDS

      if (arrivalTime < maxSeconds && arrivalTime < bestBuf[toIdx]) {
        touched.push(toIdx)
        bestBuf[toIdx] = arrivalTime
        heap.push(arrivalTime, toIdx)
      }
    }
  }

  const count = cells.size

  // Reset only touched nodes back to Infinity (not all 422K)
  for (let i = 0; i < touched.length; i++) bestBuf[touched[i]] = Infinity

  return count
}
