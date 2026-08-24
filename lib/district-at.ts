import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Which kvart a coordinate falls in, from the same `data/districts.geojson`
 * the OG cards use. Server-only: it reads from disk and caches for the life of
 * the process, since the file never changes at runtime.
 */

type DistrictFeature = {
  properties: { name: string }
  geometry: { type: "Polygon"; coordinates: number[][][] }
}

let cached: DistrictFeature[] | null = null

function districts(): DistrictFeature[] {
  if (cached) return cached
  const raw = readFileSync(join(process.cwd(), "data/districts.geojson"), "utf8")
  cached = (JSON.parse(raw) as { features: DistrictFeature[] }).features
  return cached
}

/** Ray casting. `ring` is GeoJSON order, so [lon, lat] per point. */
function pointInRing(lat: number, lon: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export function districtAt(lat: number, lon: number): string | null {
  for (const feature of districts()) {
    if (pointInRing(lat, lon, feature.geometry.coordinates[0])) {
      return feature.properties.name
    }
  }
  return null
}
