import { join } from "node:path"

import { pointInRing } from "./geo"
import type { Ring } from "./geo"
import { readJsonCached } from "./page-data"

/**
 * The one reader of `data/districts.geojson` (kvart pages, OG cards, the map
 * sidebar, which kvart a coordinate falls in). Server-only: it reads from disk.
 */

export interface DistrictFeature {
  properties: { name: string }
  geometry: { type: "Polygon"; coordinates: Array<Ring> }
}

function readDistricts() {
  return readJsonCached<{ features: Array<DistrictFeature> }>(
    join(process.cwd(), "data/districts.geojson")
  )
}

export function loadDistricts(): Array<DistrictFeature> {
  return readDistricts()?.features ?? []
}

export function requireDistricts(): Array<DistrictFeature> {
  const geo = readDistricts()
  if (!geo) {
    throw new Error("data/districts.geojson missing or malformed")
  }
  return geo.features
}

export function districtContains(
  d: DistrictFeature,
  lon: number,
  lat: number
): boolean {
  const [outer, ...holes] = d.geometry.coordinates
  return (
    pointInRing(lon, lat, outer) && !holes.some((h) => pointInRing(lon, lat, h))
  )
}

export function districtAt(lat: number, lon: number): string | null {
  return (
    loadDistricts().find((f) => districtContains(f, lon, lat))?.properties
      .name ?? null
  )
}
