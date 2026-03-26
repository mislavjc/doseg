"use client"

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import useSWR from "swr"
import { m, AnimatePresence, MotionConfig } from "motion/react"
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
  type Leg,
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
import { RouteDetails, SidePanel, RoutePanelContent } from "@/components/route-details"
import { TimePicker } from "@/components/time-picker"
import { AddressInput } from "@/components/address-input"
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

function addIsochroneLayer(map: maplibregl.Map) {
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
}

function addWalkRingLayer(map: maplibregl.Map) {
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
}

function addBajsLayers(map: maplibregl.Map) {
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
  addBajsStationsLayer(map)
}

function addBajsStationsLayer(map: maplibregl.Map) {
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
}

function addVehicleLayers(map: maplibregl.Map) {
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
}

function addPoiSourceAndLayers(map: maplibregl.Map) {
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
  addPoiSymbolLayers(map)
}

function addPoiSymbolLayers(map: maplibregl.Map) {
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
  addPoiNameLabels(map)
}

function addPoiNameLabels(map: maplibregl.Map) {
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
}

function addPoiClickHandler(
  map: maplibregl.Map,
  originRef: React.RefObject<[number, number] | null>
) {
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
    showPoiPopup(map, coords, name, category)
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
}

function showPoiPopup(
  map: maplibregl.Map,
  coords: [number, number],
  name: string,
  category: string
) {
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
}

function addBajsClickHandler(
  map: maplibregl.Map,
  originRef: React.RefObject<[number, number] | null>
) {
  map.on("click", "bajs-stations", (e) => {
    if (!e.features || e.features.length === 0) return
    e.originalEvent.stopPropagation()
    const f = e.features[0]
    const coords = (f.geometry as GeoJSON.Point).coordinates.slice() as [number, number]
    const p = f.properties as Record<string, unknown>
    showBajsPopup(map, coords, p)
  })
  map.on("mouseenter", "bajs-stations", () => {
    map.getCanvas().style.cursor = "pointer"
  })
  map.on("mouseleave", "bajs-stations", () => {
    map.getCanvas().style.cursor = originRef.current ? "crosshair" : ""
  })
}

function showBajsPopup(
  map: maplibregl.Map,
  coords: [number, number],
  p: Record<string, unknown>
) {
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
}

function addPreviewLayers(map: maplibregl.Map) {
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
}

function addRouteSourceAndLayers(map: maplibregl.Map) {
  map.addSource("route", { type: "geojson", data: EMPTY_FC })
  map.addLayer({
    id: "route-casing",
    type: "line",
    source: "route",
    paint: {
      "line-color": "#000",
      "line-width": [
        "interpolate", ["linear"], ["zoom"],
        10, 6,
        13, 9,
        16, 11,
      ],
      "line-opacity": 0.35,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  })
  addRouteModeLayers(map)
  addRouteTailLayers(map)
}

function addRouteModeLayers(map: maplibregl.Map) {
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
  addRouteTransitLayer(map)
}

function addRouteTransitLayer(map: maplibregl.Map) {
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
      "line-width": [
        "interpolate", ["linear"], ["zoom"],
        10, 3,
        13, 5,
        16, 7,
      ],
    },
    layout: { "line-cap": "round", "line-join": "round" },
  })
}

function addRouteTailLayers(map: maplibregl.Map) {
  map.addSource("route-tail", { type: "geojson", data: EMPTY_FC })
  map.addLayer({
    id: "route-tail-casing",
    type: "line",
    source: "route-tail",
    paint: {
      "line-color": "#000",
      "line-width": 7,
      "line-opacity": 0.3,
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
}

function addAllMapSources(map: maplibregl.Map) {
  if (map.getLayer("background")) {
    map.setPaintProperty("background", "background-color", "#1a1a24")
  }
  addIsochroneLayer(map)
  addWalkRingLayer(map)
  addBajsLayers(map)
  addVehicleLayers(map)
  addPoiSourceAndLayers(map)
  addPreviewLayers(map)
  addRouteSourceAndLayers(map)
}

function updatePreviewAndDot(
  map: maplibregl.Map,
  dest: [number, number],
) {
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
}

function reconstructAndRenderRoute(
  map: maplibregl.Map,
  rd: RoutingData,
  lat: number,
  lng: number,
  nearest: string | null,
  dest: [number, number],
  routeTailOriginRef: React.MutableRefObject<[number, number] | null>,
  setRoute: (r: Itinerary | null) => void,
  setRouteLoading: (l: boolean) => void
) {
  const itinerary = reconstructRoute(rd, lat, lng, nearest)

  if (itinerary) {
    renderRouteBase(map, itinerary)
    setRoute(itinerary)
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
}

interface ScheduleExactRouteOpts {
  map: maplibregl.Map
  originRef: React.RefObject<[number, number] | null>
  effectiveTimeRef: React.RefObject<string>
  bajsEnabledRef: React.RefObject<boolean>
  exactRouteTimerRef: React.MutableRefObject<number>
  exactRouteAbortRef: React.MutableRefObject<AbortController | null>
  exactRouteSeqRef: React.MutableRefObject<number>
  routeTailOriginRef: React.MutableRefObject<[number, number] | null>
  setRoute: (r: Itinerary | null) => void
  setRouteLoading: (l: boolean) => void
  setError: (e: string | null) => void
}

function fireExactRoute(
  origin: [number, number], destLat: number, destLon: number,
  preferredKey: string | null, requestSeq: number, opts: ScheduleExactRouteOpts
) {
  const controller = new AbortController()
  opts.exactRouteAbortRef.current = controller
  fetchExactRoute(
    { originLat: origin[1], originLon: origin[0], destLat, destLon,
      time: opts.effectiveTimeRef.current, bajs: opts.bajsEnabledRef.current, preferredKey },
    controller.signal
  )
    .then((itinerary) => {
      if (controller.signal.aborted || requestSeq !== opts.exactRouteSeqRef.current) return
      renderFullRoute(opts.map, itinerary)
      opts.routeTailOriginRef.current = null
      opts.setRoute(itinerary)
      opts.setRouteLoading(false)
    })
    .catch((err) => {
      if (controller.signal.aborted) return
      console.error("Exact route fetch failed:", err)
      opts.setRouteLoading(false)
      opts.setError("Nije moguće izračunati rutu")
    })
}

function scheduleExactRoute(
  destLat: number, destLon: number, preferredKey: string | null, opts: ScheduleExactRouteOpts
) {
  const origin = opts.originRef.current
  if (!origin) return
  if (opts.exactRouteTimerRef.current) window.clearTimeout(opts.exactRouteTimerRef.current)
  if (opts.exactRouteAbortRef.current) opts.exactRouteAbortRef.current.abort()
  const requestSeq = ++opts.exactRouteSeqRef.current
  opts.setRouteLoading(true)
  opts.exactRouteTimerRef.current = window.setTimeout(
    () => fireExactRoute(origin, destLat, destLon, preferredKey, requestSeq, opts), 160
  )
}

interface HandleDestinationOpts {
  map: maplibregl.Map
  originRef: React.RefObject<[number, number] | null>
  pendingDestinationRef: React.MutableRefObject<{ lat: number; lng: number } | null>
  isTouchRef: React.RefObject<boolean>
  routingDataRef: React.RefObject<RoutingData | null>
  lastNearestRef: React.MutableRefObject<string | null>
  routeTailOriginRef: React.MutableRefObject<[number, number] | null>
  exactRouteOpts: ScheduleExactRouteOpts
  setRoute: (r: Itinerary | null) => void
  setRouteLoading: (l: boolean) => void
}

function handleDestinationAt(
  lat: number,
  lng: number,
  opts: HandleDestinationOpts
) {
  const o = opts.originRef.current
  if (!o) return

  opts.pendingDestinationRef.current = { lat, lng }
  const dest: [number, number] = [lng, lat]

  updatePreviewAndDot(opts.map, dest)

  const rd = opts.routingDataRef.current
  if (!rd) return

  const nearest = findNearestStop(rd, lat, lng)
  const nearestChanged = nearest !== opts.lastNearestRef.current

  if (nearestChanged) {
    reconstructAndRenderRoute(
      opts.map, rd, lat, lng, nearest, dest,
      opts.routeTailOriginRef, opts.setRoute, opts.setRouteLoading
    )
    opts.lastNearestRef.current = nearest
  } else {
    renderRouteTail(opts.map, opts.routeTailOriginRef.current, dest)
  }

  scheduleExactRoute(lat, lng, nearest, opts.exactRouteOpts)
}


function cleanupMapInit(
  map: maplibregl.Map,
  refs: {
    bajsAbortRef: React.MutableRefObject<AbortController | null>
    routingAbortRef: React.MutableRefObject<AbortController | null>
    exactRouteAbortRef: React.MutableRefObject<AbortController | null>
    exactRouteTimerRef: React.MutableRefObject<number>
    poiAbortRef: React.MutableRefObject<AbortController | null>
    mapRef: React.MutableRefObject<maplibregl.Map | null>
    handleDestinationRef: React.MutableRefObject<((lat: number, lng: number) => void) | null>
    routeTailOriginRef: React.MutableRefObject<[number, number] | null>
    rafRef: React.MutableRefObject<number>
  },
  setMapReady: (v: boolean) => void
) {
  if (refs.bajsAbortRef.current) refs.bajsAbortRef.current.abort()
  if (refs.routingAbortRef.current) refs.routingAbortRef.current.abort()
  if (refs.exactRouteAbortRef.current) refs.exactRouteAbortRef.current.abort()
  if (refs.exactRouteTimerRef.current) {
    window.clearTimeout(refs.exactRouteTimerRef.current)
  }
  if (refs.poiAbortRef.current) refs.poiAbortRef.current.abort()
  map.remove()
  refs.mapRef.current = null
  refs.handleDestinationRef.current = null
  setMapReady(false)
  refs.routeTailOriginRef.current = null
  cancelAnimationFrame(refs.rafRef.current)
}

type VehicleRecord = {
  tripId: string
  routeId?: string | null
  lat: number
  lon: number
  bearing?: number
  speed?: number
}

function buildVehicleFeatureCollection(
  vehicles: VehicleRecord[]
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: vehicles.map((v) => {
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
}

function resetOriginMapState(
  map: maplibregl.Map,
  refs: {
    markerRef: React.MutableRefObject<maplibregl.Marker | null>
    exactRouteAbortRef: React.MutableRefObject<AbortController | null>
    exactRouteTimerRef: React.MutableRefObject<number>
    routingAbortRef: React.MutableRefObject<AbortController | null>
    exactRouteSeqRef: React.MutableRefObject<number>
    pendingDestinationRef: React.MutableRefObject<{ lat: number; lng: number } | null>
    routingDataRef: React.MutableRefObject<RoutingData | null>
  },
  setRouteLoading: (l: boolean) => void
) {
  if (refs.markerRef.current) {
    refs.markerRef.current.remove()
    refs.markerRef.current = null
  }

  const routeSource = map.getSource("route") as maplibregl.GeoJSONSource
  if (routeSource) routeSource.setData(EMPTY_FC)
  const routeTailSource = map.getSource(
    "route-tail"
  ) as maplibregl.GeoJSONSource
  if (routeTailSource) routeTailSource.setData(EMPTY_FC)
  if (refs.exactRouteAbortRef.current) refs.exactRouteAbortRef.current.abort()
  if (refs.exactRouteTimerRef.current) {
    window.clearTimeout(refs.exactRouteTimerRef.current)
  }
  if (refs.routingAbortRef.current) refs.routingAbortRef.current.abort()
  refs.exactRouteSeqRef.current++
  const previewSrc = map.getSource("preview") as maplibregl.GeoJSONSource
  if (previewSrc) previewSrc.setData(EMPTY_FC)
  const dotSrc = map.getSource("dest-dot") as maplibregl.GeoJSONSource
  if (dotSrc) dotSrc.setData(EMPTY_FC)
  setRouteLoading(false)
  refs.pendingDestinationRef.current = null
  refs.routingDataRef.current = null
}

function clearOriginFromMap(
  map: maplibregl.Map,
  originRef: React.MutableRefObject<[number, number] | null>,
  routeTailOriginRef: React.MutableRefObject<[number, number] | null>,
  setRoute: (r: Itinerary | null) => void
) {
  const isoSource = map.getSource("isochrone") as maplibregl.GeoJSONSource
  if (isoSource) isoSource.setData(EMPTY_FC)
  const walkRingSrc = map.getSource("walk-ring") as maplibregl.GeoJSONSource
  if (walkRingSrc) walkRingSrc.setData(EMPTY_FC)
  map.getCanvas().style.cursor = ""
  originRef.current = null
  routeTailOriginRef.current = null
  setRoute(null)
}

function handleIsochroneSuccess(
  map: maplibregl.Map,
  geojson: IsochroneResponse,
  statsCtaDismissedRef: React.RefObject<boolean>,
  setLoading: (l: boolean) => void,
  setShowStatsCta: (v: boolean) => void
) {
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
}

function handleIsochroneError(
  map: maplibregl.Map,
  err: Error,
  routingController: AbortController,
  setError: (e: string | null) => void,
  setLoading: (l: boolean) => void
) {
  console.error("Isochrone fetch failed:", err)
  routingController.abort()
  const msg =
    err.message?.includes("502") || err.message?.includes("503")
      ? "Usluga javnog prijevoza je privremeno nedostupna"
      : "Nije moguće učitati podatke o dosegu"
  setError(msg)
  setLoading(false)
  map.getCanvas().style.cursor = "crosshair"
}

function startIsochroneFetches(
  map: maplibregl.Map,
  originLat: number,
  originLon: number,
  effectiveTime: string,
  bajsEnabled: boolean,
  isoController: AbortController,
  routingController: AbortController,
  statsCtaDismissedRef: React.RefObject<boolean>,
  routingDataRef: React.MutableRefObject<RoutingData | null>,
  pendingDestinationRef: React.RefObject<{ lat: number; lng: number } | null>,
  handleDestinationRef: React.RefObject<((lat: number, lng: number) => void) | null>,
  setLoading: (l: boolean) => void,
  setShowStatsCta: (v: boolean) => void,
  setError: (e: string | null) => void
) {
  fetchIsochrone(
    { lat: originLat, lon: originLon, time: effectiveTime, bajs: bajsEnabled },
    isoController.signal
  )
    .then((geojson: IsochroneResponse) => {
      if (isoController.signal.aborted) return
      handleIsochroneSuccess(map, geojson, statsCtaDismissedRef, setLoading, setShowStatsCta)
    })
    .catch((err) => {
      if (isoController.signal.aborted) return
      handleIsochroneError(map, err, routingController, setError, setLoading)
    })

  fetchIsochroneRouting(
    { lat: originLat, lon: originLon, time: effectiveTime, bajs: bajsEnabled },
    routingController.signal
  )
    .then((response) => {
      if (routingController.signal.aborted) return
      if (!response.routing) return
      routingDataRef.current = parseRoutingData(response.routing, originLat, originLon)
      const pendingDestination = pendingDestinationRef.current
      if (pendingDestination && handleDestinationRef.current) {
        handleDestinationRef.current(pendingDestination.lat, pendingDestination.lng)
      }
    })
    .catch((err) => {
      if (routingController.signal.aborted) return
      console.error("Isochrone routing fetch failed:", err)
    })
}

type MapRefs = {
  containerRef: React.RefObject<HTMLDivElement | null>
  mapRef: React.MutableRefObject<maplibregl.Map | null>
  markerRef: React.MutableRefObject<maplibregl.Marker | null>
  originRef: React.MutableRefObject<[number, number] | null>
  isoAbortRef: React.MutableRefObject<AbortController | null>
  routingAbortRef: React.MutableRefObject<AbortController | null>
  bajsAbortRef: React.MutableRefObject<AbortController | null>
  exactRouteAbortRef: React.MutableRefObject<AbortController | null>
  exactRouteTimerRef: React.MutableRefObject<number>
  exactRouteSeqRef: React.MutableRefObject<number>
  routingDataRef: React.MutableRefObject<RoutingData | null>
  handleDestinationRef: React.MutableRefObject<((lat: number, lng: number) => void) | null>
  pendingDestinationRef: React.MutableRefObject<{ lat: number; lng: number } | null>
  lastNearestRef: React.MutableRefObject<string | null>
  routeTailOriginRef: React.MutableRefObject<[number, number] | null>
  rafRef: React.MutableRefObject<number>
  isTouchRef: React.MutableRefObject<boolean>
  effectiveTimeRef: React.MutableRefObject<string>
  bajsEnabledRef: React.MutableRefObject<boolean>
  statsCtaDismissedRef: React.MutableRefObject<boolean>
  poiAbortRef: React.MutableRefObject<AbortController | null>
  initialLoadRef: React.MutableRefObject<boolean>
}


function useTransitMapRefs(s: { effectiveTime: string; bajsEnabled: boolean; hasOrigin: boolean }): MapRefs {
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
  const handleDestinationRef = useRef<((lat: number, lng: number) => void) | null>(null)
  const pendingDestinationRef = useRef<{ lat: number; lng: number } | null>(null)
  const lastNearestRef = useRef<string | null>(null)
  const routeTailOriginRef = useRef<[number, number] | null>(null)
  const rafRef = useRef<number>(0)
  const isTouchRef = useRef(false)
  const effectiveTimeRef = useRef(s.effectiveTime)
  const bajsEnabledRef = useRef(s.bajsEnabled)
  const statsCtaDismissedRef = useRef(false)
  const poiAbortRef = useRef<AbortController | null>(null)
  const initialLoadRef = useRef(s.hasOrigin)

  return {
    containerRef, mapRef, markerRef, originRef, isoAbortRef, routingAbortRef,
    bajsAbortRef, exactRouteAbortRef, exactRouteTimerRef, exactRouteSeqRef,
    routingDataRef, handleDestinationRef, pendingDestinationRef, lastNearestRef,
    routeTailOriginRef, rafRef, isTouchRef, effectiveTimeRef, bajsEnabledRef,
    statsCtaDismissedRef, poiAbortRef, initialLoadRef,
  }
}

function useEscapeKey(
  originRef: React.RefObject<[number, number] | null>,
  onEscape: () => void
) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && originRef.current) onEscape()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [originRef, onEscape])
}

function useMapInit(
  refs: MapRefs,
  setMapReady: (v: boolean) => void,
  setRoute: (r: Itinerary | null) => void,
  setRouteLoading: (l: boolean) => void,
  setLoading: (l: boolean) => void,
  setError: (e: string | null) => void,
  setCoords: SetCoords,
  clearNames?: () => void
) {
  useEffect(() => {
    if (!refs.containerRef.current) return

    const map = createMap(refs.containerRef.current, refs.isTouchRef)

    map.on("load", () => {
      refs.mapRef.current = map
      addAllMapSources(map)
      addPoiClickHandler(map, refs.originRef)
      addBajsClickHandler(map, refs.originRef)
      bindMapInteractions(map, refs, setRoute, setRouteLoading, setLoading, setError, setCoords, clearNames)
      setMapReady(true)
    })

    return () => {
      cleanupMapInit(map, refs, setMapReady)
    }
  }, [setCoords]) // eslint-disable-line react-hooks/exhaustive-deps
}

function createMap(
  container: HTMLDivElement,
  isTouchRef: React.MutableRefObject<boolean>
): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    center: ZAGREB,
    zoom: 12,
    attributionControl: false,
    canvasContextAttributes: { preserveDrawingBuffer: true },
  })

  map.getContainer().addEventListener(
    "touchstart",
    () => { isTouchRef.current = true },
    { once: true, passive: true }
  )

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right")
  map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right")
  return map
}

function bindMapInteractions(
  map: maplibregl.Map,
  refs: MapRefs,
  setRoute: (r: Itinerary | null) => void,
  setRouteLoading: (l: boolean) => void,
  setLoading: (l: boolean) => void,
  setError: (e: string | null) => void,
  setCoords: SetCoords,
  clearNames?: () => void
) {
  const destOpts: HandleDestinationOpts = {
    map,
    originRef: refs.originRef,
    pendingDestinationRef: refs.pendingDestinationRef,
    isTouchRef: refs.isTouchRef,
    routingDataRef: refs.routingDataRef,
    lastNearestRef: refs.lastNearestRef,
    routeTailOriginRef: refs.routeTailOriginRef,
    exactRouteOpts: {
      map,
      originRef: refs.originRef,
      effectiveTimeRef: refs.effectiveTimeRef,
      bajsEnabledRef: refs.bajsEnabledRef,
      exactRouteTimerRef: refs.exactRouteTimerRef,
      exactRouteAbortRef: refs.exactRouteAbortRef,
      exactRouteSeqRef: refs.exactRouteSeqRef,
      routeTailOriginRef: refs.routeTailOriginRef,
      setRoute,
      setRouteLoading,
      setError,
    },
    setRoute,
    setRouteLoading,
  }

  function handleDestination(lat: number, lng: number) {
    handleDestinationAt(lat, lng, destOpts)
  }
  refs.handleDestinationRef.current = handleDestination

  bindMapClickEvents(map, refs, handleDestination, setRoute, setRouteLoading, setLoading, setError, setCoords, clearNames)
}

function bindMapClickEvents(
  map: maplibregl.Map,
  refs: MapRefs,
  handleDestination: (lat: number, lng: number) => void,
  setRoute: (r: Itinerary | null) => void,
  setRouteLoading: (l: boolean) => void,
  setLoading: (l: boolean) => void,
  setError: (e: string | null) => void,
  setCoords: SetCoords,
  clearNames?: () => void
) {
  map.on("click", (e) => {
    if (refs.originRef.current) {
      clearNames?.()
      handleDestination(e.lngLat.lat, e.lngLat.lng)
      return
    }
    refs.originRef.current = [e.lngLat.lng, e.lngLat.lat]
    setRoute(null)
    setRouteLoading(false)
    setLoading(true)
    setError(null)
    clearNames?.()
    setCoords({
      lat: Math.round(e.lngLat.lat * 1e5) / 1e5,
      lon: Math.round(e.lngLat.lng * 1e5) / 1e5,
    })
    map.easeTo({ center: [e.lngLat.lng, e.lngLat.lat], duration: 400 })
  })
}

function useBajsLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  bajsAbortRef: React.MutableRefObject<AbortController | null>,
  bajsEnabled: boolean,
  mapReady: boolean
) {
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

    return () => { controller.abort() }
  }, [bajsEnabled, mapReady, mapRef, bajsAbortRef])
}

function useVehiclePositions(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapReady: boolean,
  vehiclesEnabled: boolean,
) {
  const { data: vehicles } = useSWR<VehicleRecord[]>(
    vehiclesEnabled && mapReady ? "/api/vehicles" : null,
    { refreshInterval: 30_000 }
  )

  const vehiclePositions = useMemo(
    () => vehicles ? buildVehicleFeatureCollection(vehicles) : EMPTY_FC,
    [vehicles]
  )

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const source = map.getSource("vehicle-positions") as maplibregl.GeoJSONSource
    if (source) source.setData(vehiclePositions)
  }, [vehiclePositions, mapReady, mapRef])
}

function usePoiLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  poiAbortRef: React.MutableRefObject<AbortController | null>,
  poiEnabled: boolean,
  mapReady: boolean
) {
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const source = map.getSource("poi") as maplibregl.GeoJSONSource
    if (!source) return
    if (!poiEnabled) { source.setData(EMPTY_FC); return }
    if (poiAbortRef.current) poiAbortRef.current.abort()
    const controller = new AbortController()
    poiAbortRef.current = controller
    fetchPoiData(source, controller)
    return () => { controller.abort() }
  }, [poiEnabled, mapReady, mapRef, poiAbortRef])
}

function fetchPoiData(source: maplibregl.GeoJSONSource, controller: AbortController) {
  fetch("/api/poi?categories=hospital,school,park,pharmacy", { signal: controller.signal })
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
}

function useOriginIsochrone(
  refs: MapRefs,
  originLat: number | null,
  originLon: number | null,
  mapReady: boolean,
  effectiveTime: string,
  bajsEnabled: boolean,
  resetFetchState: () => void,
  setRoute: (r: Itinerary | null) => void,
  setRouteLoading: (l: boolean) => void,
  setLoading: (l: boolean) => void,
  setError: (e: string | null) => void,
  setShowStatsCta: (v: boolean) => void
) {
  useEffect(() => {
    const map = refs.mapRef.current
    if (!map || !mapReady) return

    resetOriginMapState(map, refs, setRouteLoading)

    if (originLat === null || originLon === null) {
      clearOriginFromMap(map, refs.originRef, refs.routeTailOriginRef, setRoute)
      return
    }

    prepareOriginMarker(map, refs, originLat, originLon)

    if (refs.isoAbortRef.current) refs.isoAbortRef.current.abort()
    if (refs.routingAbortRef.current) refs.routingAbortRef.current.abort()
    const isoController = new AbortController()
    const routingController = new AbortController()
    refs.isoAbortRef.current = isoController // eslint-disable-line react-hooks/immutability
    refs.routingAbortRef.current = routingController

    resetFetchState()

    startIsochroneFetches(
      map, originLat, originLon, effectiveTime, bajsEnabled,
      isoController, routingController,
      refs.statsCtaDismissedRef, refs.routingDataRef, refs.pendingDestinationRef,
      refs.handleDestinationRef,
      setLoading, setShowStatsCta, setError
    )

    return () => { isoController.abort(); routingController.abort() }
  }, [originLat, originLon, mapReady, effectiveTime, bajsEnabled]) // eslint-disable-line react-hooks/exhaustive-deps
}

function prepareOriginMarker(
  map: maplibregl.Map,
  refs: MapRefs,
  originLat: number,
  originLon: number
) {
  const origin: [number, number] = [originLon, originLat]
  refs.originRef.current = origin

  if (refs.initialLoadRef.current) {
    refs.initialLoadRef.current = false
    map.jumpTo({ center: origin, zoom: 13 })
  }

  map.getCanvas().style.cursor = "progress"
  refs.lastNearestRef.current = null
  refs.routeTailOriginRef.current = null

  refs.markerRef.current = new maplibregl.Marker({
    element: createMarkerElement(),
  })
    .setLngLat(origin)
    .addTo(map)
}

function useTransitMapState() {
  const [coords, setCoords] = useQueryStates({ lat: parseAsFloat, lon: parseAsFloat })
  const [time, setTime] = useQueryState("t", parseAsString)
  const [bajs, setBajs] = useQueryState("bajs", parseAsString)
  const [defaultTime] = useState(formatTime)
  const effectiveTime = time ?? defaultTime
  const bajsEnabled = bajs === "1"
  const [route, setRoute] = useState<Itinerary | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 4000)
    return () => clearTimeout(t)
  }, [error])
  const [mapReady, setMapReady] = useState(false)
  const [showStatsCta, setShowStatsCta] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [vehiclesEnabled, setVehiclesEnabled] = useState(false)
  const [poiEnabled, setPoiEnabled] = useState(false)
  const [layersOpen, setLayersOpen] = useState(false)
  const [originName, setOriginName] = useState<string | null>(null)
  const [destName, setDestName] = useState<string | null>(null)
  const [swapping, setSwapping] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const hasOrigin = coords.lat !== null && coords.lon !== null

  return {
    coords, setCoords, time, setTime, bajs, setBajs,
    effectiveTime, bajsEnabled, route, setRoute,
    routeLoading, setRouteLoading, loading, setLoading,
    error, setError, mapReady, setMapReady,
    showStatsCta, setShowStatsCta, linkCopied, setLinkCopied,
    vehiclesEnabled, setVehiclesEnabled,
    poiEnabled, setPoiEnabled, layersOpen, setLayersOpen,
    originName, setOriginName, destName, setDestName,
    swapping, setSwapping, mobileSearchOpen, setMobileSearchOpen,
    hasOrigin,
  }
}

const ONBOARDING_KEY = "doseg-onboarded"

function useTransitMapCallbacks(s: ReturnType<typeof useTransitMapState>) {
  const { setCoords, setRoute, setRouteLoading, setError, setOriginName, setDestName, setLoading } = s
  const onEscape = useCallback(() => {
    setCoords({ lat: null, lon: null }); setRoute(null); setRouteLoading(false); setError(null); setOriginName(null); setDestName(null)
  }, [setCoords, setRoute, setRouteLoading, setError, setOriginName, setDestName])
  const resetFetchState = useCallback(() => {
    setLoading(true); setError(null); setRoute(null); setRouteLoading(false)
  }, [setLoading, setError, setRoute, setRouteLoading])
  const clearNames = useCallback(() => { setOriginName(null); setDestName(null) }, [setOriginName, setDestName])
  return { onEscape, resetFetchState, clearNames }
}

export function TransitMap() {
  const s = useTransitMapState()
  const refs = useTransitMapRefs(s)
  const { onEscape, resetFetchState, clearNames } = useTransitMapCallbacks(s)
  const [onboardingOpen, setOnboardingOpen] = useState(() => {
    if (typeof window === "undefined") return false
    return !localStorage.getItem(ONBOARDING_KEY)
  })

  const [everHadOrigin, setEverHadOrigin] = useState(s.hasOrigin)
  useEffect(() => { if (s.hasOrigin) setEverHadOrigin(true) }, [s.hasOrigin])
  useEffect(() => { refs.effectiveTimeRef.current = s.effectiveTime }, [s.effectiveTime]) // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/immutability
  useEffect(() => { refs.bajsEnabledRef.current = s.bajsEnabled }, [s.bajsEnabled]) // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/immutability

  useEscapeKey(refs.originRef, onEscape)
  useMapInit(refs, s.setMapReady, s.setRoute, s.setRouteLoading, s.setLoading, s.setError, s.setCoords, clearNames)
  useBajsLayer(refs.mapRef, refs.bajsAbortRef, s.bajsEnabled, s.mapReady)
  useVehiclePositions(refs.mapRef, s.mapReady, s.vehiclesEnabled)
  usePoiLayer(refs.mapRef, refs.poiAbortRef, s.poiEnabled, s.mapReady)
  useOriginIsochrone(refs, s.coords.lat, s.coords.lon, s.mapReady, s.effectiveTime, s.bajsEnabled, resetFetchState, s.setRoute, s.setRouteLoading, s.setLoading, s.setError, s.setShowStatsCta)

  return (
    <TransitMapView
      containerRef={refs.containerRef} loading={s.loading} bajsEnabled={s.bajsEnabled}
      poiEnabled={s.poiEnabled} layersOpen={s.layersOpen} vehiclesEnabled={s.vehiclesEnabled}
      effectiveTime={s.effectiveTime} hasOrigin={s.hasOrigin} everHadOrigin={everHadOrigin} error={s.error}
      showStatsCta={s.showStatsCta} route={s.route} routeLoading={s.routeLoading}
      linkCopied={s.linkCopied} mapRef={refs.mapRef} statsCtaDismissedRef={refs.statsCtaDismissedRef}
      onboardingOpen={onboardingOpen} setOnboardingOpen={setOnboardingOpen}
      setTime={s.setTime} setBajs={s.setBajs} setLayersOpen={s.setLayersOpen}
      setVehiclesEnabled={s.setVehiclesEnabled} setPoiEnabled={s.setPoiEnabled}
      setCoords={s.setCoords} setShowStatsCta={s.setShowStatsCta} setLinkCopied={s.setLinkCopied}
      handleDestinationRef={refs.handleDestinationRef}
      pendingDestinationRef={refs.pendingDestinationRef}
      originName={s.originName} setOriginName={s.setOriginName}
      destName={s.destName} setDestName={s.setDestName}
      swapping={s.swapping} setSwapping={s.setSwapping}
      mobileSearchOpen={s.mobileSearchOpen} setMobileSearchOpen={s.setMobileSearchOpen}
    />
  )
}

type Ease = readonly [number, number, number, number]
type SetCoords = (v: { lat: number | null; lon: number | null }) => void

type TransitMapViewProps = {
  containerRef: React.RefObject<HTMLDivElement | null>
  loading: boolean
  bajsEnabled: boolean
  poiEnabled: boolean
  layersOpen: boolean
  vehiclesEnabled: boolean
  effectiveTime: string
  hasOrigin: boolean
  everHadOrigin: boolean
  error: string | null
  showStatsCta: boolean
  route: Itinerary | null
  routeLoading: boolean
  linkCopied: boolean
  mapRef: React.RefObject<maplibregl.Map | null>
  statsCtaDismissedRef: React.MutableRefObject<boolean>
  onboardingOpen: boolean
  setOnboardingOpen: (v: boolean) => void
  setTime: (v: string | null) => void
  setBajs: (v: string | null) => void
  setLayersOpen: React.Dispatch<React.SetStateAction<boolean>>
  setVehiclesEnabled: React.Dispatch<React.SetStateAction<boolean>>
  setPoiEnabled: React.Dispatch<React.SetStateAction<boolean>>
  setCoords: SetCoords
  setShowStatsCta: (v: boolean) => void
  setLinkCopied: (v: boolean) => void
  handleDestinationRef: React.RefObject<((lat: number, lng: number) => void) | null>
  pendingDestinationRef: React.MutableRefObject<{ lat: number; lng: number } | null>
  originName: string | null
  setOriginName: (v: string | null) => void
  destName: string | null
  setDestName: (v: string | null) => void
  swapping: boolean
  setSwapping: (v: boolean) => void
  mobileSearchOpen: boolean
  setMobileSearchOpen: (v: boolean) => void
}

function useStableOriginName(route: Itinerary | null, hasOrigin: boolean, explicitName: string | null) {
  const [routeName, setRouteName] = useState<string | null>(null)
  useEffect(() => {
    if (!hasOrigin) { startTransition(() => setRouteName(null)); return }
    if (!route) return
    startTransition(() => setRouteName(prev => {
      if (prev) return prev
      for (const leg of route.legs) {
        if (leg.from.name) return leg.from.name
      }
      return null
    }))
  }, [route, hasOrigin])
  return explicitName ?? routeName ?? undefined
}

function PersistentSidePanel({ p, mapRef }: { p: Omit<TransitMapViewProps, "containerRef" | "mapRef" | "statsCtaDismissedRef"> & { ease: Ease }; mapRef: React.RefObject<maplibregl.Map | null> }) {
  const originName = useStableOriginName(p.route, p.hasOrigin, p.originName)

  // Keep old route visible during swap until new one arrives
  const [staleRoute, setStaleRoute] = useState<Itinerary | null>(null)
  useEffect(() => { if (p.route && p.swapping) p.setSwapping(false) }, [p.route, p.swapping, p.setSwapping])

  const displayItinerary = p.route ?? (p.swapping ? staleRoute : null)
  const showRoute = displayItinerary || p.routeLoading || (p.loading && p.destName !== null)
  const isSwapLoading = p.swapping && !p.route

  return (
    <SidePanel>
      <div className="flex min-h-0 flex-1 flex-col">
        {showRoute ? (
          <RoutePanelContent
            itinerary={displayItinerary}
            loading={p.routeLoading || isSwapLoading}
            departureTime={p.effectiveTime}
            originName={originName}
            destName={p.destName ?? undefined}
            onSwap={() => {
              const route = p.route ?? staleRoute
              if (!route) return
              setStaleRoute(route)
              const destLeg = route.legs[route.legs.length - 1]
              const newOrigin = { lat: destLeg.to.lat, lon: destLeg.to.lon }
              const oldOrigin = { lat: route.legs[0].from.lat, lon: route.legs[0].from.lon }
              const newOriginName = p.destName ?? route.legs.findLast((l: Leg) => l.to.name)?.to.name ?? null
              p.setOriginName(newOriginName)
              p.setDestName(originName ?? null)
              p.setSwapping(true)
              p.setCoords(newOrigin)
              mapRef.current?.easeTo({ center: [newOrigin.lon, newOrigin.lat], duration: 400 })
              setTimeout(() => { p.pendingDestinationRef.current = { lat: oldOrigin.lat, lng: oldOrigin.lon } }, 50)
            }}
            onShare={() => { navigator.clipboard.writeText(window.location.href).then(() => { p.setLinkCopied(true); setTimeout(() => p.setLinkCopied(false), 2000) }) }}
            onExport={() => { const map = mapRef.current; if (!map) return; const link = document.createElement("a"); link.download = "doseg.png"; link.href = map.getCanvas().toDataURL("image/png"); link.click() }}
            onReset={() => { p.setCoords({ lat: null, lon: null }); p.setOriginName(null); p.setDestName(null) }}
            shareConfirm={p.linkCopied}
          />
        ) : (
          <SidePanelIdleContent p={p} mapRef={mapRef} />
        )}
      </div>
    </SidePanel>
  )
}

function IdleInputs({ hasOrigin, originName, onReset, onSelectOrigin, onSelectDestination, onCurrentLocation }: {
  hasOrigin: boolean
  originName?: string
  onReset: () => void
  onSelectOrigin: (lat: number, lon: number, name: string) => void
  onSelectDestination: (lat: number, lon: number, name: string) => void
  onCurrentLocation: () => void
}) {
  return (
    <div className="bg-[rgba(32,33,36,0.98)] px-3 py-3 shrink-0 flex gap-1">
      {hasOrigin ? (
        <button type="button" onClick={onReset} className="mt-1 h-10 w-10 shrink-0 flex items-center justify-center text-slate-300 hover:text-white rounded-full hover:bg-white/10" aria-label="Natrag">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
      ) : (
        <div className="h-10 w-10 shrink-0" />
      )}
      <div className="flex-1 flex gap-3">
        <div className="flex flex-col items-center mt-3 ml-1 shrink-0">
          <div className="h-3.5 w-3.5 rounded-full border-[2.5px] border-slate-300 shrink-0" />
          <div className="flex flex-col gap-[3px] my-1 shrink-0">
            <div className="w-[3px] h-[3px] rounded-full bg-slate-500" />
            <div className="w-[3px] h-[3px] rounded-full bg-slate-500" />
            <div className="w-[3px] h-[3px] rounded-full bg-slate-500" />
          </div>
          <div className="h-5 w-5 flex items-center justify-center text-[#ea4335]/50">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
          </div>
        </div>
        <div className="flex-1 flex flex-col gap-2 mt-0.5 min-w-0">
          <AddressInput
            placeholder="Pretraži adresu ili klikni kartu"
            value={originName || (hasOrigin ? "Polazište" : "")}
            onSelect={onSelectOrigin}
            onCurrentLocation={onCurrentLocation}
          />
          <AddressInput
            placeholder="Odaberi odredište"
            value=""
            onSelect={onSelectDestination}
            readOnly={!hasOrigin}
          />
        </div>
      </div>
      <div className="self-center mt-0.5 h-10 w-10 shrink-0 flex items-center justify-center text-slate-500/50 ml-1">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12"/><path d="M15 14v-8"/><path d="M3 14l4 4 4-4"/><path d="M11 6l4-4 4 4"/></svg>
      </div>
    </div>
  )
}

function useIdleGeo(mapRef: React.RefObject<maplibregl.Map | null>, setCoords: SetCoords, setOriginName: (v: string | null) => void) {
  const locatingRef = useRef(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  useEffect(() => { if (geoError) { const t = setTimeout(() => setGeoError(null), 3000); return () => clearTimeout(t) } }, [geoError])
  const locate = useCallback(() => {
    requestGeolocation(mapRef, (v) => { setCoords(v); setOriginName("Moja lokacija") }, (v) => { locatingRef.current = v }, setGeoError)
  }, [mapRef, setCoords, setOriginName])
  return { geoError, locate }
}

function SidePanelIdleContent({ p, mapRef }: { p: Omit<TransitMapViewProps, "containerRef" | "mapRef" | "statsCtaDismissedRef"> & { ease: Ease }; mapRef: React.RefObject<maplibregl.Map | null> }) {
  const { geoError, locate } = useIdleGeo(mapRef, p.setCoords, p.setOriginName)
  return (
    <div className="flex flex-1 flex-col">
      {geoError && <div className="px-5 py-2 text-[12px] text-red-400">{geoError}</div>}
      <IdleInputs
        hasOrigin={p.hasOrigin}
        originName={p.originName ?? undefined}
        onReset={() => { p.setCoords({ lat: null, lon: null }); p.setOriginName(null); p.setDestName(null) }}
        onSelectOrigin={(lat, lon, name) => { p.setOriginName(name); p.setCoords({ lat, lon }); mapRef.current?.easeTo({ center: [lon, lat], duration: 400 }) }}
        onSelectDestination={(lat, lon, name) => { p.setDestName(name); p.handleDestinationRef.current?.(lat, lon) }}
        onCurrentLocation={locate}
      />
      <div className="px-5 pt-5 pb-4">
        <h1 className="text-[20px] font-bold text-white">Doseg</h1>
        <p className="mt-0.5 text-[13px] text-slate-500">Karta dosega javnog prijevoza u Zagrebu</p>
      </div>
      <div className="border-t border-white/6 px-5 py-4">
        <ColorScale />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
        {!p.hasOrigin ? (
          <p className="text-[14px] leading-relaxed text-slate-400">
            Klikni bilo gdje na karti da vidiš dokle možeš stići.
          </p>
        ) : (
          <>
            <p className="text-[14px] text-slate-400">Klikni odredište na karti za rutu</p>
            <button
              type="button"
              onClick={() => p.setCoords({ lat: null, lon: null })}
              className="mt-1 rounded-lg bg-white/[0.07] px-5 py-2.5 text-[13px] font-medium text-slate-300 transition-[background-color,transform] duration-160 ease-out hover:bg-white/[0.12] hover:text-white active:scale-[0.97]"
            >
              Promijeni polazište
            </button>
          </>
        )}
      </div>
      <div className="flex items-center justify-center gap-5 border-t border-white/6 px-5 py-4">
        <Link href="/o-projektu" prefetch={false} className="text-[13px] text-slate-500 transition-colors hover:text-slate-300">O projektu</Link>
        <Link href="/statistika" prefetch={false} className="text-[13px] text-slate-500 transition-colors hover:text-slate-300">Statistika</Link>
        <button type="button" onClick={() => p.setOnboardingOpen(true)} className="text-[13px] text-slate-500 transition-colors hover:text-slate-300">Pomoć</button>
      </div>
    </div>
  )
}

function MobileSearchOverlay({ p, mapRef }: { p: Omit<TransitMapViewProps, "containerRef" | "mapRef" | "statsCtaDismissedRef"> & { ease: Ease }; mapRef: React.RefObject<maplibregl.Map | null> }) {
  const { geoError, locate } = useIdleGeo(mapRef, p.setCoords, p.setOriginName)
  const destRef = useRef<HTMLDivElement>(null)
  return (
    <AnimatePresence>
      {p.mobileSearchOpen && (
        <m.div
          key="mobile-search"
          className="fixed inset-0 z-50 bg-[rgba(24,24,28,0.98)] flex flex-col"
          initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
          transition={{ duration: 0.3, ease: p.ease }}
        >
          <div className="flex items-center gap-2 px-3 py-3 shrink-0">
            <button type="button" onClick={() => p.setMobileSearchOpen(false)} className="h-10 w-10 shrink-0 flex items-center justify-center text-slate-300 hover:text-white rounded-full hover:bg-white/10" aria-label="Zatvori">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <span className="text-[16px] font-medium text-white">Pretraži</span>
          </div>
          {geoError && <div className="px-5 py-1 text-[12px] text-red-400">{geoError}</div>}
          <MobileSearchFields p={p} mapRef={mapRef} locate={locate} destRef={destRef} />
        </m.div>
      )}
    </AnimatePresence>
  )
}

function MobileSearchFields({ p, mapRef, locate, destRef }: {
  p: Omit<TransitMapViewProps, "containerRef" | "mapRef" | "statsCtaDismissedRef"> & { ease: Ease }
  mapRef: React.RefObject<maplibregl.Map | null>
  locate: () => void
  destRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <div className="px-3 flex gap-3">
      <div className="flex flex-col items-center mt-3 ml-1 shrink-0">
        <div className="h-3.5 w-3.5 rounded-full border-[2.5px] border-slate-300 shrink-0" />
        <div className="flex flex-col gap-[3px] my-1 shrink-0">
          <div className="w-[3px] h-[3px] rounded-full bg-slate-500" />
          <div className="w-[3px] h-[3px] rounded-full bg-slate-500" />
          <div className="w-[3px] h-[3px] rounded-full bg-slate-500" />
        </div>
        <div className="h-5 w-5 flex items-center justify-center text-[#ea4335]/50">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" /></svg>
        </div>
      </div>
      <div className="flex-1 flex flex-col gap-2 mt-0.5 min-w-0">
        <AddressInput
          placeholder="Polazište"
          value={p.originName || (p.hasOrigin ? "Polazište" : "")}
          onSelect={(lat, lon, name) => {
            p.setOriginName(name)
            p.setCoords({ lat, lon })
            mapRef.current?.easeTo({ center: [lon, lat], duration: 400 })
          }}
          onCurrentLocation={locate}
          autoFocus={!p.hasOrigin}
        />
        <div ref={destRef}>
          <AddressInput
            placeholder="Odredište"
            value=""
            onSelect={(lat, lon, name) => {
              p.setDestName(name)
              p.handleDestinationRef.current?.(lat, lon)
              p.setMobileSearchOpen(false)
            }}
            readOnly={!p.hasOrigin}
            autoFocus={p.hasOrigin}
          />
        </div>
      </div>
    </div>
  )
}

function TransitMapView({ containerRef, mapRef, statsCtaDismissedRef, ...rest }: TransitMapViewProps) {
  const ease = [0.23, 1, 0.32, 1] as const
  return (
    <MotionConfig reducedMotion="user">
      {/* pointer-events-auto: vaul's Radix Dialog sets pointer-events:none on <body> when drawer opens */}
      <div className="flex h-svh w-full pointer-events-auto">
        <PersistentSidePanel p={{ ...rest, ease }} mapRef={mapRef} />
        <div className="relative flex-1">
          <div ref={containerRef} className="h-full w-full" role="application" aria-label="Interaktivna karta dosega javnog prijevoza u Zagrebu" />
          <LoadingBar loading={rest.loading} ease={ease} />
          <LayerLegend bajsEnabled={rest.bajsEnabled} poiEnabled={rest.poiEnabled} ease={ease} />
          <HudOverlay {...rest} mapRef={mapRef} statsCtaDismissedRef={statsCtaDismissedRef} ease={ease} />
          <div id="route-announcer" aria-live="polite" aria-atomic="true" className="sr-only" />
          <OnboardingDialog open={rest.onboardingOpen} onClose={() => { localStorage.setItem(ONBOARDING_KEY, "1"); rest.setOnboardingOpen(false) }} />
        </div>
        <MobileSearchOverlay p={{ ...rest, ease }} mapRef={mapRef} />
      </div>
    </MotionConfig>
  )
}

function LoadingBar({ loading, ease }: { loading: boolean; ease: readonly [number, number, number, number] }) {
  return (
    <AnimatePresence>
      {loading && (
        <m.div
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
        </m.div>
      )}
    </AnimatePresence>
  )
}

function BajsLegend() {
  return (
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
  )
}

function PoiLegend() {
  return (
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
  )
}

function LayerLegend({
  bajsEnabled,
  poiEnabled,
  ease,
}: {
  bajsEnabled: boolean
  poiEnabled: boolean
  ease: readonly [number, number, number, number]
}) {
  return (
    <AnimatePresence>
      {(bajsEnabled || poiEnabled) && (
        <m.div
          className="panel pointer-events-auto absolute bottom-6 left-3 z-10 flex flex-col gap-2 px-3 py-2 sm:bottom-4 sm:left-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
          transition={{ duration: 0.2, ease }}
        >
          {bajsEnabled && <BajsLegend />}
          {bajsEnabled && poiEnabled && <div className="h-px bg-white/10" />}
          {poiEnabled && <PoiLegend />}
        </m.div>
      )}
    </AnimatePresence>
  )
}

type IslandToolbarProps = {
  effectiveTime: string
  bajsEnabled: boolean
  layersOpen: boolean
  vehiclesEnabled: boolean
  poiEnabled: boolean
  hasOrigin: boolean
  ease: Ease
  mapRef: React.RefObject<maplibregl.Map | null>
  setTime: (v: string | null) => void
  setBajs: (v: string | null) => void
  setLayersOpen: React.Dispatch<React.SetStateAction<boolean>>
  setVehiclesEnabled: React.Dispatch<React.SetStateAction<boolean>>
  setPoiEnabled: React.Dispatch<React.SetStateAction<boolean>>
  setCoords: SetCoords
  setMobileSearchOpen: (v: boolean) => void
}

function IslandToolbar(props: IslandToolbarProps) {
  return (
    <m.div
      className="island pointer-events-auto"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: props.ease }}
    >
      <IslandMainRow
        effectiveTime={props.effectiveTime}
        bajsEnabled={props.bajsEnabled}
        layersOpen={props.layersOpen}
        vehiclesEnabled={props.vehiclesEnabled}
        poiEnabled={props.poiEnabled}
        hasOrigin={props.hasOrigin}
        mapRef={props.mapRef}
        setTime={props.setTime}
        setBajs={props.setBajs}
        setLayersOpen={props.setLayersOpen}
        setCoords={props.setCoords}
        setMobileSearchOpen={props.setMobileSearchOpen}
      />
      <IslandLayerToggles
        layersOpen={props.layersOpen}
        vehiclesEnabled={props.vehiclesEnabled}
        poiEnabled={props.poiEnabled}
        ease={props.ease}
        setVehiclesEnabled={props.setVehiclesEnabled}
        setPoiEnabled={props.setPoiEnabled}
      />
    </m.div>
  )
}

type IslandMainRowProps = {
  effectiveTime: string
  bajsEnabled: boolean
  layersOpen: boolean
  vehiclesEnabled: boolean
  poiEnabled: boolean
  hasOrigin: boolean
  mapRef: React.RefObject<maplibregl.Map | null>
  setTime: (v: string | null) => void
  setBajs: (v: string | null) => void
  setLayersOpen: React.Dispatch<React.SetStateAction<boolean>>
  setCoords: SetCoords
  setMobileSearchOpen: (v: boolean) => void
}

function IslandMainRow(p: IslandMainRowProps) {
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <div className="flex items-center gap-1.5">
        <TimePicker value={p.effectiveTime} onChange={(v) => p.setTime(v)} />
      </div>
      <div className="h-6 w-px bg-white/10" />
      <BajsToggleButton bajsEnabled={p.bajsEnabled} setBajs={p.setBajs} />
      <LayersButton layersOpen={p.layersOpen} vehiclesEnabled={p.vehiclesEnabled} poiEnabled={p.poiEnabled} setLayersOpen={p.setLayersOpen} />
      <LocateMeButton mapRef={p.mapRef} setCoords={p.setCoords} />
      <button
        type="button"
        onClick={() => p.setMobileSearchOpen(true)}
        className="flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200 transition-[background-color,color,transform] duration-160 ease-out active:scale-[0.97] sm:hidden"
        aria-label="Pretraži adresu"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
      </button>
      <div className="hidden h-6 w-px bg-white/10 sm:block" />
      <div className="hidden sm:block">
        <ColorScale />
      </div>
    </div>
  )
}

function BajsToggleButton({ bajsEnabled, setBajs }: { bajsEnabled: boolean; setBajs: (v: string | null) => void }) {
  return (
    <button
      type="button"
      onClick={() => setBajs(bajsEnabled ? null : "1")}
      aria-pressed={bajsEnabled}
      className={`flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none ${
        bajsEnabled
          ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/40"
          : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
      }`}
      title="Dodaj BAJS bicikl u izračun rute"
    >
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="5.5" cy="17.5" r="3.5" />
        <circle cx="18.5" cy="17.5" r="3.5" />
        <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h2" />
      </svg>
      <span>+ BAJS</span>
    </button>
  )
}

function ColorScale() {
  return (
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
  )
}

function LayersButton({
  layersOpen,
  vehiclesEnabled,
  poiEnabled,
  setLayersOpen,
}: {
  layersOpen: boolean
  vehiclesEnabled: boolean
  poiEnabled: boolean
  setLayersOpen: React.Dispatch<React.SetStateAction<boolean>>
}) {
  return (
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
  )
}

function geoErrorMessage(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED) return "Pristup lokaciji odbijen"
  if (err.code === err.POSITION_UNAVAILABLE) return "Lokacija nedostupna"
  return "Vrijeme za lokaciju isteklo"
}

function requestGeolocation(
  mapRef: React.RefObject<maplibregl.Map | null>,
  setCoords: SetCoords,
  setLocating: (v: boolean) => void,
  setGeoError: (v: string | null) => void
) {
  if (!navigator.geolocation) {
    setGeoError("Geolokacija nije dostupna")
    return
  }
  setLocating(true)
  setGeoError(null)
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = Math.round(pos.coords.latitude * 1e5) / 1e5
      const lon = Math.round(pos.coords.longitude * 1e5) / 1e5
      setCoords({ lat, lon })
      mapRef.current?.easeTo({ center: [lon, lat], duration: 400 })
      setLocating(false)
    },
    (err) => {
      setLocating(false)
      setGeoError(geoErrorMessage(err))
    },
    { enableHighAccuracy: false, timeout: 10000 }
  )
}

function GeoErrorTooltip({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message && (
        <m.div
          key="geo-error"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4, transition: { duration: 0.15, ease: [0.23, 1, 0.32, 1] } }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          className="absolute top-full left-1/2 z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[rgba(30,30,30,0.92)] px-3 py-1.5 text-[11px] text-red-400 shadow-lg backdrop-blur-md"
        >
          {message}
        </m.div>
      )}
    </AnimatePresence>
  )
}

function LocateMeButton({ mapRef, setCoords }: { mapRef: React.RefObject<maplibregl.Map | null>; setCoords: SetCoords }) {
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  useEffect(() => {
    if (!geoError) return
    const t = setTimeout(() => setGeoError(null), 3000)
    return () => clearTimeout(t)
  }, [geoError])
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => requestGeolocation(mapRef, setCoords, setLocating, setGeoError)}
        disabled={locating}
        className={`flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold transition-[background-color,color,transform] duration-160 ease-out focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none active:scale-[0.97] ${
          locating
            ? "bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400/40"
            : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
        }`}
        title="Pronađi moju lokaciju"
        aria-label="Pronađi moju lokaciju"
      >
        <svg
          aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={locating ? "animate-pulse" : ""}
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
        </svg>
      </button>
      <GeoErrorTooltip message={geoError} />
    </div>
  )
}


type IslandLayerTogglesProps = {
  layersOpen: boolean
  vehiclesEnabled: boolean
  poiEnabled: boolean
  ease: Ease
  setVehiclesEnabled: React.Dispatch<React.SetStateAction<boolean>>
  setPoiEnabled: React.Dispatch<React.SetStateAction<boolean>>
}

function IslandLayerToggles(p: IslandLayerTogglesProps) {
  return (
    <AnimatePresence>
      {p.layersOpen && (
        <m.div
          key="layers"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: p.ease }}
          className="overflow-hidden"
        >
          <div className="flex flex-col items-center gap-1.5 border-t border-white/10 px-3 pt-2 pb-0.5">
            <span className="text-[9px] font-medium tracking-wide text-slate-500 uppercase">Na karti</span>
            <div className="flex items-center gap-2">
              <VehiclesToggle enabled={p.vehiclesEnabled} onToggle={p.setVehiclesEnabled} />
              <PoiToggle enabled={p.poiEnabled} onToggle={p.setPoiEnabled} />
            </div>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  )
}

function VehiclesToggle({ enabled, onToggle }: { enabled: boolean; onToggle: React.Dispatch<React.SetStateAction<boolean>> }) {
  return (
    <button
      type="button"
      onClick={() => onToggle((v) => !v)}
      title="Prikaži gdje se tramvaji i busevi trenutno nalaze"
      className={`flex h-7 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold transition-colors ${
        enabled
          ? "bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400/40"
          : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
      }`}
    >
      <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v4m0 12v4m10-10h-4M6 12H2" />
      </svg>
      Tramvaji i busevi uživo
    </button>
  )
}

function PoiToggle({ enabled, onToggle }: { enabled: boolean; onToggle: React.Dispatch<React.SetStateAction<boolean>> }) {
  return (
    <button
      type="button"
      onClick={() => onToggle((v) => !v)}
      className={`flex h-7 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold transition-colors ${
        enabled
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
  )
}

function HintBubble({ k, ease, children }: { k: string; ease: Ease; children: React.ReactNode }) {
  return (
    <m.div
      key={k}
      className="panel pointer-events-auto"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
      transition={{ duration: 0.2, ease }}
    >
      {children}
    </m.div>
  )
}

function BottomHintPanel({ hasOrigin, everHadOrigin, route, loading, routeLoading, ease, setCoords }: {
  hasOrigin: boolean; everHadOrigin: boolean; route: Itinerary | null; loading: boolean
  routeLoading: boolean; ease: Ease; setCoords: SetCoords
}) {
  return (
    <AnimatePresence mode="wait">
      {!hasOrigin && !everHadOrigin && (
        <HintBubble k="origin" ease={ease}>
          <div className="text-center text-[13px] text-slate-300">
            Klikni bilo gdje da vidiš dokle možeš stići tramvajem i busom
          </div>
        </HintBubble>
      )}
      {hasOrigin && !route && !loading && !routeLoading && (
        <HintBubble k="dest" ease={ease}>
          <div className="flex items-center justify-center gap-3">
            <span className="text-[13px] text-slate-300">Klikni odredište</span>
            <span className="text-slate-600">·</span>
            <button type="button" onClick={() => setCoords({ lat: null, lon: null })}
              className="text-[12px] text-slate-500 transition-[color,transform] duration-160 ease-out hover:text-slate-300 active:scale-[0.97]">
              promijeni polazište
            </button>
          </div>
        </HintBubble>
      )}
    </AnimatePresence>
  )
}


function RouteDetailsPanel({
  route,
  routeLoading,
  effectiveTime,
  linkCopied,
  mapRef,
  setLinkCopied,
  setCoords,
}: {
  route: Itinerary | null
  routeLoading: boolean
  effectiveTime: string
  linkCopied: boolean
  mapRef: React.RefObject<maplibregl.Map | null>
  setLinkCopied: (v: boolean) => void
  setCoords: SetCoords
}) {
  const [dismissedRoute, setDismissedRoute] = useState<Itinerary | null>(null)
  const isDismissed = dismissedRoute !== null && dismissedRoute === route

  return (
    <RouteDetails
      open={!!(route || routeLoading) && !isDismissed}
      itinerary={route}
      loading={routeLoading}
      departureTime={effectiveTime}
      className="pointer-events-auto sm:hidden"
      onDismiss={() => setDismissedRoute(route)}
      onShare={() => {
        navigator.clipboard.writeText(window.location.href).then(() => {
          setLinkCopied(true)
          setTimeout(() => setLinkCopied(false), 2000)
        })
      }}
      onExport={() => {
        const map = mapRef.current
        if (!map) return
        const link = document.createElement("a")
        link.download = "doseg.png"
        link.href = map.getCanvas().toDataURL("image/png")
        link.click()
      }}
      onReset={() => setCoords({ lat: null, lon: null })}
      shareConfirm={linkCopied}
    />
  )
}

type HudOverlayProps = Omit<TransitMapViewProps, "containerRef"> & { ease: Ease }

function HudOverlay(p: HudOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid grid-rows-[auto_1fr_auto] grid-cols-[auto_1fr_auto] gap-0 px-3 pt-3 pb-10 sm:p-4">
      <HudTopRow p={p} />
      <div className="col-start-1 row-start-3" />
      <HudBottomRow p={p} />
      <div className="col-start-3 row-start-3" />
    </div>
  )
}

function HudTopRow({ p }: { p: HudOverlayProps }) {
  return (
    <>
      <div className="col-start-1 row-start-1" />
      <HudTopCenter p={p} />
      <div className="col-start-3 row-start-1">
      </div>
    </>
  )
}

function HudTopCenter({ p }: { p: HudOverlayProps }) {
  return (
    <div className="col-start-2 row-start-1 flex flex-col items-center gap-2 justify-self-center sm:col-start-3 sm:items-end sm:justify-self-end">
      <IslandToolbar
        effectiveTime={p.effectiveTime}
        bajsEnabled={p.bajsEnabled}
        layersOpen={p.layersOpen}
        vehiclesEnabled={p.vehiclesEnabled}
        poiEnabled={p.poiEnabled}
        hasOrigin={p.hasOrigin}
        ease={p.ease}
        mapRef={p.mapRef}
        setTime={p.setTime}
        setBajs={p.setBajs}
        setLayersOpen={p.setLayersOpen}
        setVehiclesEnabled={p.setVehiclesEnabled}
        setPoiEnabled={p.setPoiEnabled}
        setCoords={p.setCoords}
        setMobileSearchOpen={p.setMobileSearchOpen}
      />
      <div className="pointer-events-auto flex items-center gap-4 rounded-full bg-black/30 px-4 py-1.5 backdrop-blur-md sm:hidden">
        <Link href="/o-projektu" prefetch={false} className="text-[12px] font-medium text-slate-300 transition-colors hover:text-slate-200">
          O projektu
        </Link>
        <Link href="/statistika" prefetch={false} className="text-[12px] font-medium text-slate-300 transition-colors hover:text-slate-200">
          Statistika
        </Link>
        <button type="button" onClick={() => p.setOnboardingOpen(true)}
          className="text-[12px] font-medium text-slate-300 transition-[color,transform] duration-160 ease-out hover:text-slate-200 active:scale-[0.95]">
          Pomoć
        </button>
      </div>
      <ErrorOverlay error={p.error} ease={p.ease} />
    </div>
  )
}

function ErrorOverlay({ error, ease }: { error: string | null; ease: Ease }) {
  return (
    <AnimatePresence>
      {error && (
        <m.div
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
        </m.div>
      )}
    </AnimatePresence>
  )
}

function HudBottomRow({ p }: { p: HudOverlayProps }) {
  return (
    <div className="col-start-1 col-span-full row-start-3 self-end justify-self-stretch sm:col-start-2 sm:col-span-1 sm:justify-self-center">
      <BottomHintPanel hasOrigin={p.hasOrigin} everHadOrigin={p.everHadOrigin} route={p.route} loading={p.loading} routeLoading={p.routeLoading} ease={p.ease} setCoords={p.setCoords} />
      <RouteDetailsPanel
        route={p.route}
        routeLoading={p.routeLoading}
        effectiveTime={p.effectiveTime}
        linkCopied={p.linkCopied}
        mapRef={p.mapRef}
        setLinkCopied={p.setLinkCopied}
        setCoords={p.setCoords}
      />
    </div>
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
