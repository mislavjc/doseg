import type { FeatureCollection } from "geojson"

export interface IsochroneParams {
  lat: number
  lon: number
  time?: string // HH:MM departure time
  bajs?: boolean
}

export interface IsochroneRoutingPayload {
  nodes: {
    key: string
    kind: "STOP" | "BAJS"
    lat: number
    lon: number
    name: string
    time: number
    delay?: number
    pred: {
      fromKey: string
      kind: "WALK" | "TRANSIT" | "BIKE"
      patternIdx?: number
      boardIdx?: number
      alightIdx?: number
    } | null
  }[]
  patterns: {
    stopKeys: string[]
    mode: string
    route: string
  }[]
}

export type IsochroneResponse = FeatureCollection & {
  realtime?: boolean
  walkRing?: FeatureCollection
}

export interface IsochroneRoutingResponse {
  routing: IsochroneRoutingPayload
  realtime?: boolean
}

function buildIsochroneSearchParams(params: IsochroneParams): URLSearchParams {
  const searchParams = new URLSearchParams({
    lat: String(params.lat),
    lon: String(params.lon),
  })
  if (params.time) searchParams.set("time", params.time)
  if (params.bajs) searchParams.set("bajs", "1")
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

export interface ExactRouteParams {
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
