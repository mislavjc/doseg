import type { NextRequest } from "next/server"
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib"

import { getRealtimeData } from "@/lib/gtfs-rt"
import { secondsOfDay } from "@/lib/zagreb-time"
import {
  getGraph,
  computeTravelTimes,
  type TransitGraph,
} from "@/lib/transit-graph"
import { expandWalking } from "@/lib/walk-expand"
import { getWalkGraph } from "@/lib/walk-graph"

const MAX_SECONDS = 45 * 60
const TRANSIT_COORD_PRECISION = 4
const TRANSIT_COORD_SCALE = 10 ** TRANSIT_COORD_PRECISION
const BROTLI_QUALITY = 6

// Pre-warm graph cache on module load so the first request is fast
getGraph().catch(() => {})

const BUCKET_SECONDS = 60

function roundCoord(value: number): number {
  return Math.round(value * TRANSIT_COORD_SCALE) / TRANSIT_COORD_SCALE
}

function quantizeTransitLine(
  coords: [number, number][]
): [number, number][] {
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

      const coords = quantizeTransitLine(geo.slice(startIdx, endIdx + 1))
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

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return Response.json(
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
      !Number.isNaN(h) && !Number.isNaN(m) ? h * 3600 + m * 60 : secondsOfDay()
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
      pred: {
        fromKey: string
        patternIdx: number
        boardIdx: number
        alightIdx: number
      } | null
    }[] = []
    for (const [key, time] of travelTimes) {
      const stop = graph.stops.get(key)
      if (!stop) continue
      const pred = preds.get(key)
      const delay = delays.get(key)
      const mappedPatternIdx =
        pred && pred.patternIdx >= 0 ? patternMap.get(pred.patternIdx) : -1
      if (pred?.patternIdx !== undefined && pred.patternIdx >= 0 && mappedPatternIdx === undefined) {
        continue
      }
      const routingPred = pred
        ? {
            fromKey: pred.fromKey,
            patternIdx: pred.patternIdx >= 0 ? (mappedPatternIdx ?? -1) : -1,
            boardIdx: pred.boardIdx,
            alightIdx: pred.alightIdx,
          }
        : null

      routingStops.push({
        key,
        lat: stop.lat,
        lon: stop.lon,
        name: stop.name,
        time: Math.round(time),
        ...(delay !== undefined && { delay: Math.round(delay) }),
        pred: routingPred,
      })
    }

    const json = JSON.stringify({
      type: "FeatureCollection",
      features,
      routing: { stops: routingStops, patterns: routingPatterns },
      realtime: rtData.size > 0,
    })
    const tSerial = performance.now()

    const acceptEncoding = request.headers.get("accept-encoding") || ""
    const prefersBrotli = acceptEncoding.includes("br")
    const acceptsGzip = acceptEncoding.includes("gzip")
    const body = prefersBrotli
      ? brotliCompressSync(json, {
          params: {
            [zlibConstants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY,
          },
        })
      : acceptsGzip
        ? gzipSync(json)
        : json

    return new Response(body, {
      headers: {
        "Content-Type": "application/json",
        ...(prefersBrotli
          ? { "Content-Encoding": "br" }
          : acceptsGzip
            ? { "Content-Encoding": "gzip" }
            : {}),
        "Cache-Control": "private, max-age=30",
        "Server-Timing": `graph;dur=${(tGraph - t0).toFixed(0)}, dijkstra;dur=${(tDijkstra - tLoad).toFixed(0)}, walk;dur=${(tWalk - tDijkstra).toFixed(0)}, serial;dur=${(tSerial - tWalk).toFixed(0)}, total;dur=${(tSerial - t0).toFixed(0)}`,
      },
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal error"
    return Response.json({ error: message }, { status: 502 })
  }
}
