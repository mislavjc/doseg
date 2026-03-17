import type { WalkingGraph } from "./walk-graph"

/** Round to 4 decimal places (~10m precision, sufficient for map display) */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

// Precomputed for Zagreb latitude (~45.8°)
const COS_LAT = Math.cos((45.8 * Math.PI) / 180)
const KM_PER_DEG_LAT = 111.32
const KM_PER_DEG_LON = 111.32 * COS_LAT

const WALK_SPEED = 5 // km/h
const MAX_SECONDS = 45 * 60

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

/**
 * Find the nearest walking graph node to a given coordinate.
 * Returns node index or -1 if none within maxKm.
 */
function findNearestNode(
  graph: WalkingGraph,
  lat: number,
  lon: number,
  maxKm: number
): number {
  const cellSize = graph.gridCellSize
  const cx = Math.floor(lon / cellSize)
  const cy = Math.floor(lat / cellSize)
  const searchRadius = 2 // cells

  let bestIdx = -1
  let bestDist = maxKm

  for (let dx = -searchRadius; dx <= searchRadius; dx++) {
    for (let dy = -searchRadius; dy <= searchRadius; dy++) {
      const cell = graph.grid.get(`${cx + dx},${cy + dy}`)
      if (!cell) continue
      for (const nodeIdx of cell) {
        const nlat = graph.coords[nodeIdx * 2]
        const nlon = graph.coords[nodeIdx * 2 + 1]
        const d = fastDistKm(lat, lon, nlat, nlon)
        if (d < bestDist) {
          bestDist = d
          bestIdx = nodeIdx
        }
      }
    }
  }

  return bestIdx
}

/** Specialized min-heap using numeric nodeIdx keys instead of strings for speed */
interface WalkHeapEntry {
  time: number
  nodeIdx: number
}

class WalkHeap {
  private data: WalkHeapEntry[] = []

  get size() {
    return this.data.length
  }

  push(entry: WalkHeapEntry) {
    this.data.push(entry)
    this.bubbleUp(this.data.length - 1)
  }

  pop(): WalkHeapEntry {
    const top = this.data[0]
    const last = this.data.pop()!
    if (this.data.length > 0) {
      this.data[0] = last
      this.sinkDown(0)
    }
    return top
  }

  private bubbleUp(i: number) {
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.data[parent].time <= this.data[i].time) break
      ;[this.data[parent], this.data[i]] = [this.data[i], this.data[parent]]
      i = parent
    }
  }

  private sinkDown(i: number) {
    const n = this.data.length
    while (true) {
      let smallest = i
      const left = 2 * i + 1
      const right = 2 * i + 2
      if (left < n && this.data[left].time < this.data[smallest].time)
        smallest = left
      if (right < n && this.data[right].time < this.data[smallest].time)
        smallest = right
      if (smallest === i) break
      ;[this.data[smallest], this.data[i]] = [this.data[i], this.data[smallest]]
      i = smallest
    }
  }
}

/**
 * Expand transit stop arrival times onto the walking street network.
 * Returns GeoJSON LineString features for every reachable street segment.
 */
export function expandWalking(
  graph: WalkingGraph,
  transitTimes: Map<string, number>,
  transitStops: Map<string, { lat: number; lon: number }>,
  originLat: number,
  originLon: number
): GeoJSON.Feature[] {
  const best = new Float64Array(graph.nodeCount).fill(Infinity)
  const heap = new WalkHeap()

  // Seed 1: Origin point → nearest walk node
  const originNode = findNearestNode(graph, originLat, originLon, 0.5)
  if (originNode >= 0) {
    const olat = graph.coords[originNode * 2]
    const olon = graph.coords[originNode * 2 + 1]
    const walkTime =
      (fastDistKm(originLat, originLon, olat, olon) / WALK_SPEED) * 3600
    if (walkTime < MAX_SECONDS) {
      best[originNode] = walkTime
      heap.push({ time: walkTime, nodeIdx: originNode })
    }
  }

  // Seed 2: Each reachable transit stop → nearest walk node
  for (const [key, time] of transitTimes) {
    if (time >= MAX_SECONDS) continue
    const stop = transitStops.get(key)
    if (!stop) continue

    const nodeIdx = findNearestNode(graph, stop.lat, stop.lon, 0.3)
    if (nodeIdx < 0) continue

    const nlat = graph.coords[nodeIdx * 2]
    const nlon = graph.coords[nodeIdx * 2 + 1]
    const walkToNode =
      (fastDistKm(stop.lat, stop.lon, nlat, nlon) / WALK_SPEED) * 3600
    const totalTime = time + walkToNode

    if (totalTime < MAX_SECONDS && totalTime < best[nodeIdx]) {
      best[nodeIdx] = totalTime
      heap.push({ time: totalTime, nodeIdx })
    }
  }

  // Dijkstra on walking graph — track reached nodes for fast feature generation
  const reached: number[] = []

  while (heap.size > 0) {
    const { time, nodeIdx } = heap.pop()
    if (time > best[nodeIdx]) continue
    if (time > MAX_SECONDS) break

    reached.push(nodeIdx)

    const edgeStart = graph.offsets[nodeIdx]
    const edgeEnd = graph.offsets[nodeIdx + 1]

    for (let e = edgeStart; e < edgeEnd; e++) {
      const toIdx = graph.edgeTargets[e]
      const distCm = graph.edgeDistCm[e]
      const walkSeconds = (distCm / 100000 / WALK_SPEED) * 3600 // cm → km → hours → seconds
      const arrivalTime = time + walkSeconds

      if (arrivalTime < MAX_SECONDS && arrivalTime < best[toIdx]) {
        best[toIdx] = arrivalTime
        heap.push({ time: arrivalTime, nodeIdx: toIdx })
      }
    }
  }

  // Batch edges into MultiLineStrings by 60-second time buckets.
  // Only iterate reached nodes (~20-30K) instead of all 422K.
  const BUCKET_SECONDS = 60
  const buckets = new Map<number, [number, number][][]>()

  for (const nodeIdx of reached) {
    const nodeTime = best[nodeIdx]
    const fromLat = graph.coords[nodeIdx * 2]
    const fromLon = graph.coords[nodeIdx * 2 + 1]
    const edgeStart = graph.offsets[nodeIdx]
    const edgeEnd = graph.offsets[nodeIdx + 1]

    for (let e = edgeStart; e < edgeEnd; e++) {
      const toIdx = graph.edgeTargets[e]
      const toTime = best[toIdx]
      if (toTime === Infinity) continue

      // Only emit each edge once (from lower index)
      if (toIdx <= nodeIdx) continue

      // Skip very short edges (< 20m) — invisible on map
      if (graph.edgeDistCm[e] < 2000) continue

      const toLat = graph.coords[toIdx * 2]
      const toLon = graph.coords[toIdx * 2 + 1]
      const time = Math.min(nodeTime, toTime)
      const bucket =
        Math.floor(time / BUCKET_SECONDS) * BUCKET_SECONDS

      let lines = buckets.get(bucket)
      if (!lines) {
        lines = []
        buckets.set(bucket, lines)
      }
      lines.push([
        [round4(fromLon), round4(fromLat)],
        [round4(toLon), round4(toLat)],
      ])
    }
  }

  // Convert buckets to MultiLineString features
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
