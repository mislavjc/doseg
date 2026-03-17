import { getStopDelay, type TripRT } from "./gtfs-rt"
import { MinHeap } from "./min-heap"
import { decodePolyline } from "./polyline"
import { modeSpeed } from "./transit"

const OTP_URL = process.env.OTP_URL || "http://localhost:8080"
const MAX_WAIT = 60 * 60

export const WALK_SPEED = 5 // km/h
export const WALK_MAX_KM = 1.2
const TRANSFER_MAX_KM = 0.3

// Precomputed for Zagreb latitude (~45.8°)
export const COS_LAT = Math.cos((45.8 * Math.PI) / 180)
export const KM_PER_DEG_LAT = 111.32
export const KM_PER_DEG_LON = 111.32 * COS_LAT

export interface PatternData {
  geometry: [number, number][]
  stopKeys: string[]
  mode: string
  route: string
  departures: number[] // sorted departure seconds from first stop
  tripIds: string[] // GTFS trip IDs, parallel to departures
  stopOffsets: number[] // cumulative travel seconds from first stop to each stop
}

interface NearbyStop {
  key: string
  distKm: number
}

export interface StopNode {
  lat: number
  lon: number
  key: string
  name: string
  patterns: Array<{ patternIdx: number; stopIdx: number }>
  nearbyStops: NearbyStop[]
}

export interface TransitGraph {
  patterns: PatternData[]
  stops: Map<string, StopNode>
}

export interface Predecessor {
  fromKey: string
  patternIdx: number
  boardIdx: number
  alightIdx: number
}

let cachedGraph: TransitGraph | null = null
let graphPromise: Promise<TransitGraph> | null = null

export async function getGraph(): Promise<TransitGraph> {
  if (cachedGraph) return cachedGraph
  if (!graphPromise) {
    graphPromise = buildGraph().catch((err) => {
      graphPromise = null
      throw err
    })
  }
  return graphPromise
}

async function buildGraph(): Promise<TransitGraph> {
  const res = await fetch(`${OTP_URL}/otp/gtfs/v1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `{ patterns { route { mode shortName } patternGeometry { points } stops { name lat lon } trips { gtfsId stoptimes { scheduledDeparture } } } }`,
    }),
  })

  if (!res.ok) {
    throw new Error(`OTP pattern fetch failed: ${res.status}`)
  }

  const json = await res.json()
  if (!json.data?.patterns) {
    throw new Error("OTP returned no pattern data")
  }

  const patterns: PatternData[] = []
  const stops = new Map<string, StopNode>()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of json.data.patterns as any[]) {
    if (!p.patternGeometry?.points || p.stops.length < 2) continue

    const patternIdx = patterns.length
    const stopKeys: string[] = []

    for (let stopIdx = 0; stopIdx < p.stops.length; stopIdx++) {
      const s = p.stops[stopIdx]
      const key = `${s.lat.toFixed(5)},${s.lon.toFixed(5)}`
      stopKeys.push(key)

      if (!stops.has(key)) {
        stops.set(key, {
          lat: s.lat,
          lon: s.lon,
          key,
          name: s.name || "",
          patterns: [],
          nearbyStops: [],
        })
      }
      stops.get(key)!.patterns.push({ patternIdx, stopIdx })
    }

    // Extract departure time + trip ID from each trip's first stop
    const tripDeps: Array<{ dep: number; tripId: string }> = []
    for (const trip of p.trips ?? []) {
      const st = trip.stoptimes?.[0]
      if (st?.scheduledDeparture != null) {
        // Strip OTP feed prefix: "1:tripId" → "tripId"
        const rawId = ((trip.gtfsId as string) || "").replace(/^[^:]*:/, "")
        tripDeps.push({ dep: st.scheduledDeparture, tripId: rawId })
      }
    }
    tripDeps.sort((a, b) => a.dep - b.dep)
    const departures = tripDeps.map((td) => td.dep)
    const tripIds = tripDeps.map((td) => td.tripId)

    // Cumulative travel time offset from first stop to each subsequent stop
    const mode = p.route?.mode || "BUS"
    const speed = modeSpeed(mode)
    const stopOffsets = [0]
    for (let i = 1; i < p.stops.length; i++) {
      const prev = p.stops[i - 1]
      const curr = p.stops[i]
      const d = fastDistKm(prev.lat, prev.lon, curr.lat, curr.lon)
      stopOffsets.push(stopOffsets[i - 1] + (d / speed) * 3600)
    }

    patterns.push({
      geometry: decodePolyline(p.patternGeometry.points),
      stopKeys,
      mode,
      route: p.route?.shortName || "",
      departures,
      tripIds,
      stopOffsets,
    })
  }

  // Pre-compute nearby stops using spatial grid
  const cellSize = TRANSFER_MAX_KM / KM_PER_DEG_LAT // ~0.003 degrees
  const grid = new Map<string, StopNode[]>()

  for (const stop of stops.values()) {
    const cx = Math.floor(stop.lon / cellSize)
    const cy = Math.floor(stop.lat / cellSize)
    const cellKey = `${cx},${cy}`
    if (!grid.has(cellKey)) grid.set(cellKey, [])
    grid.get(cellKey)!.push(stop)
  }

  for (const stop of stops.values()) {
    const cx = Math.floor(stop.lon / cellSize)
    const cy = Math.floor(stop.lat / cellSize)

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const neighbors = grid.get(`${cx + dx},${cy + dy}`)
        if (!neighbors) continue
        for (const other of neighbors) {
          if (other.key === stop.key) continue
          const d = fastDistKm(stop.lat, stop.lon, other.lat, other.lon)
          if (d <= TRANSFER_MAX_KM) {
            stop.nearbyStops.push({ key: other.key, distKm: d })
          }
        }
      }
    }
  }

  cachedGraph = { patterns, stops }
  return cachedGraph
}

export function fastDistKm(
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
 * Find wait time for the next departure of a pattern at a given stop.
 * Returns seconds to wait + index into departures/tripIds, or null if no service.
 */
function getNextWait(
  departures: number[],
  stopOffset: number,
  clockTime: number
): { waitSeconds: number; tripIndex: number } | null {
  if (departures.length === 0) return null

  // A trip departing first stop at time D passes this stop at D + stopOffset.
  // We need D + stopOffset >= clockTime, i.e., D >= clockTime - stopOffset.
  const target = clockTime - stopOffset

  // Binary search for first departure >= target
  let lo = 0
  let hi = departures.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (departures[mid] < target) lo = mid + 1
    else hi = mid
  }

  if (lo >= departures.length) return null

  const wait = departures[lo] + stopOffset - clockTime
  return wait <= MAX_WAIT ? { waitSeconds: wait, tripIndex: lo } : null
}

/**
 * Run transit Dijkstra from an origin point over the transit graph.
 * Returns travel times to all reachable stops, predecessor chain, and delays.
 *
 * @param timeCap - optional time limit in seconds. Stops beyond this are not explored.
 *   Default: Infinity (explore everything, needed for client-side route reconstruction).
 */
export function computeTravelTimes(
  graph: TransitGraph,
  originLat: number,
  originLon: number,
  departureTime: number,
  rtData: Map<string, TripRT>,
  timeCap: number = Infinity
): {
  times: Map<string, number>
  preds: Map<string, Predecessor>
  delays: Map<string, number>
} {
  const best = new Map<string, number>()
  const preds = new Map<string, Predecessor>()
  const delays = new Map<string, number>() // delay in seconds at alight stop
  const heap = new MinHeap()

  // Seed: walk from origin to all stops within walking distance
  for (const [key, stop] of graph.stops) {
    const d = fastDistKm(originLat, originLon, stop.lat, stop.lon)
    if (d <= WALK_MAX_KM) {
      const walkTime = (d / WALK_SPEED) * 3600
      best.set(key, walkTime)
      heap.push({ time: walkTime, key })
    }
  }

  while (heap.size > 0) {
    const { time, key } = heap.pop()!

    if (time > timeCap) break
    if (time > (best.get(key) ?? Infinity)) continue

    const stop = graph.stops.get(key)
    if (!stop) continue

    for (const { patternIdx, stopIdx } of stop.patterns) {
      const pattern = graph.patterns[patternIdx]

      const clockTime = departureTime + time
      const result = getNextWait(
        pattern.departures,
        pattern.stopOffsets[stopIdx],
        clockTime
      )
      if (result === null) continue

      const boardTime = time + result.waitSeconds
      const boardOffset = pattern.stopOffsets[stopIdx]

      // Look up GTFS-RT delay data. The selected trip likely hasn't started
      // yet (not in RT feed), so also check recent trips on the same pattern
      // as a proxy for current conditions on this route.
      let tripRT: TripRT | undefined
      for (
        let ti = result.tripIndex;
        ti >= Math.max(0, result.tripIndex - 3);
        ti--
      ) {
        tripRT = rtData.get(pattern.tripIds[ti])
        if (tripRT) break
      }

      const boardDelay = tripRT ? getStopDelay(tripRT, stopIdx) : 0

      for (let i = stopIdx + 1; i < pattern.stopKeys.length; i++) {
        let travelTime = boardTime + (pattern.stopOffsets[i] - boardOffset)

        // Apply real-time delay adjustment if available
        if (tripRT) {
          travelTime += getStopDelay(tripRT, i) - boardDelay
        }

        const existing = best.get(pattern.stopKeys[i]) ?? Infinity
        if (travelTime < existing) {
          best.set(pattern.stopKeys[i], travelTime)
          preds.set(pattern.stopKeys[i], {
            fromKey: key,
            patternIdx,
            boardIdx: stopIdx,
            alightIdx: i,
          })
          if (tripRT) {
            delays.set(pattern.stopKeys[i], getStopDelay(tripRT, i))
          }
          heap.push({ time: travelTime, key: pattern.stopKeys[i] })
        }
      }
    }

    for (const { key: nearbyKey, distKm } of stop.nearbyStops) {
      const transferTime = time + (distKm / WALK_SPEED) * 3600

      const existing = best.get(nearbyKey) ?? Infinity
      if (transferTime < existing) {
        best.set(nearbyKey, transferTime)
        preds.set(nearbyKey, {
          fromKey: key,
          patternIdx: -1,
          boardIdx: 0,
          alightIdx: 0,
        })
        heap.push({ time: transferTime, key: nearbyKey })
      }
    }
  }

  return { times: best, preds, delays }
}

/**
 * Compute average headway at a stop for a pattern near the given clock time.
 * Returns headway/2 (average wait) or null if no service.
 */
function getAvgWait(
  departures: number[],
  stopOffset: number,
  clockTime: number
): number | null {
  if (departures.length === 0) return null

  const target = clockTime - stopOffset

  let lo = 0,
    hi = departures.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (departures[mid] < target) lo = mid + 1
    else hi = mid
  }

  if (lo >= departures.length) return null

  let headway: number
  if (lo > 0) {
    headway = departures[lo] - departures[lo - 1]
  } else if (lo + 1 < departures.length) {
    headway = departures[lo + 1] - departures[lo]
  } else {
    headway = 3600
  }

  return Math.min(headway, 1800) / 2
}

const TRANSFER_PENALTY = 120 // 2 minutes

/**
 * Scoring-optimized transit Dijkstra with realistic travel assumptions:
 * - Average wait (headway/2) instead of best-case next departure
 * - 2-minute transfer penalty for line changes
 * - No predecessor tracking or GTFS-RT (not needed for batch scoring)
 */
export function computeAvgTravelTimes(
  graph: TransitGraph,
  originLat: number,
  originLon: number,
  departureTime: number,
  timeCap: number
): Map<string, number> {
  const best = new Map<string, number>()
  const heap = new MinHeap()

  for (const [key, stop] of graph.stops) {
    const d = fastDistKm(originLat, originLon, stop.lat, stop.lon)
    if (d <= WALK_MAX_KM) {
      const walkTime = (d / WALK_SPEED) * 3600
      best.set(key, walkTime)
      heap.push({ time: walkTime, key })
    }
  }

  while (heap.size > 0) {
    const { time, key } = heap.pop()!
    if (time > timeCap) break
    if (time > (best.get(key) ?? Infinity)) continue

    const stop = graph.stops.get(key)
    if (!stop) continue

    for (const { patternIdx, stopIdx } of stop.patterns) {
      const pattern = graph.patterns[patternIdx]
      const clockTime = departureTime + time

      const avgWait = getAvgWait(
        pattern.departures,
        pattern.stopOffsets[stopIdx],
        clockTime
      )
      if (avgWait === null) continue

      const boardTime = time + avgWait
      const boardOffset = pattern.stopOffsets[stopIdx]

      for (let i = stopIdx + 1; i < pattern.stopKeys.length; i++) {
        const travelTime =
          boardTime + (pattern.stopOffsets[i] - boardOffset)
        const existing = best.get(pattern.stopKeys[i]) ?? Infinity
        if (travelTime < existing) {
          best.set(pattern.stopKeys[i], travelTime)
          heap.push({ time: travelTime, key: pattern.stopKeys[i] })
        }
      }
    }

    for (const { key: nearbyKey, distKm } of stop.nearbyStops) {
      const transferTime =
        time + (distKm / WALK_SPEED) * 3600 + TRANSFER_PENALTY
      const existing = best.get(nearbyKey) ?? Infinity
      if (transferTime < existing) {
        best.set(nearbyKey, transferTime)
        heap.push({ time: transferTime, key: nearbyKey })
      }
    }
  }

  return best
}
