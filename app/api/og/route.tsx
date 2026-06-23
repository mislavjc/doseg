import { readFileSync } from "node:fs"
import { join } from "node:path"

import { loadLineData } from "@/lib/line-data"
import { loadStopData, loadStopHeroMeta } from "@/lib/stop-data"

import { renderOgCard } from "./card"
import { renderLineOgCard } from "./line-card"
import { renderStopOgCard } from "./stop-card"

export const runtime = "nodejs"

type District = {
  name: string
  score: number
  rank: number
  population: number
  tramLines: string[]
  busLines: string[]
}

type DistrictFeature = {
  type: "Feature"
  properties: { name: string; osmId: number; population: number }
  geometry: { type: "Polygon"; coordinates: number[][][] }
}

type DistrictScores = {
  districts: District[]
}

let cachedGeoJSON: DistrictFeature[] | null = null
let cachedScores: DistrictScores | null = null

function getDistrictGeoJSON(): DistrictFeature[] {
  if (cachedGeoJSON) return cachedGeoJSON
  const raw = readFileSync(
    join(process.cwd(), "data/districts.geojson"),
    "utf8"
  )
  const parsed = JSON.parse(raw)
  cachedGeoJSON = parsed.features as DistrictFeature[]
  return cachedGeoJSON
}

function getDistrictScores(): DistrictScores {
  if (cachedScores) return cachedScores
  const raw = readFileSync(
    join(process.cwd(), "data/district-scores.json"),
    "utf8"
  )
  cachedScores = JSON.parse(raw) as DistrictScores
  return cachedScores
}

function pointInPolygon(
  lat: number,
  lon: number,
  polygon: number[][]
): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0]
    const yi = polygon[i][1]
    const xj = polygon[j][0]
    const yj = polygon[j][1]

    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function findDistrict(
  lat: number,
  lon: number
): { name: string; score: number; rank: number } | null {
  const features = getDistrictGeoJSON()
  const scores = getDistrictScores()

  for (const feature of features) {
    const ring = feature.geometry.coordinates[0]
    if (pointInPolygon(lat, lon, ring)) {
      const districtScore = scores.districts.find(
        (d) => d.name === feature.properties.name
      )
      if (districtScore) {
        return {
          name: districtScore.name,
          score: districtScore.score,
          rank: districtScore.rank,
        }
      }
      return { name: feature.properties.name, score: 0, rank: 0 }
    }
  }
  return null
}

/**
 * Crawler budget: Twitterbot aborts after ~4s, and the line card costs
 * 3-6s to render (satori rasterizes the full hero PNG). Two layers fix it:
 * a per-process buffer cache (warm after one hit per line, ~60MB ceiling for
 * all 154) and CDN cache headers so the edge serves repeat crawls instantly.
 */
const lineCardCache = new Map<string, ArrayBuffer>()

const LINE_CARD_HEADERS = {
  "Content-Type": "image/png",
  "Cache-Control": "public, max-age=3600, s-maxage=2592000, stale-while-revalidate=604800",
}

async function lineCardResponse(linija: string): Promise<Response | null> {
  const cached = lineCardCache.get(linija)
  if (cached) return new Response(cached, { headers: LINE_CARD_HEADERS })
  const line = loadLineData(linija)
  if (!line) return new Response("Unknown line", { status: 404 })
  // Hero-map card; falls back to the generic tram card when the line's
  // hero asset is missing.
  const heroCard = renderLineOgCard(line)
  if (!heroCard) return null
  const body = await heroCard.arrayBuffer()
  lineCardCache.set(linija, body)
  return new Response(body, { headers: LINE_CARD_HEADERS })
}

const stopCardCache = new Map<string, ArrayBuffer>()

async function stopCardResponse(stanica: string): Promise<Response | null> {
  const cached = stopCardCache.get(stanica)
  if (cached) return new Response(cached, { headers: LINE_CARD_HEADERS })
  const stop = loadStopData(stanica)
  if (!stop) return new Response("Unknown stop", { status: 404 })
  // Hero-map card; null when the stop has no baked hero (long-tail stops) so
  // the caller can fall back to the generic card.
  const heroCard = renderStopOgCard(stop, loadStopHeroMeta(stanica))
  if (!heroCard) return null
  const body = await heroCard.arrayBuffer()
  stopCardCache.set(stanica, body)
  return new Response(body, { headers: LINE_CARD_HEADERS })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const latStr = searchParams.get("lat")
  const lonStr = searchParams.get("lon")
  const linija = searchParams.get("linija")
  const stanica = searchParams.get("stanica")

  if (linija) {
    const cardResponse = await lineCardResponse(linija)
    if (cardResponse) return cardResponse
    const line = loadLineData(linija)
    if (!line) return new Response("Unknown line", { status: 404 })
    const peak = line.stats.peakHeadwayMin
    return renderOgCard({
      headline: `Linija ${line.broj}: ${line.terminals[0]} - ${line.terminals[1]}`,
      sub: peak
        ? `vozni red · u špici svakih ${Math.round(peak)} min`
        : "vozni red i stanice",
    })
  }

  if (stanica) {
    const cardResponse = await stopCardResponse(stanica)
    if (cardResponse) return cardResponse
    const stop = loadStopData(stanica)
    if (!stop) return new Response("Unknown stop", { status: 404 })
    // No baked hero — generic text card.
    return renderOgCard({
      headline: `Stanica ${stop.name}`,
      sub: `${stop.lineCount} ${stop.lineCount === 1 ? "linija" : "linije"} · doseg javnim prijevozom`,
    })
  }

  const hasCoords = latStr && lonStr
  const lat = hasCoords ? parseFloat(latStr) : NaN
  const lon = hasCoords ? parseFloat(lonStr) : NaN

  if (hasCoords && (Number.isNaN(lat) || Number.isNaN(lon))) {
    return new Response("Invalid coordinates", { status: 400 })
  }

  const district = hasCoords ? findDistrict(lat, lon) : null

  return renderOgCard({
    headline: district ? district.name : "Koliko grada stigneš?",
    sub:
      district && district.score > 0
        ? `${district.score}/100 · #${district.rank} od 17 kvartova`
        : undefined,
  })
}
