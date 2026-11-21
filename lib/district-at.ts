import { join } from "node:path"

import { pointInRing } from "./geo"
import type { Ring } from "./geo"
import { readJsonCached } from "./page-data"

/**
 * Which kvart a coordinate falls in, from the same `data/districts.geojson`
 * the OG cards use. Server-only: it reads from disk.
 */

interface DistrictFeature {
  properties: { name: string }
  geometry: { type: "Polygon"; coordinates: Array<Ring> }
}

export function districtAt(lat: number, lon: number): string | null {
  const features =
    readJsonCached<{ features: Array<DistrictFeature> }>(
      join(process.cwd(), "data/districts.geojson")
    )?.features ?? []
  for (const f of features) {
    const [outer, ...holes] = f.geometry.coordinates
    if (
      pointInRing(lon, lat, outer) &&
      !holes.some((h) => pointInRing(lon, lat, h))
    ) {
      return f.properties.name
    }
  }
  return null
}
