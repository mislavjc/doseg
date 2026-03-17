import type { WalkingGraph } from "./walk-graph"

// Precomputed for Zagreb latitude (~45.8°)
const COS_LAT = Math.cos((45.8 * Math.PI) / 180)
const KM_PER_DEG_LAT = 111.32
const KM_PER_DEG_LON = 111.32 * COS_LAT

const WALK_SPEED = 5 // km/h
const MAX_SECONDS = 45 * 60

// Pre-computed: converts edge distance in cm to walk time in seconds
// cm → km: /100_000, km → hours: /WALK_SPEED, hours → seconds: *3600
const CM_TO_SECONDS = 3600 / (100_000 * WALK_SPEED) // 0.0072

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

/** Fast inline distance in km (no sqrt needed when comparing to threshold²) */
function fastDistKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dlat = (lat2 - lat1) * KM_PER_DEG_LAT
  const dlon = (lon2 - lon1) * KM_PER_DEG_LON
  return Math.sqrt(dlat * dlat + dlon * dlon)
}

/** Specialized min-heap for walk Dijkstra — uses flat arrays to avoid object allocation */
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
      const tt = t[parent]; t[parent] = t[i]; t[i] = tt
      const tn = nd[parent]; nd[parent] = nd[i]; nd[i] = tn
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
      const tt = t[s]; t[s] = t[i]; t[i] = tt
      const tn = nd[s]; nd[s] = nd[i]; nd[i] = tn
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
  const best = new Float64Array(graph.nodeCount).fill(Infinity)
  const heap = new WalkHeap()

  // Seed 1: Origin point → nearest walk node
  const originNode = findNearestNode(graph, originLat, originLon, 0.25) // 0.5² = 0.25
  if (originNode >= 0) {
    const olat = graph.coords[originNode * 2]
    const olon = graph.coords[originNode * 2 + 1]
    const walkTime =
      (fastDistKm(originLat, originLon, olat, olon) / WALK_SPEED) * 3600
    if (walkTime < MAX_SECONDS) {
      best[originNode] = walkTime
      heap.push(walkTime, originNode)
    }
  }

  // Seed 2: Each reachable transit stop → nearest walk node
  for (const [key, time] of transitTimes) {
    if (time >= MAX_SECONDS) continue
    const stop = transitStops.get(key)
    if (!stop) continue

    const nodeIdx = findNearestNode(graph, stop.lat, stop.lon, 0.09) // 0.3² = 0.09
    if (nodeIdx < 0) continue

    const nlat = graph.coords[nodeIdx * 2]
    const nlon = graph.coords[nodeIdx * 2 + 1]
    const walkToNode =
      (fastDistKm(stop.lat, stop.lon, nlat, nlon) / WALK_SPEED) * 3600
    const totalTime = time + walkToNode

    if (totalTime < MAX_SECONDS && totalTime < best[nodeIdx]) {
      best[nodeIdx] = totalTime
      heap.push(totalTime, nodeIdx)
    }
  }

  // Dijkstra on walking graph — track reached nodes for fast feature generation
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
      if (edgeDistCm[e] < 2000) continue // skip < 20m edges

      const ti2 = toIdx * 2
      const bucket =
        Math.floor(Math.min(nodeTime, toTime) / BUCKET_SECONDS) *
        BUCKET_SECONDS

      let lines = buckets.get(bucket)
      if (!lines) {
        lines = []
        buckets.set(bucket, lines)
      }
      lines.push([
        [Math.round(fromLon * 10000) / 10000, Math.round(fromLat * 10000) / 10000],
        [Math.round(coords[ti2 + 1] * 10000) / 10000, Math.round(coords[ti2] * 10000) / 10000],
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

  return features
}
