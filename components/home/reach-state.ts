import type { Itinerary } from "@/lib/otp"
import type { PoiPhoto, POICategory } from "@/lib/overpass"
import {
  multiPolygonAreaKm2,
  pointInMultiPolygon,
  type Ring,
} from "@/lib/geo"

export type LatLon = { lat: number; lon: number }

/** Browser geolocation → callback with the point. No-op on denial/absence
 * (we never auto-prompt; this only fires from an explicit user action). */
export function requestMyLocation(onLocate: (p: LatLon) => void): void {
  navigator.geolocation?.getCurrentPosition(
    (pos) => onLocate({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
    () => {},
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
  )
}

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
  photo?: PoiPhoto
}

/** POI annotated against the current reach band (null = no origin yet). */
export type MapPoi = Poi & { inReach: boolean | null }

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

/** Title-case an ALL-CAPS name (BAJS stations arrive shouting) — leaves
 * mixed-case names untouched. Shared by leg titles and dot popups. */
export function deShout(name: string): string {
  if (name !== name.toUpperCase()) return name
  return name
    .toLowerCase()
    .replace(/(^|[\s\-./])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
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
