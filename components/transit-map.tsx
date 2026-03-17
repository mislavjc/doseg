"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { motion, AnimatePresence, MotionConfig } from "motion/react"
import { useQueryStates, useQueryState, parseAsFloat, parseAsString } from "nuqs"

import { fetchIsochrone, type Itinerary } from "@/lib/otp"
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
  const routingDataRef = useRef<RoutingData | null>(null)
  const lastNearestRef = useRef<string | null>(null)
  const rafRef = useRef<number>(0)
  const isTouchRef = useRef(false)

  const [coords, setCoords] = useQueryStates({
    lat: parseAsFloat,
    lon: parseAsFloat,
  })
  const [time, setTime] = useQueryState("t", parseAsString)
  const [defaultTime] = useState(formatTime)
  const effectiveTime = time ?? defaultTime
  const [route, setRoute] = useState<Itinerary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)

  const originLat = coords.lat
  const originLon = coords.lon
  const hasOrigin = originLat !== null && originLon !== null
  const initialLoadRef = useRef(hasOrigin)

  // ESC to clear origin
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && originRef.current) {
        setCoords({ lat: null, lon: null })
        setRoute(null)
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
      () => { isTouchRef.current = true },
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
            10, 1,
            13, 1.5,
            16, 2.5,
          ],
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10, 0.4,
            13, 0.5,
            16, 0.65,
          ],
          "line-blur": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10, 1,
            14, 0.5,
          ],
        },
        layout: { "line-cap": "round", "line-join": "round" },
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

      // Shared destination preview handler
      function handleDestination(lat: number, lng: number) {
        const o = originRef.current
        if (!o) return

        const dest: [number, number] = [lng, lat]

        // Instant: update preview line (desktop only) + destination dot
        if (!isTouchRef.current) {
          const previewSrc = map.getSource("preview") as maplibregl.GeoJSONSource
          if (previewSrc) {
            previewSrc.setData({
              type: "FeatureCollection",
              features: [{
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: [o, dest] },
              }],
            })
          }
        }
        const dotSrc = map.getSource("dest-dot") as maplibregl.GeoJSONSource
        if (dotSrc) {
          dotSrc.setData({
            type: "FeatureCollection",
            features: [{
              type: "Feature",
              properties: {},
              geometry: { type: "Point", coordinates: dest },
            }],
          })
        }

        // Client-side route reconstruction (instant, no network)
        const rd = routingDataRef.current
        if (rd) {
          const nearest = findNearestStop(rd, lat, lng)
          const itinerary = reconstructRoute(rd, lat, lng)

          if (itinerary) {
            renderRoute(map, itinerary)
          } else {
            const routeSrc = map.getSource("route") as maplibregl.GeoJSONSource
            if (routeSrc) routeSrc.setData(EMPTY_FC)
          }
          // Only re-render React panel when nearest stop changes
          if (nearest !== lastNearestRef.current) {
            lastNearestRef.current = nearest
            setRoute(itinerary)
          }
        }
      }

      // Click → set origin, or show route on touch devices
      map.on("click", (e) => {
        if (originRef.current && isTouchRef.current) {
          handleDestination(e.lngLat.lat, e.lngLat.lng)
          return
        }
        originRef.current = [e.lngLat.lng, e.lngLat.lat]
        setRoute(null)
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
      })

      setMapReady(true)
    })

    return () => {
      map.remove()
      mapRef.current = null
      setMapReady(false)
      cancelAnimationFrame(rafRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    const previewSrc = map.getSource("preview") as maplibregl.GeoJSONSource
    if (previewSrc) previewSrc.setData(EMPTY_FC)
    const dotSrc = map.getSource("dest-dot") as maplibregl.GeoJSONSource
    if (dotSrc) dotSrc.setData(EMPTY_FC)

    if (originLat === null || originLon === null) {
      const isoSource = map.getSource("isochrone") as maplibregl.GeoJSONSource
      if (isoSource) isoSource.setData(EMPTY_FC)
      map.getCanvas().style.cursor = ""
      originRef.current = null
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
    routingDataRef.current = null
    lastNearestRef.current = null

    markerRef.current = new maplibregl.Marker({
      element: createMarkerElement(),
    })
      .setLngLat(origin)
      .addTo(map)

    if (isoAbortRef.current) isoAbortRef.current.abort()
    const controller = new AbortController()
    isoAbortRef.current = controller

    setLoading(true)
    setError(null)
    setRoute(null)

    fetchIsochrone({ lat: originLat, lon: originLon, time: effectiveTime }, controller.signal)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((geojson: any) => {
        if (controller.signal.aborted) return
        const isoSource = map.getSource(
          "isochrone"
        ) as maplibregl.GeoJSONSource
        if (isoSource) isoSource.setData(geojson)
        if (geojson.routing) {
          routingDataRef.current = parseRoutingData(
            geojson.routing,
            originLat,
            originLon
          )
        }
        setLoading(false)
        map.getCanvas().style.cursor = "crosshair"
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        console.error("Isochrone fetch failed:", err)
        const msg =
          err.message?.includes("502") || err.message?.includes("503")
            ? "Usluga javnog prijevoza je privremeno nedostupna"
            : "Nije moguće učitati podatke o dosegu"
        setError(msg)
        setLoading(false)
        map.getCanvas().style.cursor = "crosshair"
      })

    return () => {
      controller.abort()
    }
  }, [originLat, originLon, mapReady, effectiveTime])

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

              <div className="flex flex-col justify-center py-0.5">
                <div
                  className="h-1.5 w-[140px] sm:w-[200px] rounded-full"
                  style={{
                    background:
                      "linear-gradient(to right, #16a34a, #0891b2, #2563eb, #9333ea)",
                  }}
                />
                <div className="mt-1 flex w-[140px] sm:w-[200px] justify-between text-[9px] font-medium tabular-nums text-slate-400 leading-none">
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
                    className="flex items-center gap-2 sm:gap-3 overflow-hidden"
                  >
                    <div className="h-6 w-px bg-white/10 shrink-0" />
                    <button
                      onClick={() => setCoords({ lat: null, lon: null })}
                      className="flex h-6 shrink-0 items-center justify-center rounded-full bg-white/5 hover:bg-white/15 px-2 sm:px-2.5 text-slate-400 hover:text-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                      aria-label="Obriši ishodište"
                    >
                      <svg aria-hidden="true" width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M1 1l6 6M7 1l-6 6" />
                      </svg>
                      <span className="hidden sm:inline ml-1.5 text-[11px] font-medium">Obriši</span>
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
          {route && (
            <RouteDetails itinerary={route} loading={false} />
          )}
        </AnimatePresence>

        <div className="hidden sm:flex absolute top-[10px] right-[52px] z-10 items-center gap-2 rounded-lg bg-[rgba(30,30,30,0.85)] px-2 py-1.5 shadow-[0_2px_12px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-[12px]">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Pomicanje</span>
          <KbdGroup>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            <Kbd>←</Kbd>
            <Kbd>→</Kbd>
          </KbdGroup>
        </div>

        <Link
          href="/o-projektu"
          className="absolute top-3 left-3 z-10 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-400 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-slate-200 sm:top-4 sm:left-4"
        >
          O projektu
        </Link>

        <OnboardingDialog />
      </div>
    </MotionConfig>
  )
}

function renderRoute(map: maplibregl.Map, itinerary: Itinerary) {
  const features: GeoJSON.Feature[] = itinerary.legs.map((leg) => ({
    type: "Feature",
    properties: { mode: leg.mode, route: leg.route || "" },
    geometry: {
      type: "LineString",
      coordinates:
        leg.legGeometry.coords ?? decodePolyline(leg.legGeometry.points),
    },
  }))

  const source = map.getSource("route") as maplibregl.GeoJSONSource
  if (source) {
    source.setData({ type: "FeatureCollection", features })
  }
}
