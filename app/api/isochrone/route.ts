import { NextRequest, NextResponse } from "next/server"

import { getRealtimeData, getStopDelay, type TripRT } from "@/lib/gtfs-rt"
import { secondsOfDay } from "@/lib/zagreb-time"
import { MinHeap } from "@/lib/min-heap"
import { decodePolyline } from "@/lib/polyline"
import { modeSpeed } from "@/lib/transit"
import { expandWalking } from "@/lib/walk-expand"
import { getWalkGraph } from "@/lib/walk-graph"

const OTP_URL = process.env.OTP_URL || "http://localhost:8080"
const MAX_SECONDS = 45 * 60
const MAX_WAIT = 60 * 60 // skip patterns with >1h wait

const WALK_SPEED = 5 // km/h
const WALK_MAX_KM = 1.2
const TRANSFER_MAX_KM = 0.3

// Precomputed for Zagreb latitude (~45.8°)
const COS_LAT = Math.cos((45.8 * Math.PI) / 180)
const KM_PER_DEG_LAT = 111.32
const KM_PER_DEG_LON = 111.32 * COS_LAT

interface PatternData {
  geometry: [number, number][]
  stopKeys: string[]
  mode: string
  route: string
  departures: number[] // sorted departure seconds from first stop
  tripIds: string[] // GTFS trip IDs, parallel to departures
  stopOffsets: number[] // cumulative travel seconds from first stop to each stop
}

interface Predecessor {
  fromKey: string
  patternIdx: number
  boardIdx: number
  alightIdx: number
}

interface NearbyStop {
  key: string
  distKm: number
}

interface StopNode {
  lat: number
  lon: number
  key: string
  name: string
  patterns: Array<{ patternIdx: number; stopIdx: number }>
  nearbyStops: NearbyStop[]
}

interface TransitGraph {
  patterns: PatternData[]
  stops: Map<string, StopNode>
}

let cachedGraph: TransitGraph | null = null
let graphPromise: Promise<TransitGraph> | null = null

async function getGraph(): Promise<TransitGraph> {
  if (cachedGraph) return cachedGraph
  if (!graphPromise) {
    graphPromise = buildGraph().catch((err) => {
      graphPromise = null
      throw err
    })
  }
  return graphPromise
}

// Pre-warm graph cache on module load so the first request is fast
getGraph().catch(() => {})

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

function computeTravelTimes(
  graph: TransitGraph,
  originLat: number,
  originLon: number,
  departureTime: number,
  rtData: Map<string, TripRT>
): { times: Map<string, number>; preds: Map<string, Predecessor>; delays: Map<string, number> } {
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

  // Explore full transit graph (no time cap) so client-side route
  // reconstruction works for any destination. The isochrone
  // *visualization* is capped at MAX_SECONDS in generateFeatures.
  while (heap.size > 0) {
    const { time, key } = heap.pop()!

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
      for (let ti = result.tripIndex; ti >= Math.max(0, result.tripIndex - 3); ti--) {
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

const BUCKET_SECONDS = 60

function generateFeatures(
  graph: TransitGraph,
  travelTimes: Map<string, number>
): GeoJSON.Feature[] {
  const buckets = new Map<number, [number, number][][]>()

  for (const pattern of graph.patterns) {
    const geo = pattern.geometry
    const numStops = pattern.stopKeys.length
    const numPts = geo.length
    if (numStops < 2 || numPts < 2) continue

    for (let i = 0; i < numStops - 1; i++) {
      const t1 = travelTimes.get(pattern.stopKeys[i])
      const t2 = travelTimes.get(pattern.stopKeys[i + 1])

      if (t1 === undefined && t2 === undefined) continue
      const time = Math.min(t1 ?? Infinity, t2 ?? Infinity)
      if (time > MAX_SECONDS) continue

      const startIdx = Math.round((i * (numPts - 1)) / (numStops - 1))
      const endIdx = Math.round(
        ((i + 1) * (numPts - 1)) / (numStops - 1)
      )
      if (endIdx <= startIdx) continue

      const coords = geo.slice(startIdx, endIdx + 1)
      if (coords.length < 2) continue

      const bucket =
        Math.floor(time / BUCKET_SECONDS) * BUCKET_SECONDS
      let lines = buckets.get(bucket)
      if (!lines) {
        lines = []
        buckets.set(bucket, lines)
      }
      lines.push(coords)
    }
  }

  return Array.from(buckets, ([time, lines]) => ({
    type: "Feature" as const,
    properties: { time },
    geometry: { type: "MultiLineString" as const, coordinates: lines },
  }))
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const lat = parseFloat(searchParams.get("lat") || "")
  const lon = parseFloat(searchParams.get("lon") || "")

  if (isNaN(lat) || isNaN(lon)) {
    return NextResponse.json(
      { error: "lat and lon are required" },
      { status: 400 }
    )
  }

  // Parse departure time (HH:MM → seconds since midnight), default to now
  const timeStr = searchParams.get("time")
  let departureTime: number
  if (timeStr) {
    const [h, m] = timeStr.split(":").map(Number)
    departureTime =
      !isNaN(h) && !isNaN(m) ? h * 3600 + m * 60 : secondsOfDay()
  } else {
    departureTime = secondsOfDay()
  }

  try {
    const t0 = performance.now()
    const graph = await getGraph()
    const tGraph = performance.now()
    const rtData = getRealtimeData()
    const walkGraph = getWalkGraph()
    const tLoad = performance.now()
    const { times: travelTimes, preds, delays } = computeTravelTimes(
      graph,
      lat,
      lon,
      departureTime,
      rtData
    )
    const tDijkstra = performance.now()
    const transitFeatures = generateFeatures(graph, travelTimes)

    const walkFeatures = expandWalking(
      walkGraph,
      travelTimes,
      graph.stops,
      lat,
      lon
    )
    const tWalk = performance.now()

    const features = [...transitFeatures, ...walkFeatures]

    // Build routing payload for client-side route reconstruction
    const usedPatterns = new Set<number>()
    for (const pred of preds.values()) {
      if (pred.patternIdx >= 0) usedPatterns.add(pred.patternIdx)
    }

    const patternMap = new Map<number, number>()
    const routingPatterns: {
      stopKeys: string[]
      mode: string
      route: string
    }[] = []
    for (const origIdx of usedPatterns) {
      const p = graph.patterns[origIdx]
      patternMap.set(origIdx, routingPatterns.length)
      routingPatterns.push({
        stopKeys: p.stopKeys,
        mode: p.mode,
        route: p.route,
      })
    }

    const routingStops: {
      key: string
      lat: number
      lon: number
      name: string
      time: number
      delay?: number
      pred: { fromKey: string; patternIdx: number; boardIdx: number; alightIdx: number } | null
    }[] = []
    for (const [key, time] of travelTimes) {
      const stop = graph.stops.get(key)!
      const pred = preds.get(key)
      const delay = delays.get(key)
      routingStops.push({
        key,
        lat: stop.lat,
        lon: stop.lon,
        name: stop.name,
        time: Math.round(time),
        ...(delay !== undefined && { delay: Math.round(delay) }),
        pred: pred
          ? {
              fromKey: pred.fromKey,
              patternIdx:
                pred.patternIdx >= 0
                  ? patternMap.get(pred.patternIdx)!
                  : -1,
              boardIdx: pred.boardIdx,
              alightIdx: pred.alightIdx,
            }
          : null,
      })
    }

    const tSerial = performance.now()

    return NextResponse.json(
      {
        type: "FeatureCollection",
        features,
        routing: { stops: routingStops, patterns: routingPatterns },
        realtime: rtData.size > 0,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=30",
          "Server-Timing": `graph;dur=${(tGraph-t0).toFixed(0)}, dijkstra;dur=${(tDijkstra-tLoad).toFixed(0)}, walk;dur=${(tWalk-tDijkstra).toFixed(0)}, serial;dur=${(tSerial-tWalk).toFixed(0)}, total;dur=${(tSerial-t0).toFixed(0)}`,
        },
      }
    )
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal error"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
