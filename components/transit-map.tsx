"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { motion, AnimatePresence, MotionConfig } from "motion/react"
import {
  useQueryStates,
  useQueryState,
  parseAsFloat,
  parseAsString,
} from "nuqs"

import {
  fetchBajsStations,
  fetchExactRoute,
  fetchIsochrone,
  fetchIsochroneRouting,
  type IsochroneResponse,
  type Itinerary,
} from "@/lib/otp"
import { decodePolyline } from "@/lib/polyline"
import {
  parseRoutingData,
  findNearestStop,
  reconstructRoute,
  type RoutingData,
} from "@/lib/route-reconstruct"
import { modeColor } from "@/lib/transit"
import { formatTime } from "@/lib/zagreb-time"
import { RouteDetails } from "@/components/route-details"
import { TimePicker } from "@/components/time-picker"
import { OnboardingDialog } from "@/components/onboarding-dialog"
import { Kbd, KbdGroup } from "@/components/ui/kbd"

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
  const isoAbortRef = useRef<AbortController | null>(null)
  const routingAbortRef = useRef<AbortController | null>(null)
  const bajsAbortRef = useRef<AbortController | null>(null)
  const exactRouteAbortRef = useRef<AbortController | null>(null)
  const exactRouteTimerRef = useRef<number>(0)
  const exactRouteSeqRef = useRef(0)
  const routingDataRef = useRef<RoutingData | null>(null)
  const handleDestinationRef = useRef<
    ((lat: number, lng: number) => void) | null
  >(null)
  const pendingDestinationRef = useRef<{ lat: number; lng: number } | null>(
    null
  )
  const lastNearestRef = useRef<string | null>(null)
  const routeTailOriginRef = useRef<[number, number] | null>(null)
  const rafRef = useRef<number>(0)
  const isTouchRef = useRef(false)

  const [coords, setCoords] = useQueryStates({
    lat: parseAsFloat,
    lon: parseAsFloat,
  })
  const [time, setTime] = useQueryState("t", parseAsString)
  const [bajs, setBajs] = useQueryState("bajs", parseAsString)
  const [defaultTime] = useState(formatTime)
  const effectiveTime = time ?? defaultTime
  const bajsEnabled = bajs === "1"
  const effectiveTimeRef = useRef(effectiveTime)
  const bajsEnabledRef = useRef(bajsEnabled)
  const [route, setRoute] = useState<Itinerary | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [showStatsCta, setShowStatsCta] = useState(false)
  const statsCtaDismissedRef = useRef(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [vehiclePositions, setVehiclePositions] = useState<
    GeoJSON.FeatureCollection
  >(EMPTY_FC)
  const [vehiclesEnabled, setVehiclesEnabled] = useState(false)
  const [poiEnabled, setPoiEnabled] = useState(false)
  const [layersOpen, setLayersOpen] = useState(false)
  const poiAbortRef = useRef<AbortController | null>(null)
  const vehicleIntervalRef = useRef<number>(0)
  const prevVehiclesJsonRef = useRef("")

  const originLat = coords.lat
  const originLon = coords.lon
  const hasOrigin = originLat !== null && originLon !== null
  const initialLoadRef = useRef(hasOrigin)

  useEffect(() => {
    effectiveTimeRef.current = effectiveTime
  }, [effectiveTime])

  useEffect(() => {
    bajsEnabledRef.current = bajsEnabled
  }, [bajsEnabled])

  // ESC to clear origin
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && originRef.current) {
        setCoords({ lat: null, lon: null })
        setRoute(null)
        setRouteLoading(false)
        setError(null)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [setCoords])

  // Map initialization (runs once)
  useEffect(() => {
    if (!containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: ZAGREB,
      zoom: 12,
      attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    })

    map.getContainer().addEventListener(
      "touchstart",
      () => {
        isTouchRef.current = true
      },
      { once: true, passive: true }
    )

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right"
    )
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right"
    )

    map.on("load", () => {
      mapRef.current = map

      // Lighten the dark basemap slightly
      if (map.getLayer("background")) {
        map.setPaintProperty("background", "background-color", "#1a1a24")
      }

      map.addSource("isochrone", { type: "geojson", data: EMPTY_FC })
      map.addLayer({
        id: "isochrone-core",
        type: "line",
        source: "isochrone",
        filter: ["<=", ["get", "time"], 2700],
        paint: {
          "line-color": TIME_COLOR_STOPS,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            1,
            13,
            1.5,
            16,
            2.5,
          ],
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            0.4,
            13,
            0.5,
            16,
            0.65,
          ],
          "line-blur": ["interpolate", ["linear"], ["zoom"], 10, 1, 14, 0.5],
        },
        layout: { "line-cap": "round", "line-join": "round" },
      })

      // Walk-ring: walking-only reach for comparison
      map.addSource("walk-ring", { type: "geojson", data: EMPTY_FC })
      map.addLayer({
        id: "walk-ring",
        type: "line",
        source: "walk-ring",
        paint: {
          "line-color": TIME_COLOR_STOPS,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            0.8,
            13,
            1.2,
            16,
            2,
          ],
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            0.15,
            13,
            0.25,
            16,
            0.35,
          ],
          "line-dasharray": [2, 3],
        },
        layout: { "line-cap": "round", "line-join": "round" },
      })

      map.addSource("bajs", { type: "geojson", data: EMPTY_FC })
      map.addLayer({
        id: "bajs-stations-halo",
        type: "circle",
        source: "bajs",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            4,
            13,
            7,
            16,
            10,
          ],
          "circle-color": modeColor("BIKE"),
          "circle-opacity": 0.1,
        },
      })
      map.addLayer({
        id: "bajs-stations",
        type: "circle",
        source: "bajs",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            2.5,
            13,
            4.5,
            16,
            6.5,
          ],
          "circle-color": [
            "case",
            ["!", ["get", "isRenting"]],
            "rgba(148, 163, 184, 0.8)",
            ["==", ["get", "bikesAvailable"], 0],
            "rgba(249, 115, 22, 0.8)",
            ["<=", ["get", "bikesAvailable"], 2],
            "rgba(245, 158, 11, 0.8)",
            "rgba(245, 158, 11, 0.8)",
          ],
          "circle-stroke-width": 1,
          "circle-stroke-color": [
            "case",
            ["!", ["get", "isReturning"]],
            "rgba(239, 68, 68, 0.8)",
            ["==", ["get", "docksAvailable"], 0],
            "rgba(239, 68, 68, 0.8)",
            "rgba(255, 255, 255, 0.4)",
          ],
        },
      })

      // Vehicle positions layer
      map.addSource("vehicle-positions", { type: "geojson", data: EMPTY_FC })
      map.addLayer({
        id: "vehicle-positions",
        type: "circle",
        source: "vehicle-positions",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            2,
            13,
            4,
            16,
            5,
          ],
          "circle-color": "#22d3ee",
          "circle-opacity": 0.85,
          "circle-stroke-width": 0.5,
          "circle-stroke-color": "rgba(255, 255, 255, 0.3)",
        },
      })

      // Vehicle line number labels
      map.addLayer({
        id: "vehicle-labels",
        type: "symbol",
        source: "vehicle-positions",
        minzoom: 12,
        layout: {
          "text-field": ["get", "line"],
          "text-size": 9,
          "text-offset": [0, -1.2],
          "text-allow-overlap": false,
          "text-ignore-placement": false,
          "text-font": ["Open Sans Bold"],
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "rgba(0, 0, 0, 0.7)",
          "text-halo-width": 1,
        },
      })

      // POI layer: colored circles with category letter
      map.addSource("poi", { type: "geojson", data: EMPTY_FC })
      map.addLayer({
        id: "poi-bg",
        type: "circle",
        source: "poi",
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            10, 5,
            13, 8,
            16, 11,
          ],
          "circle-color": [
            "match",
            ["get", "category"],
            "hospital", "#ef4444",
            "school", "#3b82f6",
            "park", "#22c55e",
            "pharmacy", "#f97316",
            "supermarket", "#eab308",
            "#94a3b8",
          ],
          "circle-opacity": 0.9,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "rgba(255, 255, 255, 0.6)",
        },
      })
      // POI category letter on circle
      map.addLayer({
        id: "poi-layer",
        type: "symbol",
        source: "poi",
        layout: {
          "text-field": [
            "match",
            ["get", "category"],
            "hospital", "H",
            "school", "Š",
            "park", "P",
            "pharmacy", "Lj",
            "supermarket", "S",
            "?",
          ],
          "text-size": [
            "interpolate", ["linear"], ["zoom"],
            10, 7,
            13, 9,
            16, 11,
          ],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "text-font": ["Open Sans Bold"],
        },
        paint: {
          "text-color": "#ffffff",
        },
      })
      // POI name labels (visible at higher zoom)
      map.addLayer({
        id: "poi-labels",
        type: "symbol",
        source: "poi",
        minzoom: 14,
        layout: {
          "text-field": ["get", "name"],
          "text-size": 10,
          "text-offset": [0, 1.6],
          "text-anchor": "top",
          "text-allow-overlap": false,
          "text-ignore-placement": false,
          "text-max-width": 12,
          "text-font": ["Open Sans Regular"],
        },
        paint: {
          "text-color": "#e2e8f0",
          "text-halo-color": "rgba(0, 0, 0, 0.8)",
          "text-halo-width": 1,
        },
      })

      // POI click popup
      map.on("click", "poi-layer", (e) => {
        if (!e.features || e.features.length === 0) return
        e.originalEvent.stopPropagation()
        const f = e.features[0]
        const coords = (f.geometry as GeoJSON.Point).coordinates.slice() as [
          number,
          number,
        ]
        const p = f.properties as Record<string, unknown>
        const name = String(p.name ?? "Ustanova")
        const category = String(p.category ?? "")
        const categoryLabels: Record<string, string> = {
          hospital: "Bolnica",
          school: "Škola",
          park: "Park",
          pharmacy: "Ljekarna",
          supermarket: "Supermarket",
        }
        const categoryColors: Record<string, string> = {
          hospital: "#ef4444",
          school: "#3b82f6",
          park: "#22c55e",
          pharmacy: "#f97316",
          supermarket: "#eab308",
        }
        const label = categoryLabels[category] ?? category
        const color = categoryColors[category] ?? "#94a3b8"

        new maplibregl.Popup({
          closeButton: true,
          closeOnClick: true,
          className: "poi-popup",
          maxWidth: "220px",
        })
          .setLngLat(coords)
          .setHTML(
            `<div style="font-family:system-ui,sans-serif;color:#e2e8f0;font-size:12px;line-height:1.5">` +
              `<div style="font-weight:600;font-size:13px;margin-bottom:4px">${name}</div>` +
              `<div style="color:${color};font-size:11px">${label}</div>` +
              `</div>`
          )
          .addTo(map)
      })
      map.on("mouseenter", "poi-layer", () => {
        map.getCanvas().style.cursor = "pointer"
      })
      map.on("mouseleave", "poi-layer", () => {
        map.getCanvas().style.cursor = originRef.current ? "crosshair" : ""
      })
      map.on("mouseenter", "poi-labels", () => {
        map.getCanvas().style.cursor = "pointer"
      })
      map.on("mouseleave", "poi-labels", () => {
        map.getCanvas().style.cursor = originRef.current ? "crosshair" : ""
      })

      // BAJS station click popup
      map.on("click", "bajs-stations", (e) => {
        if (!e.features || e.features.length === 0) return
        e.originalEvent.stopPropagation()
        const f = e.features[0]
        const coords = (f.geometry as GeoJSON.Point).coordinates.slice() as [number, number]
        const p = f.properties as Record<string, unknown>
        const name = String(p.name ?? "Stanica")
        const bikes = Number(p.bikesAvailable ?? 0)
        const docks = Number(p.docksAvailable ?? 0)
        const isRenting = p.isRenting !== false && p.isRenting !== "false" && p.isRenting !== 0
        const isReturning = p.isReturning !== false && p.isReturning !== "false" && p.isReturning !== 0

        let status = "Aktivna"
        if (!isRenting && !isReturning) status = "Ne radi"
        else if (!isRenting) status = "Ne iznajmljuje"
        else if (!isReturning) status = "Ne prima bicikle"

        new maplibregl.Popup({
          closeButton: true,
          closeOnClick: true,
          className: "bajs-popup",
          maxWidth: "220px",
        })
          .setLngLat(coords)
          .setHTML(
            `<div style="font-family:system-ui,sans-serif;color:#e2e8f0;font-size:12px;line-height:1.5">` +
              `<div style="font-weight:600;font-size:13px;margin-bottom:4px">${name}</div>` +
              `<div>${bikes} bicikala</div>` +
              `<div>${docks} mjesta</div>` +
              `<div style="margin-top:4px;color:${status === "Aktivna" ? "#4ade80" : "#f87171"};font-size:11px">${status}</div>` +
            `</div>`
          )
          .addTo(map)
      })
      map.on("mouseenter", "bajs-stations", () => {
        map.getCanvas().style.cursor = "pointer"
      })
      map.on("mouseleave", "bajs-stations", () => {
        map.getCanvas().style.cursor = originRef.current ? "crosshair" : ""
      })

      // Preview line: instant straight line from origin to cursor
      map.addSource("preview", { type: "geojson", data: EMPTY_FC })
      map.addLayer({
        id: "preview-line",
        type: "line",
        source: "preview",
        paint: {
          "line-color": "rgba(255, 255, 255, 0.25)",
          "line-width": 1.5,
          "line-dasharray": [4, 4],
        },
        layout: { "line-cap": "round" },
      })

      // Destination dot
      map.addSource("dest-dot", {
        type: "geojson",
        data: EMPTY_FC,
      })
      map.addLayer({
        id: "dest-dot",
        type: "circle",
        source: "dest-dot",
        paint: {
          "circle-radius": 4,
          "circle-color": "rgba(255, 255, 255, 0.7)",
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "rgba(255, 255, 255, 0.3)",
        },
      })

      // Route layers (on top)
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
        id: "route-bike",
        type: "line",
        source: "route",
        filter: ["==", ["get", "mode"], "BIKE"],
        paint: {
          "line-color": modeColor("BIKE"),
          "line-width": 3.5,
          "line-dasharray": [0.8, 1.4],
        },
        layout: { "line-cap": "round", "line-join": "round" },
      })
      map.addLayer({
        id: "route-transit",
        type: "line",
        source: "route",
        filter: [
          "all",
          ["!=", ["get", "mode"], "WALK"],
          ["!=", ["get", "mode"], "BIKE"],
        ],
        paint: {
          "line-color": [
            "match",
            ["get", "mode"],
            "BIKE",
            modeColor("BIKE"),
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
      map.addSource("route-tail", { type: "geojson", data: EMPTY_FC })
      map.addLayer({
        id: "route-tail-casing",
        type: "line",
        source: "route-tail",
        paint: {
          "line-color": "#fff",
          "line-width": 8,
          "line-opacity": 0.25,
        },
        layout: { "line-cap": "round", "line-join": "round" },
      })
      map.addLayer({
        id: "route-tail",
        type: "line",
        source: "route-tail",
        paint: {
          "line-color": modeColor("WALK"),
          "line-width": 3,
          "line-dasharray": [1.5, 2],
        },
        layout: { "line-cap": "round", "line-join": "round" },
      })

      function scheduleExactRoute(
        destLat: number,
        destLon: number,
        preferredKey: string | null
      ) {
        const origin = originRef.current
        if (!origin) return

        if (exactRouteTimerRef.current) {
          window.clearTimeout(exactRouteTimerRef.current)
        }
        if (exactRouteAbortRef.current) {
          exactRouteAbortRef.current.abort()
        }

        const requestSeq = ++exactRouteSeqRef.current
        setRouteLoading(true)
        exactRouteTimerRef.current = window.setTimeout(() => {
          const controller = new AbortController()
          exactRouteAbortRef.current = controller

          fetchExactRoute(
            {
              originLat: origin[1],
              originLon: origin[0],
              destLat,
              destLon,
              time: effectiveTimeRef.current,
              bajs: bajsEnabledRef.current,
              preferredKey,
            },
            controller.signal
          )
            .then((itinerary) => {
              if (
                controller.signal.aborted ||
                requestSeq !== exactRouteSeqRef.current
              ) {
                return
              }
              renderFullRoute(map, itinerary)
              routeTailOriginRef.current = null
              setRoute(itinerary)
              setRouteLoading(false)
            })
            .catch((err) => {
              if (controller.signal.aborted) return
              console.error("Exact route fetch failed:", err)
              setRouteLoading(false)
            })
        }, 160)
      }

      // Shared destination preview handler
      function handleDestination(lat: number, lng: number) {
        const o = originRef.current
        if (!o) return

        pendingDestinationRef.current = { lat, lng }

        const dest: [number, number] = [lng, lat]

        // Instant: update preview line (desktop only) + destination dot
        if (!isTouchRef.current) {
          const previewSrc = map.getSource(
            "preview"
          ) as maplibregl.GeoJSONSource
          if (previewSrc) {
            previewSrc.setData({
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: {},
                  geometry: { type: "LineString", coordinates: [o, dest] },
                },
              ],
            })
          }
        }
        const dotSrc = map.getSource("dest-dot") as maplibregl.GeoJSONSource
        if (dotSrc) {
          dotSrc.setData({
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "Point", coordinates: dest },
              },
            ],
          })
        }

        // Client-side route reconstruction (instant, no network)
        const rd = routingDataRef.current
        if (rd) {
          const nearest = findNearestStop(rd, lat, lng)
          const nearestChanged = nearest !== lastNearestRef.current

          if (nearestChanged) {
            const itinerary = reconstructRoute(rd, lat, lng, nearest)

            if (itinerary) {
              renderRouteBase(map, itinerary)
              const tailStop = nearest ? rd.stops.get(nearest) : null
              routeTailOriginRef.current = tailStop
                ? [tailStop.lon, tailStop.lat]
                : null
            } else {
              routeTailOriginRef.current = null
              clearRenderedRoute(map)
              setRoute(null)
              setRouteLoading(false)
            }

            renderRouteTail(map, routeTailOriginRef.current, dest)
            lastNearestRef.current = nearest
          } else {
            renderRouteTail(map, routeTailOriginRef.current, dest)
          }

          setRoute(null)
          scheduleExactRoute(lat, lng, nearest)
        }
      }
      handleDestinationRef.current = handleDestination

      // Click → set origin, or show route on touch devices
      map.on("click", (e) => {
        if (originRef.current && isTouchRef.current) {
          handleDestination(e.lngLat.lat, e.lngLat.lng)
          return
        }
        originRef.current = [e.lngLat.lng, e.lngLat.lat]
        setRoute(null)
        setRouteLoading(false)
        setLoading(true)
        setError(null)
        setCoords({
          lat: Math.round(e.lngLat.lat * 1e5) / 1e5,
          lon: Math.round(e.lngLat.lng * 1e5) / 1e5,
        })
        map.easeTo({ center: [e.lngLat.lng, e.lngLat.lat], duration: 400 })
      })

      // Mousemove → preview route (desktop, throttled via RAF)
      map.on("mousemove", (e) => {
        if (!originRef.current) return
        cancelAnimationFrame(rafRef.current)
        rafRef.current = requestAnimationFrame(() => {
          handleDestination(e.lngLat.lat, e.lngLat.lng)
        })
      })

      // Clear preview when mouse leaves
      map.on("mouseout", () => {
        const previewSrc = map.getSource("preview") as maplibregl.GeoJSONSource
        if (previewSrc) previewSrc.setData(EMPTY_FC)
        const dotSrc = map.getSource("dest-dot") as maplibregl.GeoJSONSource
        if (dotSrc) dotSrc.setData(EMPTY_FC)
        if (exactRouteTimerRef.current) {
          window.clearTimeout(exactRouteTimerRef.current)
        }
        if (exactRouteAbortRef.current) {
          exactRouteAbortRef.current.abort()
        }
        pendingDestinationRef.current = null
        setRouteLoading(false)
      })

      setMapReady(true)
    })

    return () => {
      if (bajsAbortRef.current) bajsAbortRef.current.abort()
      if (routingAbortRef.current) routingAbortRef.current.abort()
      if (exactRouteAbortRef.current) exactRouteAbortRef.current.abort()
      if (exactRouteTimerRef.current) {
        window.clearTimeout(exactRouteTimerRef.current)
      }
      if (vehicleIntervalRef.current) {
        window.clearInterval(vehicleIntervalRef.current)
      }
      if (poiAbortRef.current) poiAbortRef.current.abort()
      map.remove()
      mapRef.current = null
      handleDestinationRef.current = null
      setMapReady(false)
      routeTailOriginRef.current = null
      cancelAnimationFrame(rafRef.current)
    }
  }, [setCoords])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const source = map.getSource("bajs") as maplibregl.GeoJSONSource
    if (!source) return

    if (!bajsEnabled) {
      source.setData(EMPTY_FC)
      return
    }

    if (bajsAbortRef.current) bajsAbortRef.current.abort()
    const controller = new AbortController()
    bajsAbortRef.current = controller

    fetchBajsStations(controller.signal)
      .then((geojson) => {
        if (controller.signal.aborted) return
        source.setData(geojson)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        console.error("BAJS fetch failed:", err)
        source.setData(EMPTY_FC)
      })

    return () => {
      controller.abort()
    }
  }, [bajsEnabled, mapReady])

  // Live vehicle positions: fetch when enabled, refresh every 30s
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !vehiclesEnabled) {
      if (vehicleIntervalRef.current) {
        window.clearInterval(vehicleIntervalRef.current)
        vehicleIntervalRef.current = 0
      }
      setVehiclePositions(EMPTY_FC)
      return
    }

    let aborted = false

    function fetchVehicles() {
      fetch("/api/vehicles")
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json()
        })
        .then((vehicles: Array<{ tripId: string; routeId?: string | null; lat: number; lon: number; bearing?: number; speed?: number }>) => {
          if (aborted) return
          const fc: GeoJSON.FeatureCollection = {
            type: "FeatureCollection",
            features: vehicles.map((v) => {
              // Extract line number from routeId like "ZET_6" → "6", or from tripId
              const line = v.routeId
                ? v.routeId.replace(/^[A-Z]+_/, "")
                : v.tripId.split("_")[0] ?? ""
              return {
                type: "Feature" as const,
                geometry: { type: "Point" as const, coordinates: [v.lon, v.lat] },
                properties: { tripId: v.tripId, line, bearing: v.bearing ?? 0, speed: v.speed ?? 0 },
              }
            }),
          }
          const json = JSON.stringify(fc.features)
          if (json === prevVehiclesJsonRef.current) return
          prevVehiclesJsonRef.current = json
          setVehiclePositions(fc)
        })
        .catch((err) => {
          if (aborted) return
          console.error("Vehicle positions fetch failed:", err)
        })
    }

    fetchVehicles()
    vehicleIntervalRef.current = window.setInterval(fetchVehicles, 30_000)

    return () => {
      aborted = true
      if (vehicleIntervalRef.current) {
        window.clearInterval(vehicleIntervalRef.current)
        vehicleIntervalRef.current = 0
      }
    }
  }, [mapReady, vehiclesEnabled])

  // Update vehicle positions source when data changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const source = map.getSource(
      "vehicle-positions"
    ) as maplibregl.GeoJSONSource
    if (source) source.setData(vehiclePositions)
  }, [vehiclePositions, mapReady])

  // POI overlay: fetch when enabled, clear when disabled
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const source = map.getSource("poi") as maplibregl.GeoJSONSource
    if (!source) return

    if (!poiEnabled) {
      source.setData(EMPTY_FC)
      return
    }

    if (poiAbortRef.current) poiAbortRef.current.abort()
    const controller = new AbortController()
    poiAbortRef.current = controller

    fetch("/api/poi?categories=hospital,school,park,pharmacy", {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((pois: Array<{ id: number; name: string; lat: number; lon: number; category: string }>) => {
        if (controller.signal.aborted) return
        const fc: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: pois.map((p) => ({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
            properties: { name: p.name, category: p.category },
          })),
        }
        source.setData(fc)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        console.error("POI fetch failed:", err)
        source.setData(EMPTY_FC)
      })

    return () => {
      controller.abort()
    }
  }, [poiEnabled, mapReady])

  // Origin change → fetch isochrone
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    if (markerRef.current) {
      markerRef.current.remove()
      markerRef.current = null
    }

    const routeSource = map.getSource("route") as maplibregl.GeoJSONSource
    if (routeSource) routeSource.setData(EMPTY_FC)
    const routeTailSource = map.getSource(
      "route-tail"
    ) as maplibregl.GeoJSONSource
    if (routeTailSource) routeTailSource.setData(EMPTY_FC)
    if (exactRouteAbortRef.current) exactRouteAbortRef.current.abort()
    if (exactRouteTimerRef.current) {
      window.clearTimeout(exactRouteTimerRef.current)
    }
    if (routingAbortRef.current) routingAbortRef.current.abort()
    exactRouteSeqRef.current++
    const previewSrc = map.getSource("preview") as maplibregl.GeoJSONSource
    if (previewSrc) previewSrc.setData(EMPTY_FC)
    const dotSrc = map.getSource("dest-dot") as maplibregl.GeoJSONSource
    if (dotSrc) dotSrc.setData(EMPTY_FC)
    setRouteLoading(false)
    pendingDestinationRef.current = null
    routingDataRef.current = null

    if (originLat === null || originLon === null) {
      const isoSource = map.getSource("isochrone") as maplibregl.GeoJSONSource
      if (isoSource) isoSource.setData(EMPTY_FC)
      const walkRingSrc = map.getSource("walk-ring") as maplibregl.GeoJSONSource
      if (walkRingSrc) walkRingSrc.setData(EMPTY_FC)
      map.getCanvas().style.cursor = ""
      originRef.current = null
      routeTailOriginRef.current = null
      setRoute(null) // eslint-disable-line react-hooks/set-state-in-effect -- cleanup
      return
    }

    const origin: [number, number] = [originLon, originLat]
    originRef.current = origin

    // Center map when loading from a shared URL
    if (initialLoadRef.current) {
      initialLoadRef.current = false
      map.jumpTo({ center: origin, zoom: 13 })
    }

    map.getCanvas().style.cursor = "progress"
    lastNearestRef.current = null
    routeTailOriginRef.current = null

    markerRef.current = new maplibregl.Marker({
      element: createMarkerElement(),
    })
      .setLngLat(origin)
      .addTo(map)

    if (isoAbortRef.current) isoAbortRef.current.abort()
    if (routingAbortRef.current) routingAbortRef.current.abort()
    const isoController = new AbortController()
    const routingController = new AbortController()
    isoAbortRef.current = isoController
    routingAbortRef.current = routingController

    setLoading(true)
    setError(null)
    setRoute(null)
    setRouteLoading(false)

    fetchIsochrone(
      {
        lat: originLat,
        lon: originLon,
        time: effectiveTime,
        bajs: bajsEnabled,
      },
      isoController.signal
    )
      .then((geojson: IsochroneResponse) => {
        if (isoController.signal.aborted) return
        const isoSource = map.getSource("isochrone") as maplibregl.GeoJSONSource
        if (isoSource) isoSource.setData(geojson)
        const walkRingSrc = map.getSource(
          "walk-ring"
        ) as maplibregl.GeoJSONSource
        if (walkRingSrc) {
          walkRingSrc.setData(geojson.walkRing ?? EMPTY_FC)
        }
        setLoading(false)
        map.getCanvas().style.cursor = "crosshair"
        if (
          !statsCtaDismissedRef.current &&
          !localStorage.getItem("doseg-stats-cta")
        ) {
          setShowStatsCta(true)
        }
      })
      .catch((err) => {
        if (isoController.signal.aborted) return
        console.error("Isochrone fetch failed:", err)
        routingController.abort()
        const msg =
          err.message?.includes("502") || err.message?.includes("503")
            ? "Usluga javnog prijevoza je privremeno nedostupna"
            : "Nije moguće učitati podatke o dosegu"
        setError(msg)
        setLoading(false)
        map.getCanvas().style.cursor = "crosshair"
      })

    fetchIsochroneRouting(
      {
        lat: originLat,
        lon: originLon,
        time: effectiveTime,
        bajs: bajsEnabled,
      },
      routingController.signal
    )
      .then((response) => {
        if (routingController.signal.aborted) return
        if (!response.routing) return
        routingDataRef.current = parseRoutingData(
          response.routing,
          originLat,
          originLon
        )
        const pendingDestination = pendingDestinationRef.current
        if (pendingDestination && handleDestinationRef.current) {
          handleDestinationRef.current(
            pendingDestination.lat,
            pendingDestination.lng
          )
        }
      })
      .catch((err) => {
        if (routingController.signal.aborted) return
        console.error("Isochrone routing fetch failed:", err)
      })

    return () => {
      isoController.abort()
      routingController.abort()
    }
  }, [originLat, originLon, mapReady, effectiveTime, bajsEnabled])

  const ease = [0.23, 1, 0.32, 1] as const

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative h-svh w-full">
        <div ref={containerRef} className="h-full w-full" role="application" aria-label="Interaktivna karta dosega javnog prijevoza u Zagrebu" />

        {/* Loading bar — spans full width, outside grid padding */}
        <AnimatePresence>
          {loading && (
            <motion.div
              key="loading"
              className="absolute top-0 right-0 left-0 z-20"
              aria-live="polite"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease }}
            >
              <span className="sr-only">Učitavanje podataka o dosegu</span>
              <div className="loading-bar" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Layer legend — outside grid to avoid column sizing shifts */}
        <AnimatePresence>
          {(bajsEnabled || poiEnabled) && (
            <motion.div
              className="panel pointer-events-auto absolute bottom-6 left-3 z-10 flex flex-col gap-2 px-3 py-2 sm:bottom-4 sm:left-4"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
              transition={{ duration: 0.2, ease }}
            >
              {bajsEnabled && (
                <div className="flex flex-col gap-1">
                  <div className="text-[9px] font-semibold tracking-wider text-slate-500 uppercase">BAJS</div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 shrink-0 rounded-full border border-white/40 bg-amber-500/80" />
                      <span className="text-[9px] font-medium text-slate-300">Dostupno</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 shrink-0 rounded-full border border-white/40 bg-orange-500/80" />
                      <span className="text-[9px] font-medium text-slate-300">0 bic.</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 shrink-0 rounded-full border border-red-500/80 bg-amber-500/80" />
                      <span className="text-[9px] font-medium text-slate-300">Puna</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 shrink-0 rounded-full border border-red-500/80 bg-slate-400/80" />
                      <span className="text-[9px] font-medium text-slate-300">Ne radi</span>
                    </div>
                  </div>
                </div>
              )}
              {bajsEnabled && poiEnabled && <div className="h-px bg-white/10" />}
              {poiEnabled && (
                <div className="flex flex-col gap-1">
                  <div className="text-[9px] font-semibold tracking-wider text-slate-500 uppercase">Ustanove</div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center gap-1">
                      <div className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-red-500 text-[7px] font-bold text-white">H</div>
                      <span className="text-[9px] font-medium text-slate-300">Bolnica</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[7px] font-bold text-white">Š</div>
                      <span className="text-[9px] font-medium text-slate-300">Škola</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-green-500 text-[7px] font-bold text-white">P</div>
                      <span className="text-[9px] font-medium text-slate-300">Park</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-orange-500 text-[6px] font-bold text-white">Lj</div>
                      <span className="text-[9px] font-medium text-slate-300">Ljekarna</span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* HUD overlay grid — all map UI lives here, no overlap */}
        <div className="pointer-events-none absolute inset-0 z-10 grid grid-rows-[auto_1fr_auto] grid-cols-[auto_1fr_auto] gap-0 px-3 pt-3 pb-6 sm:p-4">

          {/* === TOP ROW === */}

          {/* Top-left: About link (desktop only — mobile gets it bottom-left) */}
          <div className="pointer-events-auto col-start-1 row-start-1 hidden self-start sm:block">
            <Link
              href="/o-projektu"
              className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:text-slate-200"
              aria-label="O projektu"
            >
              O projektu
            </Link>
          </div>

          {/* Top-center: Dynamic Island + error overlay */}
          <div className="col-start-2 row-start-1 flex flex-col items-center gap-2 justify-self-center">
            <motion.div
              className="island pointer-events-auto"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease }}
            >
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-1.5">
                  <TimePicker
                    value={effectiveTime}
                    onChange={(v) => setTime(v)}
                  />
                </div>

                {/* Divider */}
                <div className="h-6 w-px bg-white/10" />

                <button
                  type="button"
                  onClick={() => setBajs(bajsEnabled ? null : "1")}
                  aria-pressed={bajsEnabled}
                  className={`flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none ${
                    bajsEnabled
                      ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/40"
                      : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
                  }`}
                  title="Ukljuci BAJS stanice i bicikl u izracun rute"
                >
                  <span>BAJS</span>
                  <span className="hidden text-[9px] font-medium text-slate-400 sm:inline">
                    + tram/bus
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setLayersOpen((v) => !v)}
                  className={`flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none ${
                    layersOpen || vehiclesEnabled || poiEnabled
                      ? "bg-slate-500/20 text-slate-200 ring-1 ring-slate-400/40"
                      : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
                  }`}
                >
                  <svg
                    aria-hidden="true"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.84Z" />
                    <path d="M2 12l8.58 3.91a2 2 0 0 0 1.66 0L21 12" />
                    <path d="M2 17l8.58 3.91a2 2 0 0 0 1.66 0L21 17" />
                  </svg>
                  <span className="hidden sm:inline">Slojevi</span>
                  {!layersOpen && (vehiclesEnabled || poiEnabled) && (
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-cyan-500/80 text-[8px] font-bold text-white">
                      {(vehiclesEnabled ? 1 : 0) + (poiEnabled ? 1 : 0)}
                    </span>
                  )}
                </button>

                <div className="h-6 w-px bg-white/10" />

                <div className="flex flex-col justify-center py-0.5">
                  <div
                    className="h-1.5 w-[140px] rounded-full sm:w-[200px]"
                    style={{
                      background:
                        "linear-gradient(to right, #16a34a, #0891b2, #2563eb, #9333ea)",
                    }}
                  />
                  <div className="mt-1 flex w-[140px] justify-between text-[9px] leading-none font-medium text-slate-400 tabular-nums sm:w-[200px]">
                    <span>0</span>
                    <span>15</span>
                    <span>30</span>
                    <span>45m</span>
                  </div>
                </div>

                <AnimatePresence>
                  {hasOrigin && (
                    <motion.div
                      key="close"
                      initial={{ opacity: 0, width: 0, scale: 0.9 }}
                      animate={{ opacity: 1, width: "auto", scale: 1 }}
                      exit={{ opacity: 0, width: 0, scale: 0.9 }}
                      className="flex items-center gap-2 overflow-hidden sm:gap-3"
                    >
                      <div className="h-6 w-px shrink-0 bg-white/10" />
                      <button
                        type="button"
                        onClick={() => setCoords({ lat: null, lon: null })}
                        className="flex h-6 shrink-0 items-center justify-center rounded-full bg-white/5 px-2 text-slate-400 transition-colors hover:bg-white/15 hover:text-slate-200 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none sm:px-2.5"
                        aria-label="Obriši ishodište"
                      >
                        <svg
                          aria-hidden="true"
                          width="8"
                          height="8"
                          viewBox="0 0 8 8"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        >
                          <path d="M1 1l6 6M7 1l-6 6" />
                        </svg>
                        <span className="ml-1.5 hidden text-[11px] font-medium sm:inline">
                          Obriši
                        </span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Expanding layer toggles */}
              <AnimatePresence>
                {layersOpen && (
                  <motion.div
                    key="layers"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center justify-center gap-2 border-t border-white/10 px-3 pt-2 pb-0.5">
                      <button
                        type="button"
                        onClick={() => setVehiclesEnabled((v) => !v)}
                        className={`flex h-7 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold transition-colors ${
                          vehiclesEnabled
                            ? "bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400/40"
                            : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
                        }`}
                      >
                        <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="3" />
                          <path d="M12 2v4m0 12v4m10-10h-4M6 12H2" />
                        </svg>
                        Vozila uživo
                      </button>
                      <button
                        type="button"
                        onClick={() => setPoiEnabled((v) => !v)}
                        className={`flex h-7 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold transition-colors ${
                          poiEnabled
                            ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40"
                            : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
                        }`}
                      >
                        <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                          <polyline points="9 22 9 12 15 12 15 22" />
                        </svg>
                        Ustanove
                      </button>
                      <div className="h-4 w-px bg-white/10" />
                      <Link
                        href="/o-projektu"
                        className="flex h-7 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold text-slate-500 transition-colors hover:text-slate-300"
                      >
                        O projektu
                      </Link>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            <AnimatePresence>
              {error && (
                <motion.div
                  key="error"
                  role="alert"
                  aria-live="assertive"
                  className="island pointer-events-auto text-[12px] text-red-400"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
                  transition={{ duration: 0.2, ease }}
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Top-right: Keyboard hints (desktop only) */}
          <div className="pointer-events-auto col-start-3 row-start-1 hidden self-start sm:flex items-center gap-2 rounded-lg bg-[rgba(30,30,30,0.85)] px-2 py-1.5 shadow-[0_2px_12px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-md">
            <span className="text-[10px] font-medium tracking-wider text-slate-400 uppercase">
              Pomicanje
            </span>
            <KbdGroup>
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              <Kbd>←</Kbd>
              <Kbd>→</Kbd>
            </KbdGroup>
          </div>

          {/* === MIDDLE ROW — empty, map shows through === */}

          {/* === BOTTOM ROW === */}

          {/* Bottom-left: placeholder to preserve grid structure */}
          <div className="col-start-1 row-start-3" />

          {/* Bottom-center: Hint text / Stats CTA / Route details */}
          <div className="col-start-1 col-span-full row-start-3 self-end justify-self-stretch sm:col-start-2 sm:col-span-1 sm:justify-self-center">
            <AnimatePresence>
              {!hasOrigin && (
                <motion.div
                  key="hint"
                  className="panel pointer-events-auto"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
                  transition={{ duration: 0.2, ease }}
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="text-[13px] text-slate-300">
                      Klikni bilo gdje da vidiš dokle možeš stići
                    </div>
                    <Link
                      href="/statistika"
                      prefetch={false}
                      className="text-[12px] text-slate-500 transition-colors hover:text-slate-300"
                    >
                      ili pogledaj statistiku po četvrtima &rarr;
                    </Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showStatsCta && hasOrigin && (
                <motion.div
                  key="stats-cta"
                  className="panel pointer-events-auto"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
                  transition={{ duration: 0.3, delay: 0.5, ease }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[12px] text-slate-400">
                      Kako se tvoja četvrt uspoređuje?
                    </span>
                    <Link
                      href="/statistika"
                      prefetch={false}
                      className="rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-200 transition-colors hover:bg-white/20"
                      onClick={() => {
                        localStorage.setItem("doseg-stats-cta", "1")
                        statsCtaDismissedRef.current = true
                      }}
                    >
                      Statistika &rarr;
                    </Link>
                    <button
                      type="button"
                      className="text-slate-500 transition-colors hover:text-slate-300"
                      aria-label="Zatvori"
                      onClick={() => {
                        localStorage.setItem("doseg-stats-cta", "1")
                        statsCtaDismissedRef.current = true
                        setShowStatsCta(false)
                      }}
                    >
                      <svg
                        aria-hidden="true"
                        width="10"
                        height="10"
                        viewBox="0 0 8 8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      >
                        <path d="M1 1l6 6M7 1l-6 6" />
                      </svg>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {(route || routeLoading) && (
                <RouteDetails
                  itinerary={route}
                  loading={routeLoading}
                  departureTime={effectiveTime}
                  className="panel pointer-events-auto cursor-pointer sm:w-[280px]"
                  onShare={() => {
                    navigator.clipboard.writeText(window.location.href).then(() => {
                      setLinkCopied(true)
                      setTimeout(() => setLinkCopied(false), 2000)
                    })
                  }}
                  onExport={() => {
                    const map = mapRef.current
                    if (!map) return
                    const canvas = map.getCanvas()
                    const link = document.createElement("a")
                    link.download = "doseg.png"
                    link.href = canvas.toDataURL("image/png")
                    link.click()
                  }}
                  shareConfirm={linkCopied}
                />
              )}
            </AnimatePresence>
          </div>

          {/* Bottom-right: empty placeholder */}
          <div className="col-start-3 row-start-3" />

        </div>{/* end HUD overlay grid */}

        <OnboardingDialog />
      </div>
    </MotionConfig>
  )
}

function buildRouteFeatureCollection(itinerary: Itinerary) {
  const features: GeoJSON.Feature[] = itinerary.legs.map((leg) => ({
    type: "Feature",
    properties: { mode: leg.mode, route: leg.route || "" },
    geometry: {
      type: "LineString",
      coordinates:
        leg.legGeometry.coords ?? decodePolyline(leg.legGeometry.points),
    },
  }))

  return {
    type: "FeatureCollection",
    features,
  } satisfies GeoJSON.FeatureCollection
}

function renderRouteBase(map: maplibregl.Map, itinerary: Itinerary) {
  const baseLegs =
    itinerary.legs.at(-1)?.mode === "WALK" &&
    itinerary.legs.at(-1)?.to.name === ""
      ? itinerary.legs.slice(0, -1)
      : itinerary.legs
  const source = map.getSource("route") as maplibregl.GeoJSONSource
  if (source) {
    source.setData(
      baseLegs.length
        ? buildRouteFeatureCollection({ ...itinerary, legs: baseLegs })
        : EMPTY_FC
    )
  }
}

function renderFullRoute(map: maplibregl.Map, itinerary: Itinerary) {
  const source = map.getSource("route") as maplibregl.GeoJSONSource
  if (source) {
    source.setData(
      itinerary.legs.length ? buildRouteFeatureCollection(itinerary) : EMPTY_FC
    )
  }

  const tailSource = map.getSource("route-tail") as maplibregl.GeoJSONSource
  if (tailSource) tailSource.setData(EMPTY_FC)
}

function renderRouteTail(
  map: maplibregl.Map,
  tailOrigin: [number, number] | null,
  dest: [number, number]
) {
  const source = map.getSource("route-tail") as maplibregl.GeoJSONSource
  if (!source) return

  if (!tailOrigin) {
    source.setData(EMPTY_FC)
    return
  }

  source.setData({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { mode: "WALK", route: "" },
        geometry: {
          type: "LineString",
          coordinates: [tailOrigin, dest],
        },
      },
    ],
  })
}

function clearRenderedRoute(map: maplibregl.Map) {
  const routeSource = map.getSource("route") as maplibregl.GeoJSONSource
  if (routeSource) routeSource.setData(EMPTY_FC)

  const routeTailSource = map.getSource(
    "route-tail"
  ) as maplibregl.GeoJSONSource
  if (routeTailSource) routeTailSource.setData(EMPTY_FC)
}
