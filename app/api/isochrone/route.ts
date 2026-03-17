import { NextRequest, NextResponse } from "next/server"

import { MinHeap } from "@/lib/min-heap"
import { decodePolyline } from "@/lib/polyline"
import { modeSpeed } from "@/lib/transit"
import { expandWalking } from "@/lib/walk-expand"
import { getWalkGraph } from "@/lib/walk-graph"

const OTP_URL = process.env.OTP_URL || "http://localhost:8080"
const MAX_SECONDS = 45 * 60

const WALK_SPEED = 5 // km/h
const WALK_MAX_KM = 1.2
const WAIT_SECONDS = 300 // average 5 min wait
const TRANSFER_MAX_KM = 0.3

// Precomputed for Zagreb latitude (~45.8°)
const COS_LAT = Math.cos((45.8 * Math.PI) / 180)
const KM_PER_DEG_LAT = 111.32
const KM_PER_DEG_LON = 111.32 * COS_LAT

interface PatternData {
  geometry: [number, number][]
  stopKeys: string[]
  mode: string
}

interface NearbyStop {
  key: string
  distKm: number
}

interface StopNode {
  lat: number
  lon: number
  key: string
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
  if (!graphPromise) graphPromise = buildGraph()
  return graphPromise
}

async function buildGraph(): Promise<TransitGraph> {
  const res = await fetch(`${OTP_URL}/otp/gtfs/v1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `{ patterns { route { mode } patternGeometry { points } stops { lat lon } } }`,
    }),
  })

  if (!res.ok) {
    graphPromise = null
    throw new Error(`OTP pattern fetch failed: ${res.status}`)
  }

  const json = await res.json()
  if (!json.data?.patterns) {
    graphPromise = null
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
          patterns: [],
          nearbyStops: [],
        })
      }
      stops.get(key)!.patterns.push({ patternIdx, stopIdx })
    }

    patterns.push({
      geometry: decodePolyline(p.patternGeometry.points),
      stopKeys,
      mode: p.route?.mode || "BUS",
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

function computeTravelTimes(
  graph: TransitGraph,
  originLat: number,
  originLon: number
): Map<string, number> {
  const best = new Map<string, number>()
  const heap = new MinHeap()

  // Seed: walk from origin to all stops within walking distance
  for (const [key, stop] of graph.stops) {
    const d = fastDistKm(originLat, originLon, stop.lat, stop.lon)
    if (d <= WALK_MAX_KM) {
      const walkTime = (d / WALK_SPEED) * 3600
      if (walkTime <= MAX_SECONDS) {
        best.set(key, walkTime)
        heap.push({ time: walkTime, key })
      }
    }
  }

  while (heap.size > 0) {
    const { time, key } = heap.pop()!

    if (time > (best.get(key) ?? Infinity)) continue
    if (time > MAX_SECONDS) break

    const stop = graph.stops.get(key)
    if (!stop) continue

    // Board each pattern and ride forward
    for (const { patternIdx, stopIdx } of stop.patterns) {
      const pattern = graph.patterns[patternIdx]
      const speed = modeSpeed(pattern.mode)

      const boardTime = time + WAIT_SECONDS
      if (boardTime > MAX_SECONDS) continue

      let travelTime = boardTime
      for (let i = stopIdx + 1; i < pattern.stopKeys.length; i++) {
        const prevStop = graph.stops.get(pattern.stopKeys[i - 1])!
        const nextStop = graph.stops.get(pattern.stopKeys[i])!
        const segDist = fastDistKm(
          prevStop.lat,
          prevStop.lon,
          nextStop.lat,
          nextStop.lon
        )
        travelTime += (segDist / speed) * 3600
        if (travelTime > MAX_SECONDS) break

        const existing = best.get(pattern.stopKeys[i]) ?? Infinity
        if (travelTime < existing) {
          best.set(pattern.stopKeys[i], travelTime)
          heap.push({ time: travelTime, key: pattern.stopKeys[i] })
        }
      }
    }

    // Walk to nearby stops (transfer)
    for (const { key: nearbyKey, distKm } of stop.nearbyStops) {
      const transferTime = time + (distKm / WALK_SPEED) * 3600
      if (transferTime > MAX_SECONDS) continue

      const existing = best.get(nearbyKey) ?? Infinity
      if (transferTime < existing) {
        best.set(nearbyKey, transferTime)
        heap.push({ time: transferTime, key: nearbyKey })
      }
    }
  }

  return best
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

  try {
    const graph = await getGraph()
    const walkGraph = getWalkGraph()
    const travelTimes = computeTravelTimes(graph, lat, lon)
    const transitFeatures = generateFeatures(graph, travelTimes)

    // Build stop coordinate map for walking expansion
    const stopCoords = new Map<string, { lat: number; lon: number }>()
    for (const [key, stop] of graph.stops) {
      stopCoords.set(key, { lat: stop.lat, lon: stop.lon })
    }

    const walkFeatures = expandWalking(
      walkGraph,
      travelTimes,
      stopCoords,
      lat,
      lon
    )

    const features = [...transitFeatures, ...walkFeatures]

    return NextResponse.json(
      { type: "FeatureCollection", features } as GeoJSON.FeatureCollection,
      { headers: { "Cache-Control": "public, max-age=300" } }
    )
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal error"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
