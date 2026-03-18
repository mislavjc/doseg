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
  const handleDestinationRef = useRef<((lat: number, lng: number) => void) | null>(
    null
  )
  const pendingDestinationRef = useRef<{ lat: number; lng: number } | null>(null)
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
          "circle-opacity": 0.15,
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
            "#64748b",
            ["==", ["get", "bikesAvailable"], 0],
            "#f97316",
            ["<=", ["get", "bikesAvailable"], 2],
            "#f59e0b",
            modeColor("BIKE"),
          ],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": [
            "case",
            ["!", ["get", "isReturning"]],
            "#ef4444",
            ["==", ["get", "docksAvailable"], 0],
            "#ef4444",
            "rgba(255,255,255,0.85)",
          ],
        },
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
        setLoading(false)
        map.getCanvas().style.cursor = "crosshair"
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
        <div ref={containerRef} className="h-full w-full" />

        {/* Dynamic Island */}
        <div className="pointer-events-none absolute top-3 right-0 left-0 z-10 flex flex-col items-center gap-2 sm:top-4">
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

        <AnimatePresence>
          {!hasOrigin && (
            <motion.div
              key="hint"
              className="panel absolute bottom-8 left-1/2 -translate-x-1/2 sm:bottom-8"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
              transition={{ duration: 0.2, ease }}
            >
              <div className="text-[13px] text-slate-300">
                Klikni bilo gdje da vidiš dokle možeš stići
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {loading && (
            <motion.div
              key="loading"
              className="absolute top-0 right-0 left-0 z-10"
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

        <AnimatePresence>
          {(route || routeLoading) && (
            <RouteDetails itinerary={route} loading={routeLoading} />
          )}
        </AnimatePresence>

        <div className="absolute top-[10px] right-[52px] z-10 hidden items-center gap-2 rounded-lg bg-[rgba(30,30,30,0.85)] px-2 py-1.5 shadow-[0_2px_12px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-md sm:flex">
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

        <Link
          href="/o-projektu"
          prefetch={false}
          className="absolute top-[80px] right-[10px] z-10 flex h-[29px] w-[29px] items-center justify-center rounded-md bg-[rgba(30,30,30,0.85)] text-slate-400 shadow-[0_2px_12px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-md transition-colors hover:text-slate-200 sm:top-4 sm:right-auto sm:left-4 sm:h-auto sm:w-auto sm:rounded-full sm:bg-white/10 sm:px-2.5 sm:py-1 sm:text-[11px] sm:font-medium sm:shadow-none"
          aria-label="O projektu"
        >
          <svg
            aria-hidden="true"
            className="h-[18px] w-[18px] sm:hidden"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          <span className="hidden sm:inline">O projektu</span>
        </Link>

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
