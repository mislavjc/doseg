import type { FeatureCollection } from "geojson"

export interface IsochroneParams {
  lat: number
  lon: number
  time?: string // HH:MM departure time
}

export async function fetchIsochrone(
  params: IsochroneParams,
  signal?: AbortSignal
): Promise<FeatureCollection> {
  const { lat, lon, time } = params
  let url = `/api/isochrone?lat=${lat}&lon=${lon}`
  if (time) url += `&time=${encodeURIComponent(time)}`
  const response = await fetch(url, {
    signal,
  })
  if (!response.ok) {
    throw new Error(`Isochrone request failed: ${response.status}`)
  }
  return response.json()
}

export interface Itinerary {
  duration: number
  walkDistance: number
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
