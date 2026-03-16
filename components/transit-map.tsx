"use client"

import { useEffect, useRef, useState } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

import { fetchIsochrone, fetchPlan, type Itinerary } from "@/lib/otp"
import { decodePolyline } from "@/lib/polyline"
import { modeColor } from "@/lib/transit"
import { RouteDetails } from "@/components/route-details"

const ZAGREB: [number, number] = [15.9819, 45.815]

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
}

const TIME_COLOR_STOPS: maplibregl.ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["get", "time"],
  0,
  "#16a34a",
  900,
  "#0891b2",
  1800,
  "#2563eb",
  2700,
  "#9333ea",
]

function createMarkerElement(): HTMLDivElement {
  const el = document.createElement("div")
  el.className = "origin-marker"
  el.innerHTML = `
    <div class="origin-marker-dot"></div>
    <div class="origin-marker-ring"></div>
  `
  return el
}

export function TransitMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const originRef = useRef<[number, number] | null>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const planAbortRef = useRef<AbortController | null>(null)
  const isoAbortRef = useRef<AbortController | null>(null)

  const [origin, setOrigin] = useState<[number, number] | null>(null)
  const [route, setRoute] = useState<Itinerary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize map
  useEffect(() => {
    if (!containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: ZAGREB,
      zoom: 12,
      attributionControl: false,
    })

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right"
    )
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right"
    )

    map.on("load", () => {
      mapRef.current = map

      map.addSource("isochrone", { type: "geojson", data: EMPTY_FC })
      map.addLayer({
        id: "isochrone-core",
        type: "line",
        source: "isochrone",
        paint: {
          "line-color": TIME_COLOR_STOPS,
          "line-width": 2,
          "line-opacity": 0.3,
        },
        layout: { "line-cap": "round", "line-join": "round" },
      })

      map.addSource("route", { type: "geojson", data: EMPTY_FC })
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        paint: {
          "line-color": "#fff",
          "line-width": 8,
          "line-opacity": 0.25,
        },
        layout: { "line-cap": "round", "line-join": "round" },
      })
      map.addLayer({
        id: "route-walk",
        type: "line",
        source: "route",
        filter: ["==", ["get", "mode"], "WALK"],
        paint: {
          "line-color": modeColor("WALK"),
          "line-width": 3,
          "line-dasharray": [1.5, 2],
        },
        layout: { "line-cap": "round", "line-join": "round" },
      })
      map.addLayer({
        id: "route-transit",
        type: "line",
        source: "route",
        filter: ["!=", ["get", "mode"], "WALK"],
        paint: {
          "line-color": [
            "match",
            ["get", "mode"],
            "TRAM",
            modeColor("TRAM"),
            "BUS",
            modeColor("BUS"),
            "#e2e8f0",
          ],
          "line-width": 4,
        },
        layout: { "line-cap": "round", "line-join": "round" },
      })
    })

    // Click → set origin
    map.on("click", (e) => {
      const coords: [number, number] = [e.lngLat.lng, e.lngLat.lat]
      originRef.current = coords
      setOrigin(coords)
      setRoute(null)
      setLoading(true)
      setError(null)
    })

    // Hover → debounced route fetch
    map.on("mousemove", (e) => {
      const o = originRef.current
      if (!o) return

      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)

      hoverTimerRef.current = setTimeout(async () => {
        if (planAbortRef.current) planAbortRef.current.abort()
        const controller = new AbortController()
        planAbortRef.current = controller

        try {
          const result = await fetchPlan(
            {
              fromLat: o[1],
              fromLon: o[0],
              toLat: e.lngLat.lat,
              toLon: e.lngLat.lng,
            },
            controller.signal
          )
          if (controller.signal.aborted) return

          if (result.itineraries.length > 0) {
            const itinerary = pickBestItinerary(result.itineraries)
            setRoute(itinerary)
            renderRoute(mapRef.current!, itinerary)
          }
        } catch {
          // Silently ignore aborted/failed hover requests
        }
      }, 150)
    })

    return () => {
      map.remove()
      mapRef.current = null
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
      if (planAbortRef.current) planAbortRef.current.abort()
    }
  }, [])

  // Origin changed → update marker + fetch isochrone
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (markerRef.current) {
      markerRef.current.remove()
      markerRef.current = null
    }

    const routeSource = map.getSource("route") as maplibregl.GeoJSONSource
    if (routeSource) routeSource.setData(EMPTY_FC)

    if (!origin) {
      const isoSource = map.getSource("isochrone") as maplibregl.GeoJSONSource
      if (isoSource) isoSource.setData(EMPTY_FC)
      return
    }

    markerRef.current = new maplibregl.Marker({
      element: createMarkerElement(),
    })
      .setLngLat(origin)
      .addTo(map)

    if (isoAbortRef.current) isoAbortRef.current.abort()
    const controller = new AbortController()
    isoAbortRef.current = controller

    fetchIsochrone({ lat: origin[1], lon: origin[0] }, controller.signal)
      .then((geojson) => {
        if (controller.signal.aborted) return
        const isoSource = map.getSource(
          "isochrone"
        ) as maplibregl.GeoJSONSource
        if (isoSource) isoSource.setData(geojson)
        setLoading(false)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        console.error("Isochrone fetch failed:", err)
        setError("Could not load reachability data")
        setLoading(false)
      })

    return () => {
      controller.abort()
    }
  }, [origin])

  return (
    <div className="relative h-svh w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* Title + legend */}
      <div className="panel absolute top-4 left-4">
        <div className="text-[15px] font-semibold tracking-tight text-slate-900">
          doseg
        </div>
        <div className="mb-3 text-[11px] text-slate-500">
          Zagreb transit reachability
        </div>
        <div className="mb-1 text-[10px] font-medium text-slate-400">
          Trip duration
        </div>
        <div
          className="h-2 w-full rounded-sm"
          style={{
            background:
              "linear-gradient(to right, #16a34a, #0891b2, #2563eb, #9333ea)",
          }}
        />
        <div className="mt-1 flex justify-between text-[10px] tabular-nums text-slate-500">
          <span>0</span>
          <span>15</span>
          <span>30</span>
          <span>45 min</span>
        </div>
      </div>

      {!origin && (
        <div className="panel absolute bottom-8 left-1/2 -translate-x-1/2">
          <div className="text-[13px] text-slate-700">
            Click anywhere to see how far you can go
          </div>
        </div>
      )}

      {loading && (
        <div className="absolute top-0 right-0 left-0 z-10">
          <div className="loading-bar" />
        </div>
      )}

      {error && (
        <div className="panel absolute top-5 left-1/2 -translate-x-1/2 text-[12px] text-red-600">
          {error}
        </div>
      )}

      {route && <RouteDetails itinerary={route} />}
    </div>
  )
}

function pickBestItinerary(itineraries: Itinerary[]): Itinerary {
  const withTransit = itineraries.filter((it) =>
    it.legs.some((l) => l.mode !== "WALK")
  )
  const candidates = withTransit.length > 0 ? withTransit : itineraries
  return candidates.reduce((best, it) =>
    it.duration < best.duration ? it : best
  )
}

function renderRoute(map: maplibregl.Map, itinerary: Itinerary) {
  const features: GeoJSON.Feature[] = itinerary.legs.map((leg) => ({
    type: "Feature",
    properties: { mode: leg.mode, route: leg.route || "" },
    geometry: {
      type: "LineString",
      coordinates: decodePolyline(leg.legGeometry.points),
    },
  }))

  const source = map.getSource("route") as maplibregl.GeoJSONSource
  if (source) {
    source.setData({ type: "FeatureCollection", features })
  }
}
