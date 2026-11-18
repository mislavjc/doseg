import { readFileSync } from "node:fs"
import { join } from "node:path"

import { pointInRing, type Ring } from "./geo"
import { parseJson } from "./json"

/**
 * Which kvart a coordinate falls in, from the same `data/districts.geojson`
 * the OG cards use. Server-only: it reads from disk and caches for the life of
 * the process, since the file never changes at runtime.
 */

type DistrictFeature = {
  properties: { name: string }
  geometry: { type: "Polygon"; coordinates: Ring[] }
}

let cached: DistrictFeature[] | null = null

function districts(): DistrictFeature[] {
  if (cached) return cached
  const raw = readFileSync(join(process.cwd(), "data/districts.geojson"), "utf8")
  cached = parseJson<{ features: DistrictFeature[] }>(raw).features
  return cached
}

export function districtAt(lat: number, lon: number): string | null {
  for (const feature of districts()) {
    if (pointInRing(lon, lat, feature.geometry.coordinates[0])) {
      return feature.properties.name
    }
  }
  return null
}
