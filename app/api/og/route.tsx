import { readFileSync } from "node:fs"
import { join } from "node:path"
import { renderOgCard } from "./card"

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const latStr = searchParams.get("lat")
  const lonStr = searchParams.get("lon")

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
