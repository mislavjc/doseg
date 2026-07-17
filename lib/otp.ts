import type { FeatureCollection } from "geojson"
import type {
  IsochroneResponse as RustIsochroneResponse,
  RoutingOnlyResponse,
} from "./generated"

interface IsochroneParams {
  lat: number
  lon: number
  time?: string // HH:MM departure time
  bajs?: boolean
}

// Re-export Rust-generated types as the canonical source of truth
export type IsochroneResponse = RustIsochroneResponse
type IsochroneRoutingResponse = RoutingOnlyResponse

/** The isochrone server rounds lat/lon to 3 decimals and departure time to
 * 5-minute buckets before computing, so requests inside the same bucket are
 * identical. Snap the URL to that grid too — otherwise every click produces a
 * unique query string and the CDN cache in front of the server never hits. */
function snapTime(time: string): string {
  const [h, m] = time.split(":").map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return time
  const snapped = Math.round((h * 60 + m) / 5) * 5
  const hh = Math.floor(snapped / 60) % 24
  const mm = snapped % 60
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}

/** "Sada" = the actual current Zagreb wall-clock time. Sent explicitly even in
 * now-mode so the URL is an honest cache key — a time-less URL would pin
 * whatever "now" the server saw at cache-fill time for the whole CDN TTL. */
function zagrebNow(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zagreb",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date())
}

/** Reach-model version, used purely as a cache key. The CDN (and, via its
 * TTL override, the browser) caches /api/isochrone for hours, so a model
 * change ships instantly only if the URL changes with it. Bump whenever the
 * engine's semantics change. */
const ISOCHRONE_MODEL_VERSION = "4"

function buildIsochroneSearchParams(params: IsochroneParams): URLSearchParams {
  const searchParams = new URLSearchParams({
    lat: params.lat.toFixed(3),
    lon: params.lon.toFixed(3),
  })
  searchParams.set("time", snapTime(params.time ?? zagrebNow()))
  if (params.bajs) searchParams.set("bajs", "1")
  searchParams.set("v", ISOCHRONE_MODEL_VERSION)
  return searchParams
}

export async function fetchIsochrone(
  params: IsochroneParams,
  signal?: AbortSignal
): Promise<IsochroneResponse> {
  const searchParams = buildIsochroneSearchParams(params)
  searchParams.set("routing", "0")
  const response = await fetch(`/api/isochrone?${searchParams.toString()}`, {
    signal,
  })
  if (!response.ok) {
    throw new Error(`Isochrone request failed: ${response.status}`)
  }
  return response.json()
}

export async function fetchIsochroneRouting(
  params: IsochroneParams,
  signal?: AbortSignal
): Promise<IsochroneRoutingResponse> {
  const searchParams = buildIsochroneSearchParams(params)
  searchParams.set("routing", "only")
  const response = await fetch(`/api/isochrone?${searchParams.toString()}`, {
    signal,
  })
  if (!response.ok) {
    throw new Error(`Isochrone routing request failed: ${response.status}`)
  }
  return response.json()
}

export async function fetchBajsStations(
  signal?: AbortSignal
): Promise<FeatureCollection> {
  const response = await fetch("/api/bajs", { signal })
  if (!response.ok) {
    throw new Error(`BAJS request failed: ${response.status}`)
  }
  return response.json()
}

interface ExactRouteParams {
  originLat: number
  originLon: number
  destLat: number
  destLon: number
  time?: string
  bajs?: boolean
  preferredKey?: string | null
}

export async function fetchExactRoute(
  params: ExactRouteParams,
  signal?: AbortSignal
): Promise<Itinerary> {
  const searchParams = new URLSearchParams({
    originLat: String(params.originLat),
    originLon: String(params.originLon),
    destLat: String(params.destLat),
    destLon: String(params.destLon),
  })
  if (params.time) searchParams.set("time", params.time)
  if (params.bajs) searchParams.set("bajs", "1")
  if (params.preferredKey) searchParams.set("preferredKey", params.preferredKey)

  const response = await fetch(`/api/route?${searchParams.toString()}`, {
    signal,
  })
  if (!response.ok) {
    throw new Error(`Route request failed: ${response.status}`)
  }
  return response.json()
}

export interface Itinerary {
  duration: number
  walkDistance: number
  bikeDistance: number
  transfers: number
  legs: Leg[]
}

export interface Leg {
  mode: string
  from: Place
  to: Place
  duration: number
  distance: number
  route?: string
  delay?: number // RT delay in seconds (positive = late, negative = early)
  legGeometry: {
    points: string
    coords?: [number, number][]
  }
}

export interface Place {
  name: string
  lat: number
  lon: number
}
