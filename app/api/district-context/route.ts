import { join } from "node:path"
import type { NextRequest } from "next/server"
import { z } from "zod"

import { jsonResponse } from "@/lib/api-response"
import { loadScores } from "@/lib/district-scores"
import { pointInRing, type Ring } from "@/lib/geo"
import { readJsonCached } from "@/lib/page-data"

/**
 * Origin → district context for the map sidebar (map redesign §4 stats CTA):
 * which district was clicked (name/rank/score) and how many districts the
 * reach polygon touches. The reach outer ring comes from the client (it
 * already has the isochrone); district polygons stay on the server.
 */

type DistrictFeature = {
  properties: { name: string }
  geometry: { type: "Polygon"; coordinates: Ring[] }
}

type DistrictScore = { name: string; rank: number; score: number }

let cache: {
  features: DistrictFeature[]
  scores: Map<string, DistrictScore>
  cityAreaKm2: number
} | null = null

function loadDistricts() {
  if (cache) return cache
  const geo = readJsonCached<{ features: DistrictFeature[] }>(
    join(process.cwd(), "data/districts.geojson")
  )
  if (!geo) throw new Error("data/districts.geojson missing or malformed")
  // Day-filtered scores (same as the kvart pages), not the pooled legacy file.
  const districts = loadScores()?.districts ?? []
  cache = {
    features: geo.features,
    scores: new Map(
      districts.map((d) => [d.name, { name: d.name, rank: d.rank, score: d.score }])
    ),
    cityAreaKm2: districts.reduce((s, d) => s + d.areaKm2, 0),
  }
  return cache
}

function districtContains(d: DistrictFeature, lon: number, lat: number) {
  const [outer, ...holes] = d.geometry.coordinates
  if (!pointInRing(lon, lat, outer)) return false
  return !holes.some((h) => pointInRing(lon, lat, h))
}

/** Sampled two-way vertex test — close enough for a "N od 17" count. */
function districtTouchesReach(d: DistrictFeature, reachRing: Ring) {
  const outer = d.geometry.coordinates[0]
  const step = Math.max(1, Math.floor(outer.length / 80))
  for (let i = 0; i < outer.length; i += step) {
    if (pointInRing(outer[i][0], outer[i][1], reachRing)) return true
  }
  const rStep = Math.max(1, Math.floor(reachRing.length / 120))
  for (let i = 0; i < reachRing.length; i += rStep) {
    if (districtContains(d, reachRing[i][0], reachRing[i][1])) return true
  }
  return false
}

const RequestBody = z.object({
  origin: z.object({ lat: z.number(), lon: z.number() }),
  rings: z.array(z.array(z.tuple([z.number(), z.number()]))).default([]),
})

export async function POST(request: NextRequest) {
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 })
  }
  const body = RequestBody.safeParse(json)
  if (!body.success) {
    return Response.json({ error: "missing origin" }, { status: 400 })
  }
  const { origin, rings } = body.data

  const { features, scores, cityAreaKm2 } = loadDistricts()

  const originDistrict = features.find((d) =>
    districtContains(d, origin.lon, origin.lat)
  )
  const score = originDistrict
    ? (scores.get(originDistrict.properties.name) ?? null)
    : null

  const districtsInReach = features.filter((d) =>
    rings.some((ring) => districtTouchesReach(d, ring))
  ).length

  const { response } = jsonResponse(
    {
      district: score,
      totalDistricts: features.length,
      districtsInReach,
      cityAreaKm2,
    },
    request,
    "private, max-age=60"
  )
  return response
}
