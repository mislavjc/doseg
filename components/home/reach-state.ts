import type { Itinerary } from "@/lib/otp"
import type { POICategory } from "@/lib/overpass"
import {
  multiPolygonAreaKm2,
  pointInMultiPolygon,
  type Ring,
} from "@/lib/geo"

export type LatLon = { lat: number; lon: number }

/** Panel state machine — docs/map-redesign-spec.md §3. */
export type PanelState =
  | { mode: "empty" }
  | { mode: "loading"; origin: LatLon }
  | { mode: "error"; origin: LatLon }
  | { mode: "reach"; origin: LatLon }
  | { mode: "route-loading"; origin: LatLon; dest: LatLon }
  | { mode: "route"; origin: LatLon; dest: LatLon; itinerary: Itinerary }

export type Poi = {
  id: number
  name: string
  lat: number
  lon: number
  category: POICategory
}

export type WalkAreaFeatureLike = {
  properties: { time: number }
  geometry: { type: "MultiPolygon"; coordinates: Ring[][] }
}

/** The widest band at or under `maxSeconds` — the reach outline. */
export function outerBand(
  features: WalkAreaFeatureLike[],
  maxSeconds: number
): WalkAreaFeatureLike | null {
  let best: WalkAreaFeatureLike | null = null
  for (const f of features) {
    const t = f.properties.time
    if (t <= maxSeconds && (!best || t > best.properties.time)) best = f
  }
  return best
}

export function reachAreaKm2(band: WalkAreaFeatureLike): number {
  return multiPolygonAreaKm2(band.geometry.coordinates)
}

export function countPoisInReach(
  pois: Poi[],
  band: WalkAreaFeatureLike
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const poi of pois) {
    if (pointInMultiPolygon(poi.lon, poi.lat, band.geometry.coordinates)) {
      counts[poi.category] = (counts[poi.category] ?? 0) + 1
    }
  }
  return counts
}

export function pointInReach(p: LatLon, band: WalkAreaFeatureLike): boolean {
  return pointInMultiPolygon(p.lon, p.lat, band.geometry.coordinates)
}

/** Outer rings, downsampled, for the district-context API payload. */
export function outerRingsForApi(band: WalkAreaFeatureLike): Ring[] {
  return band.geometry.coordinates.map((polygon) => {
    const ring = polygon[0]
    const step = Math.max(1, Math.floor(ring.length / 200))
    const sampled: Ring = []
    for (let i = 0; i < ring.length; i += step) sampled.push(ring[i])
    return sampled
  })
}

export type DistrictContext = {
  district: { name: string; rank: number; score: number } | null
  totalDistricts: number
  districtsInReach: number
  cityAreaKm2: number
}

/** "1 presjedanje" / "2 presjedanja" / "bez presjedanja". */
export function transfersLabel(n: number): string {
  if (n <= 0) return "bez presjedanja"
  return `${n} ${n === 1 ? "presjedanje" : "presjedanja"}`
}

// One formatter instance — Intl.DateTimeFormat is expensive to construct and
// formatClock runs on warm render paths (the polazak control, route summary).
const CLOCK_FMT = new Intl.DateTimeFormat("hr-HR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Zagreb",
})

export function formatClock(date: Date): string {
  return CLOCK_FMT.format(date)
}
