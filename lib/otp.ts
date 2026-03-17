import type { FeatureCollection } from "geojson"

export interface IsochroneParams {
  lat: number
  lon: number
}

export async function fetchIsochrone(
  params: IsochroneParams,
  signal?: AbortSignal
): Promise<FeatureCollection> {
  const { lat, lon } = params
  const response = await fetch(`/api/isochrone?lat=${lat}&lon=${lon}`, {
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
