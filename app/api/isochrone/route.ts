import type { NextRequest } from "next/server"

import { jsonResponse } from "@/lib/api-response"
import {
  getReachabilityState,
  type ReachabilityState,
} from "@/lib/reachability-state"
import type { IsochroneRoutingPayload } from "@/lib/otp"
import { secondsOfDay } from "@/lib/zagreb-time"
import { getGraph, type TransitGraph } from "@/lib/transit-graph"
import { expandWalking } from "@/lib/walk-expand"
import { getWalkGraph } from "@/lib/walk-graph"

const MAX_SECONDS = 45 * 60
const TRANSIT_COORD_PRECISION = 4
const TRANSIT_COORD_SCALE = 10 ** TRANSIT_COORD_PRECISION

// Pre-warm graph cache on module load so the first request is fast
getGraph().catch(() => {})

const BUCKET_SECONDS = 60

type RoutingMode = "full" | "features" | "only"

function parseRoutingMode(searchParams: URLSearchParams): RoutingMode {
  const routing = searchParams.get("routing")
  if (routing === "0") return "features"
  if (routing === "only") return "only"
  return "full"
}

function roundCoord(value: number): number {
  return Math.round(value * TRANSIT_COORD_SCALE) / TRANSIT_COORD_SCALE
}

function quantizeTransitLine(coords: [number, number][]): [number, number][] {
  const quantized: [number, number][] = []
  let lastLon = NaN
  let lastLat = NaN

  for (const [lon, lat] of coords) {
    const qLon = roundCoord(lon)
    const qLat = roundCoord(lat)
    if (qLon === lastLon && qLat === lastLat) continue
    quantized.push([qLon, qLat])
    lastLon = qLon
    lastLat = qLat
  }

  return quantized.length >= 2 ? quantized : []
}

function generateFeatures(
  graph: TransitGraph,
  travelTimes: Map<string, number>
): GeoJSON.Feature[] {
  const buckets = new Map<number, [number, number][][]>()

  for (const pattern of graph.patterns) {
    // Skip rail — straight-line shapes between stops look bad on the map;
    // walking expansion from train stations provides the actual reachability.
    if (pattern.mode === "RAIL") continue

    const geo = pattern.geometry
    const numStops = pattern.stopKeys.length
    const numPts = geo.length
    if (numStops < 2 || numPts < 2) continue

    for (let i = 0; i < numStops - 1; i++) {
      const t1 = travelTimes.get(pattern.stopKeys[i])
      const t2 = travelTimes.get(pattern.stopKeys[i + 1])

      if (t1 === undefined || t2 === undefined) continue
      if (t1 > MAX_SECONDS || t2 > MAX_SECONDS) continue
      const time = Math.min(t1, t2)

      const startIdx = Math.round((i * (numPts - 1)) / (numStops - 1))
      const endIdx = Math.round(((i + 1) * (numPts - 1)) / (numStops - 1))
      if (endIdx <= startIdx) continue

      const coords = quantizeTransitLine(geo.slice(startIdx, endIdx + 1))
      if (coords.length < 2) continue

      const bucket = Math.floor(time / BUCKET_SECONDS) * BUCKET_SECONDS
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

function buildRoutingPayload(
  state: ReachabilityState
): IsochroneRoutingPayload {
  const graph = state.graph
  const preds = state.preds
  const delays = state.delays
  const bajsStationsByKey = state.bajsData?.stationMap ?? new Map()

  const usedPatterns = new Set<number>()
  for (const pred of preds.values()) {
    if (pred.kind === "TRANSIT" && pred.patternIdx !== undefined) {
      usedPatterns.add(pred.patternIdx)
    }
  }

  const patternMap = new Map<number, number>()
  const routingPatterns: IsochroneRoutingPayload["patterns"] = []
  for (const origIdx of usedPatterns) {
    const p = graph.patterns[origIdx]
    patternMap.set(origIdx, routingPatterns.length)
    routingPatterns.push({
      stopKeys: p.stopKeys,
      mode: p.mode,
      route: p.route,
    })
  }

  const routingNodes: IsochroneRoutingPayload["nodes"] = []
  for (const [key, time] of state.travelTimes) {
    const stop = graph.stops.get(key)
    const station = bajsStationsByKey.get(key)
    const node = stop ?? station
    if (!node) continue

    const pred = preds.get(key)
    const delay = delays.get(key)
    const mappedPatternIdx =
      pred?.kind === "TRANSIT" && pred.patternIdx !== undefined
        ? patternMap.get(pred.patternIdx)
        : undefined

    if (
      pred?.kind === "TRANSIT" &&
      pred.patternIdx !== undefined &&
      mappedPatternIdx === undefined
    ) {
      continue
    }

    const routingPred = pred
      ? {
          fromKey: pred.fromKey,
          kind: pred.kind,
          ...(pred.kind === "TRANSIT"
            ? {
                patternIdx: mappedPatternIdx,
                boardIdx: pred.boardIdx,
                alightIdx: pred.alightIdx,
              }
            : {}),
        }
      : null

    routingNodes.push({
      key,
      kind: stop ? "STOP" : "BAJS",
      lat: node.lat,
      lon: node.lon,
      name: node.name,
      time: Math.round(time),
      ...(delay !== undefined && { delay: Math.round(delay) }),
      pred: routingPred,
    })
  }

  return { nodes: routingNodes, patterns: routingPatterns }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const lat = parseFloat(searchParams.get("lat") || "")
  const lon = parseFloat(searchParams.get("lon") || "")

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return Response.json({ error: "lat and lon are required" }, { status: 400 })
  }

  // Parse departure time (HH:MM → seconds since midnight), default to now
  const timeStr = searchParams.get("time")
  let departureTime: number
  if (timeStr) {
    const [h, m] = timeStr.split(":").map(Number)
    departureTime =
      !Number.isNaN(h) && !Number.isNaN(m) ? h * 3600 + m * 60 : secondsOfDay()
  } else {
    departureTime = secondsOfDay()
  }
  const useBajs = searchParams.get("bajs") === "1"
  const routingMode = parseRoutingMode(searchParams)

  try {
    const t0 = performance.now()
    const state = await getReachabilityState({
      originLat: lat,
      originLon: lon,
      departureTime,
      useBajs,
    })
    const tState = performance.now()

    let features: GeoJSON.Feature[] = []
    let walkRingFeatures: GeoJSON.Feature[] = []
    let tWalk = tState
    if (routingMode !== "only") {
      const graph = state.graph
      const travelTimes = state.travelTimes
      const walkGraph = getWalkGraph()
      const transitFeatures = generateFeatures(graph, travelTimes)
      const walkFeatures = expandWalking(
        walkGraph,
        travelTimes,
        graph.stops,
        lat,
        lon
      )
      features = [...transitFeatures, ...walkFeatures]

      // Walk-only ring: shows how far you get by just walking (no transit)
      walkRingFeatures = expandWalking(
        walkGraph,
        new Map(),
        graph.stops,
        lat,
        lon
      )
      tWalk = performance.now()
    }

    const routing =
      routingMode === "features" ? undefined : buildRoutingPayload(state)
    const tPayload = performance.now()
    const realtime = state.rtData.size > 0

    const walkRing =
      walkRingFeatures.length > 0
        ? { type: "FeatureCollection" as const, features: walkRingFeatures }
        : undefined

    const payload =
      routingMode === "only"
        ? { routing, realtime }
        : routing
          ? {
              type: "FeatureCollection" as const,
              features,
              walkRing,
              routing,
              realtime,
            }
          : {
              type: "FeatureCollection" as const,
              features,
              walkRing,
              realtime,
            }
    const { response, serializeMs } = jsonResponse(
      payload,
      request,
      "public, max-age=300, stale-while-revalidate=600"
    )
    response.headers.set(
      "Server-Timing",
      `state;dur=${(tState - t0).toFixed(0)}, walk;dur=${(tWalk - tState).toFixed(0)}, payload;dur=${(tPayload - tWalk).toFixed(0)}, serial;dur=${serializeMs.toFixed(0)}, total;dur=${(tPayload - t0 + serializeMs).toFixed(0)}`
    )
    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error"
    return Response.json({ error: message }, { status: 502 })
  }
}
