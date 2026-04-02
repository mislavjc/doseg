"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
} from "@/lib/otp"
import { decodePolyline } from "@/lib/polyline"
import {
  parseRoutingData,
  findNearestStop,
  reconstructRoute,
  type RoutingData,
} from "@/lib/route-reconstruct"
import {
  applyBasemapBackgroundTint,
  DEFAULT_MAP_STYLE,
  getMapStyleUrl,
  type MapStyleId,
} from "@/lib/map-styles"
import { modeColor } from "@/lib/transit"
import { formatTime } from "@/lib/zagreb-time"
import {
  PANEL_SEARCH_SHELL,
  PinIcon,
  RouteDetails,
  RoutePanelContent,
  SidePanel,
  SwapIcon,
  findDestName,
} from "@/components/route-details"
import { TimePicker } from "@/components/time-picker"
import { AddressInput } from "@/components/address-input"
import { OnboardingDialog } from "@/components/onboarding-dialog"

const ZAGREB: [number, number] = [15.9819, 45.815]

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
}

/** Muted time ramp for light basemap + legend strip */
const ISOCHRONE_LINE_COLORS = [
  "#1a7a52",
  "#16949e",
  "#2d7ec4",
  "#7b68b8",
] as const

const TIME_COLOR_STOPS: maplibregl.ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["get", "time"],
  0,
  ISOCHRONE_LINE_COLORS[0],
  600,
  ISOCHRONE_LINE_COLORS[1],
  1200,
  ISOCHRONE_LINE_COLORS[2],
  1800,
  ISOCHRONE_LINE_COLORS[3],
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

/** Find the first symbol/label layer ID so data layers render below text. */
function getFirstSymbolLayerId(map: maplibregl.Map): string | undefined {
  const layers = map.getStyle().layers ?? []
  for (const l of layers) {
    if (l.type === "symbol") return l.id
  }
  return undefined
}

function tweakBasemapForIsochrone(map: maplibregl.Map, active: boolean) {
  for (const id of ["building", "building-top"]) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", active ? "none" : "visible")
    }
  }
  // Show labels earlier when isochrone is active
  const overrides: [string, number, number][] = [
    ["roadname_major", 11, 13],
    ["roadname_pri", 12, 14],
    ["roadname_sec", 13, 15],
    ["roadname_minor", 14, 16],
    ["place_suburbs", 10, 12],
    ["place_hamlet", 10, 12],
    ["place_villages", 8, 10],
  ]
  for (const [id, earlyZoom, defaultZoom] of overrides) {
    if (map.getLayer(id)) {
      map.setLayerZoomRange(id, active ? earlyZoom : defaultZoom, 24)
    }
  }
}

function addWalkAreaLayer(map: maplibregl.Map) {
  const firstLabelId = getFirstSymbolLayerId(map)
  map.addSource("walk-area", { type: "geojson", data: EMPTY_FC })
  // Fill per time band — each band gets its own color from the ramp
  map.addLayer(
    {
      id: "walk-area-fill",
      type: "fill",
      source: "walk-area",
      paint: {
        "fill-color": TIME_COLOR_STOPS,
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10,
          0.07,
          14,
          0.04,
          16,
          0,
        ],
      },
    },
    firstLabelId
  )
  // Border line per band
  map.addLayer(
    {
      id: "walk-area-border",
      type: "line",
      source: "walk-area",
      paint: {
        "line-color": TIME_COLOR_STOPS,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10,
          1.5,
          13,
          2,
          16,
          2.5,
        ],
        "line-opacity": [
          "interpolate",
          ["linear"],
          ["get", "time"],
          600,
          0.7,
          2700,
          0.4,
        ],
      },
      layout: { "line-cap": "round", "line-join": "round" },
    },
    firstLabelId
  )
}

function addIsochroneLayer(map: maplibregl.Map) {
  map.addSource("isochrone", { type: "geojson", data: EMPTY_FC })
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
        "rgba(148, 163, 184, 0.5)",
        ["==", ["get", "bikesAvailable"], 0],
        "rgba(249, 115, 22, 0.7)",
        ["<=", ["get", "bikesAvailable"], 2],
        "rgba(245, 158, 11, 0.7)",
        "rgba(245, 158, 11, 0.7)",
      ],
      "circle-stroke-width": 1,
      "circle-stroke-color": [
        "case",
        ["!", ["get", "isReturning"]],
        "rgba(239, 68, 68, 0.5)",
        ["==", ["get", "docksAvailable"], 0],
        "rgba(239, 68, 68, 0.5)",
        "rgba(255, 255, 255, 0.8)",
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
      "circle-color": "#0284c7",
      "circle-opacity": 0.85,
      "circle-stroke-width": 0.5,
      "circle-stroke-color": "rgba(0, 0, 0, 0.2)",
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
      "text-color": "#1e293b",
      "text-halo-color": "rgba(255, 255, 255, 0.8)",
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
        "interpolate",
        ["linear"],
        ["zoom"],
        10,
        5,
        13,
        8,
        16,
        11,
      ],
      "circle-color": [
        "match",
        ["get", "category"],
        "hospital",
        "#ef4444",
        "school",
        "#3b82f6",
        "park",
        "#22c55e",
        "pharmacy",
        "#f97316",
        "supermarket",
        "#eab308",
        "#94a3b8",
      ],
      "circle-opacity": 0.9,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "rgba(255, 255, 255, 0.8)",
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
        "hospital",
        "H",
        "school",
        "Š",
        "park",
        "P",
        "pharmacy",
        "Lj",
        "supermarket",
        "S",
        "?",
      ],
      "text-size": ["interpolate", ["linear"], ["zoom"], 10, 7, 13, 9, 16, 11],
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
      "text-color": "#334155",
      "text-halo-color": "rgba(255, 255, 255, 0.9)",
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
    const coords = (f.geometry as GeoJSON.Point).coordinates.slice() as [
      number,
      number,
    ]
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
  const isRenting =
    p.isRenting !== false && p.isRenting !== "false" && p.isRenting !== 0
  const isReturning =
    p.isReturning !== false && p.isReturning !== "false" && p.isReturning !== 0

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
      "line-color": "rgba(0, 0, 0, 0.25)",
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
      "circle-color": "rgba(30, 41, 59, 0.7)",
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "rgba(30, 41, 59, 0.3)",
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
      "line-color": "#1e293b",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 6, 13, 9, 16, 11],
      "line-opacity": 0.15,
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
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3, 13, 5, 16, 7],
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
      "line-color": "#1e293b",
      "line-width": 7,
      "line-opacity": 0.1,
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

function addAllMapSources(map: maplibregl.Map, mapStyleId: MapStyleId) {
  applyBasemapBackgroundTint(map, mapStyleId)
  addWalkAreaLayer(map)
  addIsochroneLayer(map)
  addBajsLayers(map)
  addVehicleLayers(map)
  addPoiSourceAndLayers(map)
  addPreviewLayers(map)
  addRouteSourceAndLayers(map)
}

function updatePreviewAndDot(map: maplibregl.Map, dest: [number, number]) {
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
    routeTailOriginRef.current = tailStop ? [tailStop.lon, tailStop.lat] : null
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
  origin: [number, number],
  destLat: number,
  destLon: number,
  preferredKey: string | null,
  requestSeq: number,
  opts: ScheduleExactRouteOpts
) {
  const controller = new AbortController()
  opts.exactRouteAbortRef.current = controller
  fetchExactRoute(
    {
      originLat: origin[1],
      originLon: origin[0],
      destLat,
      destLon,
      time: opts.effectiveTimeRef.current,
      bajs: opts.bajsEnabledRef.current,
      preferredKey,
    },
    controller.signal
  )
    .then((itinerary) => {
      if (
        controller.signal.aborted ||
        requestSeq !== opts.exactRouteSeqRef.current
      )
        return
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
  destLat: number,
  destLon: number,
  preferredKey: string | null,
  opts: ScheduleExactRouteOpts
) {
  const origin = opts.originRef.current
  if (!origin) return
  if (opts.exactRouteTimerRef.current)
    window.clearTimeout(opts.exactRouteTimerRef.current)
  if (opts.exactRouteAbortRef.current) opts.exactRouteAbortRef.current.abort()
  const requestSeq = ++opts.exactRouteSeqRef.current
  opts.setRouteLoading(true)
  opts.exactRouteTimerRef.current = window.setTimeout(
    () =>
      fireExactRoute(origin, destLat, destLon, preferredKey, requestSeq, opts),
    160
  )
}

interface HandleDestinationOpts {
  map: maplibregl.Map
  originRef: React.RefObject<[number, number] | null>
  pendingDestinationRef: React.MutableRefObject<{
    lat: number
    lng: number
  } | null>
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
      opts.map,
      rd,
      lat,
      lng,
      nearest,
      dest,
      opts.routeTailOriginRef,
      opts.setRoute,
      opts.setRouteLoading
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
    handleDestinationRef: React.MutableRefObject<
      ((lat: number, lng: number) => void) | null
    >
    routeTailOriginRef: React.MutableRefObject<[number, number] | null>
    rafRef: React.MutableRefObject<number>
    reverseLabelAbortRef: React.MutableRefObject<AbortController | null>
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
  if (refs.reverseLabelAbortRef.current) {
    refs.reverseLabelAbortRef.current.abort()
    refs.reverseLabelAbortRef.current = null
  }
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
        : (v.tripId.split("_")[0] ?? "")
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [v.lon, v.lat] },
        properties: {
          tripId: v.tripId,
          line,
          bearing: v.bearing ?? 0,
          speed: v.speed ?? 0,
        },
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
    pendingDestinationRef: React.MutableRefObject<{
      lat: number
      lng: number
    } | null>
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

/** Clear route / destination visuals while keeping origin marker and routing graph. */
function clearDestinationRouteOnMap(
  map: maplibregl.Map,
  refs: Pick<
    MapRefs,
    | "exactRouteAbortRef"
    | "exactRouteTimerRef"
    | "exactRouteSeqRef"
    | "pendingDestinationRef"
    | "swapResumeDestinationRef"
    | "lastNearestRef"
    | "routeTailOriginRef"
  >,
  setRouteLoading: (l: boolean) => void
) {
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
  refs.exactRouteSeqRef.current++
  const previewSrc = map.getSource("preview") as maplibregl.GeoJSONSource
  if (previewSrc) previewSrc.setData(EMPTY_FC)
  const dotSrc = map.getSource("dest-dot") as maplibregl.GeoJSONSource
  if (dotSrc) dotSrc.setData(EMPTY_FC)
  setRouteLoading(false)
  refs.pendingDestinationRef.current = null
  refs.swapResumeDestinationRef.current = null
  refs.lastNearestRef.current = null
  refs.routeTailOriginRef.current = null
  map.getCanvas().style.cursor = "crosshair"
}

function clearOriginFromMap(
  map: maplibregl.Map,
  refs: Pick<
    MapRefs,
    "originRef" | "routeTailOriginRef" | "latestIsochroneRef" | "swapResumeDestinationRef"
  >,
  setRoute: (r: Itinerary | null) => void
) {
  const isoSource = map.getSource("isochrone") as maplibregl.GeoJSONSource
  if (isoSource) isoSource.setData(EMPTY_FC)
  const walkAreaSrc = map.getSource("walk-area") as maplibregl.GeoJSONSource
  if (walkAreaSrc) walkAreaSrc.setData(EMPTY_FC)
  tweakBasemapForIsochrone(map, false)
  map.getCanvas().style.cursor = ""
  refs.originRef.current = null
  refs.routeTailOriginRef.current = null
  refs.latestIsochroneRef.current = null
  refs.swapResumeDestinationRef.current = null
  setRoute(null)
}

function handleIsochroneSuccess(
  map: maplibregl.Map,
  geojson: IsochroneResponse,
  statsCtaDismissedRef: React.RefObject<boolean>,
  setLoading: (l: boolean) => void,
  setShowStatsCta: (v: boolean) => void,
  latestIsochroneRef: React.MutableRefObject<GeoJSON.FeatureCollection | null>
) {
  latestIsochroneRef.current = geojson
  const isoSource = map.getSource("isochrone") as maplibregl.GeoJSONSource
  if (isoSource) isoSource.setData(geojson)
  const walkAreaSrc = map.getSource("walk-area") as maplibregl.GeoJSONSource
  if (walkAreaSrc) {
    walkAreaSrc.setData(geojson.walkArea ?? EMPTY_FC)
  }
  tweakBasemapForIsochrone(map, true)
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
  swapResumeDestinationRef: React.MutableRefObject<{
    lat: number
    lng: number
  } | null>,
  handleDestinationRef: React.RefObject<
    ((lat: number, lng: number) => void) | null
  >,
  setLoading: (l: boolean) => void,
  setShowStatsCta: (v: boolean) => void,
  setError: (e: string | null) => void,
  latestIsochroneRef: React.MutableRefObject<GeoJSON.FeatureCollection | null>
) {
  fetchIsochrone(
    { lat: originLat, lon: originLon, time: effectiveTime, bajs: bajsEnabled },
    isoController.signal
  )
    .then((geojson: IsochroneResponse) => {
      if (isoController.signal.aborted) return
      handleIsochroneSuccess(
        map,
        geojson,
        statsCtaDismissedRef,
        setLoading,
        setShowStatsCta,
        latestIsochroneRef
      )
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
      routingDataRef.current = parseRoutingData(
        response.routing,
        originLat,
        originLon
      )
      const swapResume = swapResumeDestinationRef.current
      if (swapResume) {
        swapResumeDestinationRef.current = null
        pendingDestinationRef.current = swapResume
      }
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
      swapResumeDestinationRef.current = null
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
  handleDestinationRef: React.MutableRefObject<
    ((lat: number, lng: number) => void) | null
  >
  pendingDestinationRef: React.MutableRefObject<{
    lat: number
    lng: number
  } | null>
  /** Survives resetOriginMapState; applied when routing graph loads after origin swap */
  swapResumeDestinationRef: React.MutableRefObject<{
    lat: number
    lng: number
  } | null>
  lastNearestRef: React.MutableRefObject<string | null>
  routeTailOriginRef: React.MutableRefObject<[number, number] | null>
  rafRef: React.MutableRefObject<number>
  isTouchRef: React.MutableRefObject<boolean>
  effectiveTimeRef: React.MutableRefObject<string>
  bajsEnabledRef: React.MutableRefObject<boolean>
  statsCtaDismissedRef: React.MutableRefObject<boolean>
  poiAbortRef: React.MutableRefObject<AbortController | null>
  initialLoadRef: React.MutableRefObject<boolean>
  latestIsochroneRef: React.MutableRefObject<GeoJSON.FeatureCollection | null>
  reverseLabelAbortRef: React.MutableRefObject<AbortController | null>
}

function useTransitMapRefs(s: {
  effectiveTime: string
  bajsEnabled: boolean
  hasOrigin: boolean
}): MapRefs {
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
  const swapResumeDestinationRef = useRef<{
    lat: number
    lng: number
  } | null>(null)
  const lastNearestRef = useRef<string | null>(null)
  const routeTailOriginRef = useRef<[number, number] | null>(null)
  const rafRef = useRef<number>(0)
  const isTouchRef = useRef(false)
  const effectiveTimeRef = useRef(s.effectiveTime)
  const bajsEnabledRef = useRef(s.bajsEnabled)
  const statsCtaDismissedRef = useRef(false)
  const poiAbortRef = useRef<AbortController | null>(null)
  const initialLoadRef = useRef(s.hasOrigin)
  const latestIsochroneRef = useRef<GeoJSON.FeatureCollection | null>(null)
  const reverseLabelAbortRef = useRef<AbortController | null>(null)

  return {
    containerRef,
    mapRef,
    markerRef,
    originRef,
    isoAbortRef,
    routingAbortRef,
    bajsAbortRef,
    exactRouteAbortRef,
    exactRouteTimerRef,
    exactRouteSeqRef,
    routingDataRef,
    handleDestinationRef,
    pendingDestinationRef,
    swapResumeDestinationRef,
    lastNearestRef,
    routeTailOriginRef,
    rafRef,
    isTouchRef,
    effectiveTimeRef,
    bajsEnabledRef,
    statsCtaDismissedRef,
    poiAbortRef,
    initialLoadRef,
    latestIsochroneRef,
    reverseLabelAbortRef,
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

type MapNameActions = {
  clearAll: () => void
  clearDestOnly: () => void
  setOriginName: (v: string | null) => void
  setDestName: (v: string | null) => void
}

function useMapInit(
  refs: MapRefs,
  mapStyleId: MapStyleId,
  setMapReady: (v: boolean) => void,
  setRoute: (r: Itinerary | null) => void,
  setRouteLoading: (l: boolean) => void,
  setLoading: (l: boolean) => void,
  setError: (e: string | null) => void,
  setCoords: SetCoords,
  mapNameActionsRef: React.MutableRefObject<MapNameActions>
) {
  useEffect(() => {
    if (!refs.containerRef.current) return

    const container = refs.containerRef.current
    const map = createMap(container, refs.isTouchRef, mapStyleId)

    const ro = new ResizeObserver(() => {
      map.resize()
    })
    ro.observe(container)

    map.on("load", () => {
      map.resize()
      refs.mapRef.current = map
      addAllMapSources(map, mapStyleId)
      addPoiClickHandler(map, refs.originRef)
      addBajsClickHandler(map, refs.originRef)
      bindMapInteractions(
        map,
        refs,
        setRoute,
        setRouteLoading,
        setLoading,
        setError,
        setCoords,
        mapNameActionsRef
      )
      setMapReady(true)
    })

    return () => {
      ro.disconnect()
      cleanupMapInit(map, refs, setMapReady)
    }
  }, [setCoords]) // eslint-disable-line react-hooks/exhaustive-deps
}

function useMapBasemapStyle(
  refs: MapRefs,
  mapReady: boolean,
  mapStyleId: MapStyleId,
  route: Itinerary | null
) {
  const routeRef = useRef<Itinerary | null>(route)
  routeRef.current = route
  const prevStyleRef = useRef<MapStyleId | null>(null)

  useEffect(() => {
    const map = refs.mapRef.current
    if (!map || !mapReady) return

    if (prevStyleRef.current === null) {
      prevStyleRef.current = mapStyleId
      return
    }
    if (prevStyleRef.current === mapStyleId) return
    prevStyleRef.current = mapStyleId

    map.setStyle(getMapStyleUrl(mapStyleId))
    map.once("style.load", () => {
      addAllMapSources(map, mapStyleId)
      const iso = refs.latestIsochroneRef.current as IsochroneResponse | null
      const isoSrc = map.getSource("isochrone") as maplibregl.GeoJSONSource
      if (iso && isoSrc) isoSrc.setData(iso)
      const walkAreaSrc = map.getSource("walk-area") as maplibregl.GeoJSONSource
      if (iso?.walkArea && walkAreaSrc) walkAreaSrc.setData(iso.walkArea)

      const r = routeRef.current
      if (r) renderFullRoute(map, r)
      const pending = refs.pendingDestinationRef.current
      if (pending && refs.originRef.current) {
        updatePreviewAndDot(map, [pending.lng, pending.lat])
        renderRouteTail(map, refs.routeTailOriginRef.current, [
          pending.lng,
          pending.lat,
        ])
      }
    })
  }, [mapStyleId, mapReady]) // eslint-disable-line react-hooks/exhaustive-deps -- refs stable
}

function createMap(
  container: HTMLDivElement,
  isTouchRef: React.MutableRefObject<boolean>,
  mapStyleId: MapStyleId
): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: getMapStyleUrl(mapStyleId),
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
  mapNameActionsRef: React.MutableRefObject<MapNameActions>
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

  bindMapClickEvents(
    map,
    refs,
    handleDestination,
    setRoute,
    setRouteLoading,
    setLoading,
    setError,
    setCoords,
    mapNameActionsRef
  )
}

function scheduleReverseLabel(
  refs: MapRefs,
  lat: number,
  lng: number,
  setLabel: (s: string) => void
) {
  if (refs.reverseLabelAbortRef.current) {
    refs.reverseLabelAbortRef.current.abort()
  }
  const c = new AbortController()
  refs.reverseLabelAbortRef.current = c
  fetch(`/api/reverse?lat=${lat}&lon=${lng}`, { signal: c.signal })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((d: { display_name: string }) => {
      if (!c.signal.aborted) setLabel(d.display_name)
    })
    .catch(() => {})
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
  mapNameActionsRef: React.MutableRefObject<MapNameActions>
) {
  map.on("click", (e) => {
    const a = mapNameActionsRef.current
    const lat = e.lngLat.lat
    const lng = e.lngLat.lng
    if (refs.originRef.current) {
      a.clearDestOnly()
      handleDestination(lat, lng)
      scheduleReverseLabel(refs, lat, lng, (name) => a.setDestName(name))
      return
    }
    refs.originRef.current = [lng, lat]
    setRoute(null)
    setRouteLoading(false)
    setLoading(true)
    setError(null)
    a.clearAll()
    setCoords({
      lat: Math.round(lat * 1e5) / 1e5,
      lon: Math.round(lng * 1e5) / 1e5,
    })
    scheduleReverseLabel(refs, lat, lng, (name) => a.setOriginName(name))
    map.easeTo({ center: [lng, lat], duration: 400 })
  })
}

function useBajsLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  bajsAbortRef: React.MutableRefObject<AbortController | null>,
  bajsEnabled: boolean,
  mapReady: boolean,
  mapStyle: MapStyleId
) {
  useEffect(() => {
    void mapStyle
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
  }, [bajsEnabled, mapReady, mapRef, bajsAbortRef, mapStyle])
}

function useVehiclePositions(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapReady: boolean,
  vehiclesEnabled: boolean,
  mapStyle: MapStyleId
) {
  const { data: vehicles } = useSWR<VehicleRecord[]>(
    vehiclesEnabled && mapReady ? "/api/vehicles" : null,
    { refreshInterval: 30_000 }
  )

  const vehiclePositions = useMemo(
    () => (vehicles ? buildVehicleFeatureCollection(vehicles) : EMPTY_FC),
    [vehicles]
  )

  useEffect(() => {
    void mapStyle
    const map = mapRef.current
    if (!map || !mapReady) return
    const source = map.getSource(
      "vehicle-positions"
    ) as maplibregl.GeoJSONSource
    if (source) source.setData(vehiclePositions)
  }, [vehiclePositions, mapReady, mapRef, mapStyle])
}

function usePoiLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  poiAbortRef: React.MutableRefObject<AbortController | null>,
  poiEnabled: boolean,
  mapReady: boolean,
  mapStyle: MapStyleId
) {
  useEffect(() => {
    void mapStyle
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
    fetchPoiData(source, controller)
    return () => {
      controller.abort()
    }
  }, [poiEnabled, mapReady, mapRef, poiAbortRef, mapStyle])
}

function fetchPoiData(
  source: maplibregl.GeoJSONSource,
  controller: AbortController
) {
  fetch("/api/poi?categories=hospital,school,park,pharmacy", {
    signal: controller.signal,
  })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    })
    .then(
      (
        pois: Array<{
          id: number
          name: string
          lat: number
          lon: number
          category: string
        }>
      ) => {
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
      }
    )
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
      clearOriginFromMap(map, refs, setRoute)
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
      map,
      originLat,
      originLon,
      effectiveTime,
      bajsEnabled,
      isoController,
      routingController,
      refs.statsCtaDismissedRef,
      refs.routingDataRef,
      refs.pendingDestinationRef,
      refs.swapResumeDestinationRef,
      refs.handleDestinationRef,
      setLoading,
      setShowStatsCta,
      setError,
      refs.latestIsochroneRef
    )

    return () => {
      isoController.abort()
      routingController.abort()
    }
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
  const [coords, setCoords] = useQueryStates({
    lat: parseAsFloat,
    lon: parseAsFloat,
  })
  const [time, setTime] = useQueryState("t", parseAsString)
  const [bajs, setBajs] = useQueryState("bajs", parseAsString)
  const [defaultTime] = useState(formatTime)
  const mapStyle = DEFAULT_MAP_STYLE
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
    coords,
    setCoords,
    time,
    setTime,
    bajs,
    setBajs,
    mapStyle,
    effectiveTime,
    bajsEnabled,
    route,
    setRoute,
    routeLoading,
    setRouteLoading,
    loading,
    setLoading,
    error,
    setError,
    mapReady,
    setMapReady,
    showStatsCta,
    setShowStatsCta,
    linkCopied,
    setLinkCopied,
    vehiclesEnabled,
    setVehiclesEnabled,
    poiEnabled,
    setPoiEnabled,
    layersOpen,
    setLayersOpen,
    originName,
    setOriginName,
    destName,
    setDestName,
    swapping,
    setSwapping,
    mobileSearchOpen,
    setMobileSearchOpen,
    hasOrigin,
  }
}

const ONBOARDING_KEY = "doseg-onboarded"

function useTransitMapCallbacks(s: ReturnType<typeof useTransitMapState>) {
  const {
    setCoords,
    setRoute,
    setRouteLoading,
    setError,
    setOriginName,
    setDestName,
    setLoading,
  } = s
  const onEscape = useCallback(() => {
    setCoords({ lat: null, lon: null })
    setRoute(null)
    setRouteLoading(false)
    setError(null)
    setOriginName(null)
    setDestName(null)
  }, [
    setCoords,
    setRoute,
    setRouteLoading,
    setError,
    setOriginName,
    setDestName,
  ])
  const resetFetchState = useCallback(() => {
    setLoading(true)
    setError(null)
    setRoute(null)
    setRouteLoading(false)
  }, [setLoading, setError, setRoute, setRouteLoading])
  return { onEscape, resetFetchState }
}

export function TransitMap() {
  const s = useTransitMapState()
  const refs = useTransitMapRefs(s)
  const { onEscape, resetFetchState } = useTransitMapCallbacks(s)
  const mapNameActionsRef = useRef<MapNameActions>({
    clearAll: () => {},
    clearDestOnly: () => {},
    setOriginName: () => {},
    setDestName: () => {},
  })
  mapNameActionsRef.current = {
    clearAll: () => {
      s.setOriginName(null)
      s.setDestName(null)
    },
    clearDestOnly: () => {
      s.setDestName(null)
    },
    setOriginName: s.setOriginName,
    setDestName: s.setDestName,
  }
  const [onboardingOpen, setOnboardingOpen] = useState(() => {
    if (typeof window === "undefined") return false
    return !localStorage.getItem(ONBOARDING_KEY)
  })

  const [everHadOrigin, setEverHadOrigin] = useState(s.hasOrigin)
  useEffect(() => {
    if (s.hasOrigin) setEverHadOrigin(true)
  }, [s.hasOrigin])
  useEffect(() => {
    refs.effectiveTimeRef.current = s.effectiveTime
  }, [s.effectiveTime]) // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/immutability
  useEffect(() => {
    refs.bajsEnabledRef.current = s.bajsEnabled
  }, [s.bajsEnabled]) // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/immutability

  useEscapeKey(refs.originRef, onEscape)
  useMapInit(
    refs,
    s.mapStyle,
    s.setMapReady,
    s.setRoute,
    s.setRouteLoading,
    s.setLoading,
    s.setError,
    s.setCoords,
    mapNameActionsRef
  )
  useMapBasemapStyle(refs, s.mapReady, s.mapStyle, s.route)
  useBajsLayer(
    refs.mapRef,
    refs.bajsAbortRef,
    s.bajsEnabled,
    s.mapReady,
    s.mapStyle
  )
  useVehiclePositions(refs.mapRef, s.mapReady, s.vehiclesEnabled, s.mapStyle)
  usePoiLayer(
    refs.mapRef,
    refs.poiAbortRef,
    s.poiEnabled,
    s.mapReady,
    s.mapStyle
  )
  useOriginIsochrone(
    refs,
    s.coords.lat,
    s.coords.lon,
    s.mapReady,
    s.effectiveTime,
    s.bajsEnabled,
    resetFetchState,
    s.setRoute,
    s.setRouteLoading,
    s.setLoading,
    s.setError,
    s.setShowStatsCta
  )

  // Dim walk area when a route is displayed
  useEffect(() => {
    const map = refs.mapRef.current
    if (!map || !s.mapReady) return
    const hasRoute = s.route !== null
    if (map.getLayer("walk-area-fill")) {
      map.setLayoutProperty(
        "walk-area-fill",
        "visibility",
        hasRoute ? "none" : "visible"
      )
    }
    if (map.getLayer("walk-area-border")) {
      map.setPaintProperty(
        "walk-area-border",
        "line-opacity",
        hasRoute
          ? 0.15
          : ["interpolate", ["linear"], ["get", "time"], 600, 0.7, 2700, 0.4]
      )
    }
  }, [s.route, s.mapReady]) // eslint-disable-line react-hooks/exhaustive-deps

  const clearDestinationOnly = useCallback(() => {
    const map = refs.mapRef.current
    if (map) clearDestinationRouteOnMap(map, refs, s.setRouteLoading)
    s.setRoute(null)
    s.setRouteLoading(false)
    s.setDestName(null)
    s.setError(null)
    s.setSwapping(false)
  }, [
    s.setRoute,
    s.setRouteLoading,
    s.setDestName,
    s.setError,
    s.setSwapping,
  ]) // eslint-disable-line react-hooks/exhaustive-deps -- refs from useTransitMapRefs

  // Polazište: use reverse-geocoded street when we have coords but no label yet (shared URL, HUD locate, etc.).
  // Map click already calls scheduleReverseLabel; this covers the rest without duplicating requests when name is set.
  useEffect(() => {
    const lat = s.coords.lat
    const lon = s.coords.lon
    if (lat == null || lon == null) return
    if (s.originName != null) return
    scheduleReverseLabel(refs, lat, lon, (name) => {
      s.setOriginName(name)
    })
  }, [s.coords.lat, s.coords.lon, s.originName]) // eslint-disable-line react-hooks/exhaustive-deps -- refs stable

  const originDisplayName =
    s.originName ?? s.route?.legs[0]?.from?.name ?? null
  const destDisplayName =
    s.destName ?? (s.route ? findDestName(s.route) : null)

  return (
    <TransitMapView
      containerRef={refs.containerRef}
      loading={s.loading}
      bajsEnabled={s.bajsEnabled}
      poiEnabled={s.poiEnabled}
      layersOpen={s.layersOpen}
      vehiclesEnabled={s.vehiclesEnabled}
      effectiveTime={s.effectiveTime}
      hasOrigin={s.hasOrigin}
      everHadOrigin={everHadOrigin}
      error={s.error}
      showStatsCta={s.showStatsCta}
      route={s.route}
      routeLoading={s.routeLoading}
      linkCopied={s.linkCopied}
      mapRef={refs.mapRef}
      statsCtaDismissedRef={refs.statsCtaDismissedRef}
      onboardingOpen={onboardingOpen}
      setOnboardingOpen={setOnboardingOpen}
      setTime={s.setTime}
      setBajs={s.setBajs}
      setLayersOpen={s.setLayersOpen}
      setVehiclesEnabled={s.setVehiclesEnabled}
      setPoiEnabled={s.setPoiEnabled}
      setCoords={s.setCoords}
      setShowStatsCta={s.setShowStatsCta}
      setLinkCopied={s.setLinkCopied}
      handleDestinationRef={refs.handleDestinationRef}
      pendingDestinationRef={refs.pendingDestinationRef}
      setSwapResumeDestination={(v) => { refs.swapResumeDestinationRef.current = v }}
      originName={originDisplayName}
      setOriginName={s.setOriginName}
      destName={destDisplayName}
      setDestName={s.setDestName}
      swapping={s.swapping}
      setSwapping={s.setSwapping}
      mobileSearchOpen={s.mobileSearchOpen}
      setMobileSearchOpen={s.setMobileSearchOpen}
      onClearDestination={clearDestinationOnly}
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
  handleDestinationRef: React.RefObject<
    ((lat: number, lng: number) => void) | null
  >
  pendingDestinationRef: React.MutableRefObject<{
    lat: number
    lng: number
  } | null>
  setSwapResumeDestination: (v: { lat: number; lng: number } | null) => void
  originName: string | null
  setOriginName: (v: string | null) => void
  destName: string | null
  setDestName: (v: string | null) => void
  swapping: boolean
  setSwapping: (v: boolean) => void
  mobileSearchOpen: boolean
  setMobileSearchOpen: (v: boolean) => void
  /** Clear route / destination; keep origin (like “promijeni polazište” for the other end). */
  onClearDestination: () => void
}

function PersistentSidePanel({
  p,
  mapRef,
}: {
  p: Omit<
    TransitMapViewProps,
    "containerRef" | "mapRef" | "statsCtaDismissedRef"
  > & { ease: Ease }
  mapRef: React.RefObject<maplibregl.Map | null>
}) {
  // Keep old route visible during swap until new one arrives
  const [staleRoute, setStaleRoute] = useState<Itinerary | null>(null)
  useEffect(() => {
    if (p.route && p.swapping) p.setSwapping(false)
  }, [p.route, p.swapping, p.setSwapping])

  const displayItinerary = p.route ?? (p.swapping ? staleRoute : null)
  const showRoute =
    displayItinerary || p.routeLoading || (p.loading && p.destName !== null)
  const isSwapLoading = p.swapping && !p.route

  return (
    <SidePanel>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {showRoute ? (
          <RoutePanelContent
            itinerary={displayItinerary}
            loading={p.routeLoading || isSwapLoading}
            departureTime={p.effectiveTime}
            originName={p.originName ?? undefined}
            destName={p.destName ?? undefined}
            onSwap={() => {
              const route = p.route ?? staleRoute
              if (!route) return
              setStaleRoute(route)
              const destLeg = route.legs[route.legs.length - 1]
              const newOrigin = { lat: destLeg.to.lat, lon: destLeg.to.lon }
              const oldOrigin = {
                lat: route.legs[0].from.lat,
                lon: route.legs[0].from.lon,
              }
              const oldDestLabel = p.destName ?? findDestName(route)
              const oldOriginLabel =
                p.originName ?? route.legs[0]?.from?.name ?? null
              p.setOriginName(oldDestLabel)
              p.setDestName(oldOriginLabel)
              p.setSwapping(true)
              p.setSwapResumeDestination({
                lat: oldOrigin.lat,
                lng: oldOrigin.lon,
              })
              p.setCoords(newOrigin)
              mapRef.current?.easeTo({
                center: [newOrigin.lon, newOrigin.lat],
                duration: 400,
              })
            }}
            onShare={() => {
              navigator.clipboard.writeText(window.location.href).then(() => {
                p.setLinkCopied(true)
                setTimeout(() => p.setLinkCopied(false), 2000)
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
            onReset={() => {
              p.setCoords({ lat: null, lon: null })
              p.setOriginName(null)
              p.setDestName(null)
            }}
            onClearDestination={p.onClearDestination}
            shareConfirm={p.linkCopied}
          />
        ) : (
          <SidePanelIdleContent p={p} mapRef={mapRef} />
        )}
      </div>
    </SidePanel>
  )
}

function IdleInputs({ hasOrigin, originName, onSelectOrigin, onSelectDestination, onCurrentLocation }: { hasOrigin: boolean; originName?: string; onSelectOrigin: (lat: number, lon: number, name: string) => void; onSelectDestination: (lat: number, lon: number, name: string) => void; onCurrentLocation: () => void }) {
  return (
    <div className={PANEL_SEARCH_SHELL}>
      <div className="flex min-w-0 flex-1 gap-3">
        <div className="mt-4 ml-1 flex shrink-0 flex-col items-center">
          <div className="h-3.5 w-3.5 shrink-0 rounded-full border-[2.5px] border-slate-300" />
          <div className="my-1.5 flex shrink-0 flex-col gap-[3px]">
            <div className="h-[3px] w-[3px] rounded-full bg-slate-400" />
            <div className="h-[3px] w-[3px] rounded-full bg-slate-400" />
            <div className="h-[3px] w-[3px] rounded-full bg-slate-400" />
          </div>
          <PinIcon />
        </div>
        <div className="relative flex min-w-0 flex-1 flex-col rounded-2xl bg-slate-100 p-1">
          <AddressInput
            className="h-10 rounded-[12px] bg-transparent hover:bg-slate-200/60 focus:bg-white focus:shadow-sm focus:ring-0"
            placeholder="Pretraži adresu ili klikni kartu"
            value={originName || (hasOrigin ? "Polazište" : "")}
            onSelect={onSelectOrigin}
            onCurrentLocation={onCurrentLocation}
          />
          <div className="mx-3 h-[1px] bg-slate-200" />
          <AddressInput
            className="h-10 rounded-[12px] bg-transparent hover:bg-slate-200/60 focus:bg-white focus:shadow-sm focus:ring-0"
            placeholder="Odaberi odredište"
            value=""
            onSelect={onSelectDestination}
            readOnly={!hasOrigin}
          />
          <div className="absolute right-1.5 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-slate-100 bg-white text-slate-400 shadow-sm" aria-hidden>
            <div className="scale-90"><SwapIcon /></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function useIdleGeo(
  mapRef: React.RefObject<maplibregl.Map | null>,
  setCoords: SetCoords,
  setOriginName: (v: string | null) => void
) {
  const locatingRef = useRef(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  useEffect(() => {
    if (geoError) {
      const t = setTimeout(() => setGeoError(null), 3000)
      return () => clearTimeout(t)
    }
  }, [geoError])
  const locate = useCallback(() => {
    requestGeolocation(
      mapRef,
      (v) => {
        setCoords(v)
        setOriginName("Moja lokacija")
      },
      (v) => {
        locatingRef.current = v
      },
      setGeoError
    )
  }, [mapRef, setCoords, setOriginName])
  return { geoError, locate }
}

function OriginIllustration() {
  return (
    <div className="relative mb-1 h-32 w-32 text-slate-500/80">
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <path
          d="M15 25 L35 15 L70 25 L90 15 L90 75 L70 85 L35 75 L15 85 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeOpacity="0.2"
          strokeLinejoin="round"
        />
        <path
          d="M35 15 L35 75"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeOpacity="0.2"
          strokeLinejoin="round"
        />
        <path
          d="M70 25 L70 85"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeOpacity="0.2"
          strokeLinejoin="round"
        />
        <m.path
          d="M50 25 C65 25 75 40 75 55 C75 70 60 80 45 75 C30 70 25 55 30 40 C35 25 40 25 50 25 Z"
          fill="currentColor"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1.1, opacity: [0, 0.15, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut" }}
          style={{ transformOrigin: "50px 50px" }}
        />
        <m.path
          d="M50 35 C60 35 65 45 65 55 C65 65 55 70 45 65 C35 60 35 50 40 40 C45 30 45 35 50 35 Z"
          fill="currentColor"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1.2, opacity: [0, 0.25, 0] }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            ease: "easeOut",
            delay: 0.8,
          }}
          style={{ transformOrigin: "50px 50px" }}
        />
        <m.g
          initial={{ y: -5, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <path
            d="M50 35 C43 35 38 40 38 48 C38 57 50 70 50 70 C50 70 62 57 62 48 C62 40 57 35 50 35 Z"
            fill="currentColor"
            opacity="0.9"
          />
          <circle cx="50" cy="46" r="3.5" fill="#ffffff" />
        </m.g>
      </svg>
    </div>
  )
}

function DestinationIllustration() {
  return (
    <div className="relative mb-1 h-32 w-32 text-slate-500/80">
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <path
          d="M15 25 L35 15 L70 25 L90 15 L90 75 L70 85 L35 75 L15 85 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeOpacity="0.15"
          strokeLinejoin="round"
        />
        <path
          d="M30 35 C40 35 45 45 45 55 C45 65 35 70 25 65 C15 60 15 50 20 40 C25 30 25 35 30 35 Z"
          fill="currentColor"
          fillOpacity="0.1"
        />
        <path
          d="M28 40 C24 40 21 44 21 48 C21 54 28 62 28 62 C28 62 35 54 35 48 C35 44 32 40 28 40 Z"
          fill="currentColor"
          opacity="0.6"
        />
        <circle cx="28" cy="46" r="2.5" fill="#ffffff" />
        <m.g
          initial={{ y: 0 }}
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <path
            d="M72 32 C65 32 59 38 59 46 C59 55 72 70 72 70 C72 70 85 55 85 46 C85 38 79 32 72 32 Z"
            fill="currentColor"
            opacity="0.9"
          />
          <circle cx="72" cy="42" r="3.5" fill="#ffffff" />
        </m.g>
        <m.path
          d="M32 58 Q50 75 66 62"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeDasharray="6 4"
          opacity="0.6"
          animate={{ strokeDashoffset: [10, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, ease: "linear" }}
        />
      </svg>
    </div>
  )
}

function EmptyStateIllustration({ type }: { type: "origin" | "destination" }) {
  return type === "origin" ? (
    <OriginIllustration />
  ) : (
    <DestinationIllustration />
  )
}

function SidePanelIdleContent({
  p,
  mapRef,
}: {
  p: Omit<
    TransitMapViewProps,
    "containerRef" | "mapRef" | "statsCtaDismissedRef"
  > & { ease: Ease }
  mapRef: React.RefObject<maplibregl.Map | null>
}) {
  const { geoError, locate } = useIdleGeo(mapRef, p.setCoords, p.setOriginName)
  return (
    <div className="flex flex-1 flex-col">
      {geoError && (
        <div className="px-5 py-2 text-[12px] text-red-400">{geoError}</div>
      )}
      <IdleInputs
        hasOrigin={p.hasOrigin}
        originName={p.originName ?? undefined}
        onSelectOrigin={(lat, lon, name) => {
          p.setOriginName(name)
          p.setCoords({ lat, lon })
          mapRef.current?.easeTo({ center: [lon, lat], duration: 400 })
        }}
        onSelectDestination={(lat, lon, name) => {
          p.setDestName(name)
          p.handleDestinationRef.current?.(lat, lon)
        }}
        onCurrentLocation={locate}
      />
      <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-4 px-5 text-center sm:px-6">
        <EmptyStateIllustration
          type={!p.hasOrigin ? "origin" : "destination"}
        />
        {!p.hasOrigin ? (
          <p className="max-w-[200px] text-[14px] leading-relaxed text-slate-400">
            Klikni bilo gdje na karti da vidiš dokle možeš stići.
          </p>
        ) : (
          <>
            <p className="text-[14px] text-slate-400">
              Klikni odredište na karti za rutu
            </p>
            <button
              type="button"
              onClick={() => p.setCoords({ lat: null, lon: null })}
              className="mt-1 rounded-2xl bg-slate-100 px-5 py-2.5 text-[13px] font-medium text-slate-900 transition-all duration-300 ease-out hover:bg-[#1264ab]/15 hover:text-[#1264ab] active:scale-[0.97]"
            >
              Promijeni polazište
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function MobileSearchOverlay({
  p,
  mapRef,
}: {
  p: Omit<
    TransitMapViewProps,
    "containerRef" | "mapRef" | "statsCtaDismissedRef"
  > & { ease: Ease }
  mapRef: React.RefObject<maplibregl.Map | null>
}) {
  const { geoError, locate } = useIdleGeo(mapRef, p.setCoords, p.setOriginName)
  const destRef = useRef<HTMLDivElement>(null)
  return (
    <AnimatePresence>
      {p.mobileSearchOpen && (
        <m.div
          key="mobile-search"
          className="fixed inset-0 z-50 flex flex-col bg-white/80 backdrop-blur-md"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ duration: 0.3, ease: p.ease }}
        >
          <div className="flex shrink-0 items-center gap-2 px-3 py-3">
            <button
              type="button"
              onClick={() => p.setMobileSearchOpen(false)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              aria-label="Zatvori"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19.5 12H4.5M10.5 18L4.5 12l6-6" />
              </svg>
            </button>
            <span className="text-[16px] font-medium text-slate-900">
              Pretraži
            </span>
          </div>
          {geoError && (
            <div className="px-5 py-1 text-[12px] text-red-400">{geoError}</div>
          )}
          <MobileSearchFields
            p={p}
            mapRef={mapRef}
            locate={locate}
            destRef={destRef}
          />
        </m.div>
      )}
    </AnimatePresence>
  )
}

function MobileSearchFields({
  p,
  mapRef,
  locate,
  destRef,
}: {
  p: Omit<
    TransitMapViewProps,
    "containerRef" | "mapRef" | "statsCtaDismissedRef"
  > & { ease: Ease }
  mapRef: React.RefObject<maplibregl.Map | null>
  locate: () => void
  destRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <div className="flex gap-3 px-3">
      <div className="mt-3 ml-1 flex shrink-0 flex-col items-center">
        <div className="h-3.5 w-3.5 shrink-0 rounded-full border-[2.5px] border-slate-300" />
        <div className="my-1 flex shrink-0 flex-col gap-[3px]">
          <div className="h-[3px] w-[3px] rounded-full bg-slate-500" />
          <div className="h-[3px] w-[3px] rounded-full bg-slate-500" />
          <div className="h-[3px] w-[3px] rounded-full bg-slate-500" />
        </div>
        <div className="flex h-5 w-5 items-center justify-center text-[#ea4335]/50">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
          </svg>
        </div>
      </div>
      <div className="mt-0.5 flex min-w-0 flex-1 flex-col gap-2">
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

function TransitMapView({
  containerRef,
  mapRef,
  statsCtaDismissedRef,
  ...rest
}: TransitMapViewProps) {
  const ease = [0.23, 1, 0.32, 1] as const
  return (
    <MotionConfig reducedMotion="user">
      {/* pointer-events-auto: vaul's Radix Dialog sets pointer-events:none on <body> when drawer opens */}
      <div className="pointer-events-auto flex h-svh w-full">
        <PersistentSidePanel p={{ ...rest, ease }} mapRef={mapRef} />
        <div className="relative flex-1">
          <div
            ref={containerRef}
            className="h-full w-full"
            role="application"
            aria-label="Interaktivna karta dosega javnog prijevoza u Zagrebu"
          />
          <LoadingBar loading={rest.loading} ease={ease} />
          <LayerLegend
            bajsEnabled={rest.bajsEnabled}
            poiEnabled={rest.poiEnabled}
            ease={ease}
          />
          <HudOverlay
            {...rest}
            mapRef={mapRef}
            statsCtaDismissedRef={statsCtaDismissedRef}
            ease={ease}
          />
          <div
            id="route-announcer"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
          />
          <OnboardingDialog
            open={rest.onboardingOpen}
            onClose={() => {
              localStorage.setItem(ONBOARDING_KEY, "1")
              rest.setOnboardingOpen(false)
            }}
          />
        </div>
        <MobileSearchOverlay p={{ ...rest, ease }} mapRef={mapRef} />
      </div>
    </MotionConfig>
  )
}

function LoadingBar({
  loading,
  ease,
}: {
  loading: boolean
  ease: readonly [number, number, number, number]
}) {
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
      <div className="text-[9px] font-semibold tracking-wider text-neutral-500 uppercase">
        BAJS
      </div>
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 shrink-0 rounded-full border border-neutral-300/90 bg-amber-500/80" />
          <span className="text-[9px] font-medium text-neutral-600">
            Dostupno
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 shrink-0 rounded-full border border-neutral-300/90 bg-orange-500/80" />
          <span className="text-[9px] font-medium text-neutral-600">0 bic.</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 shrink-0 rounded-full border border-red-500/80 bg-amber-500/80" />
          <span className="text-[9px] font-medium text-neutral-600">Puna</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 shrink-0 rounded-full border border-red-500/80 bg-slate-400/80" />
          <span className="text-[9px] font-medium text-neutral-600">Ne radi</span>
        </div>
      </div>
    </div>
  )
}

function PoiLegend() {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[9px] font-semibold tracking-wider text-neutral-500 uppercase">
        Ustanove
      </div>
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1">
          <div className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-red-500 text-[7px] font-bold text-slate-900">
            H
          </div>
          <span className="text-[9px] font-medium text-neutral-600">Bolnica</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[7px] font-bold text-slate-900">
            Š
          </div>
          <span className="text-[9px] font-medium text-neutral-600">Škola</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-green-500 text-[7px] font-bold text-slate-900">
            P
          </div>
          <span className="text-[9px] font-medium text-neutral-600">Park</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-orange-500 text-[6px] font-bold text-slate-900">
            Lj
          </div>
          <span className="text-[9px] font-medium text-neutral-600">
            Ljekarna
          </span>
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
          {bajsEnabled && poiEnabled && <div className="h-px bg-neutral-200/90" />}
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
  setOnboardingOpen: (v: boolean) => void
}

function IslandToolbar(props: IslandToolbarProps) {
  return (
    <m.div
      className={`island pointer-events-auto flex min-w-0 max-w-[min(100%,520px)] flex-col gap-1.5 sm:gap-2 ${
        props.layersOpen ? "island-expanded" : "island-compact"
      }`}
      initial={{ opacity: 0, scale: 0.96 }}
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
        setOnboardingOpen={props.setOnboardingOpen}
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
    <div className="scrollbar-hide flex min-w-0 w-full max-w-full flex-nowrap items-center justify-between gap-1 overflow-x-auto overflow-y-hidden sm:justify-center sm:gap-1.5 md:gap-2 lg:gap-4">
      {/* Left group */}
      <div className="flex shrink-0 items-center gap-[4px] sm:gap-1.5 md:gap-2 lg:gap-4">
        <TimePicker
          value={p.effectiveTime}
          onChange={(v) => p.setTime(v)}
          triggerClassName="max-sm:h-8 max-sm:min-h-0 max-sm:px-2.5 max-sm:text-[11px]"
        />
        <div className="h-6 w-px shrink-0 bg-neutral-200/90 sm:h-7" />
        <BajsToggleButton bajsEnabled={p.bajsEnabled} setBajs={p.setBajs} />
        <LayersButton
          layersOpen={p.layersOpen}
          vehiclesEnabled={p.vehiclesEnabled}
          poiEnabled={p.poiEnabled}
          setLayersOpen={p.setLayersOpen}
        />
      </div>

      {/* Right group */}
      <div className="flex shrink-0 items-center gap-[4px] sm:gap-1.5 md:gap-2 lg:gap-4">
        <Link
          href="/statistika"
          prefetch={false}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 transition-[background-color,color,transform] duration-160 ease-out hover:bg-neutral-200/90 hover:text-neutral-900 active:scale-[0.97] sm:hidden"
          aria-label="Statistika"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
        </Link>
        <LocateMeButton mapRef={p.mapRef} setCoords={p.setCoords} />
        <button
          type="button"
          onClick={() => p.setMobileSearchOpen(true)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 transition-[background-color,color,transform] duration-160 ease-out hover:bg-neutral-200/90 hover:text-neutral-900 active:scale-[0.97] sm:hidden"
          aria-label="Pretraži adresu"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function BajsToggleButton({
  bajsEnabled,
  setBajs,
}: {
  bajsEnabled: boolean
  setBajs: (v: string | null) => void
}) {
  return (
    <button
      type="button"
      onClick={() => setBajs(bajsEnabled ? null : "1")}
      aria-pressed={bajsEnabled}
      className={`group flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-medium transition-all duration-300 focus-visible:ring-2 focus-visible:ring-neutral-300 focus-visible:outline-none lg:h-9 lg:w-auto lg:gap-2 lg:px-4 lg:text-[12px] active:scale-[0.96] ${
        bajsEnabled
          ? "bg-[#1264ab]/15 text-[#1264ab]"
          : "bg-neutral-100 text-neutral-600 hover:bg-[#1264ab]/15 hover:text-[#1264ab]"
      }`}
      title="Dodaj BAJS bicikl u izračun rute"
      aria-label="Dodaj BAJS bicikl u izračun rute"
    >
      <svg
        aria-hidden="true"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`shrink-0 transition-transform duration-300 ease-out lg:h-3 lg:w-3 lg:stroke-2 ${
          bajsEnabled ? "scale-110" : "group-hover:scale-110 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        }`}
      >
        <circle cx="5.5" cy="17.5" r="3.5" />
        <circle cx="18.5" cy="17.5" r="3.5" />
        <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h2" />
      </svg>
      <span className="hidden lg:inline">+ BAJS</span>
    </button>
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
      className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-neutral-300 focus-visible:outline-none lg:h-9 lg:w-auto lg:gap-1.5 lg:px-4 ${
        layersOpen || vehiclesEnabled || poiEnabled
          ? "bg-neutral-200/95 text-neutral-900"
          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200/90 hover:text-neutral-900"
      }`}
      aria-label="Slojevi karte"
    >
      <svg
        aria-hidden="true"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="lg:h-3 lg:w-3 lg:stroke-2"
      >
        <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.84Z" />
        <path d="M2 12l8.58 3.91a2 2 0 0 0 1.66 0L21 12" />
        <path d="M2 17l8.58 3.91a2 2 0 0 0 1.66 0L21 17" />
      </svg>
      <span className="hidden lg:inline">Slojevi</span>
      {!layersOpen && (vehiclesEnabled || poiEnabled) && (
        <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-neutral-300/90 text-[8px] font-semibold text-neutral-800 lg:static lg:h-3.5 lg:w-3.5 lg:bg-neutral-300/90">
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
          exit={{
            opacity: 0,
            y: -4,
            transition: { duration: 0.15, ease: [0.23, 1, 0.32, 1] },
          }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          className="absolute top-full left-1/2 z-20 mt-2 -translate-x-1/2 rounded-2xl border border-neutral-100/90 bg-white/95 px-4 py-2 text-[11px] font-medium whitespace-nowrap text-neutral-800 shadow-[0_8px_30px_rgba(15,23,42,0.08)] backdrop-blur-md"
        >
          {message}
        </m.div>
      )}
    </AnimatePresence>
  )
}

function LocateMeButton({
  mapRef,
  setCoords,
}: {
  mapRef: React.RefObject<maplibregl.Map | null>
  setCoords: SetCoords
}) {
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
        onClick={() =>
          requestGeolocation(mapRef, setCoords, setLocating, setGeoError)
        }
        disabled={locating}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-[background-color,color,transform] duration-160 ease-out focus-visible:ring-2 focus-visible:ring-neutral-300 focus-visible:outline-none active:scale-[0.97] lg:h-9 lg:w-auto lg:gap-1.5 lg:px-4 lg:text-[12px] lg:font-medium ${
          locating
            ? "bg-neutral-200/95 text-neutral-900"
            : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200/90 hover:text-neutral-900"
        }`}
        title="Pronađi moju lokaciju"
        aria-label="Pronađi moju lokaciju"
      >
        <svg
          aria-hidden="true"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`lg:h-4 lg:w-4 lg:stroke-[1.5] ${locating ? "animate-pulse" : ""}`}
        >
          <path d="M10.88 17.182L9.2 13.8a1 1 0 0 0-.546-.546L5.27 11.57a.5.5 0 0 1 .054-.925L18.42 5.56a.5.5 0 0 1 .62.62L13.965 19.3a.5.5 0 0 1-.926.055L11.353 17.67a1 1 0 0 0-.473-.488z" />
        </svg>
        <span className="hidden lg:inline">Lokacija</span>
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
  setOnboardingOpen: (v: boolean) => void
}

function MobileIslandMenu({ setOnboardingOpen }: { setOnboardingOpen: (v: boolean) => void }) {
  return (
    <div className="mt-2 flex w-full flex-wrap justify-center gap-2 border-t border-neutral-100/90 pt-3 sm:hidden">
      <Link
        href="/o-projektu"
        prefetch={false}
        className="rounded-full px-3 py-1.5 text-[12px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
      >
        O projektu
      </Link>
      <button
        type="button"
        onClick={() => setOnboardingOpen(true)}
        className="rounded-full px-3 py-1.5 text-[12px] font-medium text-neutral-600 transition-[color,transform,background-color] duration-160 ease-out hover:bg-neutral-100 hover:text-neutral-900 active:scale-[0.95]"
      >
        Pomoć
      </button>
    </div>
  )
}

function ColorScale() {
  const [a, b, c, d] = ISOCHRONE_LINE_COLORS
  return (
    <div className="flex w-full max-w-[200px] flex-col justify-center">
      <div
        className="h-1.5 w-full rounded-full"
        style={{
          background: `linear-gradient(to right, ${a}, ${b}, ${c}, ${d})`,
        }}
      />
      <div className="mt-1.5 flex w-full justify-between text-[9px] leading-none font-medium text-neutral-400 tabular-nums">
        <span>0</span>
        <span>10</span>
        <span>20</span>
        <span>30 min</span>
      </div>
    </div>
  )
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
          <div className="mt-1 flex flex-col items-center gap-3 border-t border-neutral-100/90 px-1 pt-4 pb-1">
            <div className="flex w-full flex-col items-center gap-2">
              <span className="text-[9px] font-medium tracking-[0.12em] text-neutral-400 uppercase">
                Doseg
              </span>
              <ColorScale />
            </div>

            <div className="mt-2 h-px w-8 bg-neutral-100/80" />

            <div className="flex w-full flex-col items-center gap-2.5">
              <span className="text-[9px] font-medium tracking-[0.12em] text-neutral-400 uppercase">
                Na karti
              </span>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <VehiclesToggle
                  enabled={p.vehiclesEnabled}
                  onToggle={p.setVehiclesEnabled}
                />
                <PoiToggle enabled={p.poiEnabled} onToggle={p.setPoiEnabled} />
              </div>
            </div>
            <MobileIslandMenu setOnboardingOpen={p.setOnboardingOpen} />
          </div>
        </m.div>
      )}
    </AnimatePresence>
  )
}

function VehiclesToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean
  onToggle: React.Dispatch<React.SetStateAction<boolean>>
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle((v) => !v)}
      title="Prikaži gdje se tramvaji i busevi trenutno nalaze"
      className={`flex h-9 items-center gap-2 rounded-full px-4 text-[12px] font-medium transition-colors ${
        enabled
          ? "bg-neutral-200/95 text-neutral-900"
          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200/90 hover:text-neutral-900"
      }`}
    >
      <svg
        aria-hidden="true"
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v4m0 12v4m10-10h-4M6 12H2" />
      </svg>
      Tramvaji i busevi uživo
    </button>
  )
}

function PoiToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean
  onToggle: React.Dispatch<React.SetStateAction<boolean>>
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle((v) => !v)}
      className={`flex h-9 items-center gap-2 rounded-full px-4 text-[12px] font-medium transition-colors ${
        enabled
          ? "bg-neutral-200/95 text-neutral-900"
          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200/90 hover:text-neutral-900"
      }`}
    >
      <svg
        aria-hidden="true"
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
      Ustanove
    </button>
  )
}

function HintBubble({
  k,
  ease,
  children,
}: {
  k: string
  ease: Ease
  children: React.ReactNode
}) {
  return (
    <m.div
      key={k}
      className="panel pointer-events-auto border border-neutral-100/60 shadow-[0_8px_40px_rgba(15,23,42,0.06)]"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
      transition={{ duration: 0.2, ease }}
    >
      {children}
    </m.div>
  )
}

function BottomHintPanel({
  hasOrigin,
  everHadOrigin,
  route,
  loading,
  routeLoading,
  ease,
  setCoords,
  onClearDestination,
}: {
  hasOrigin: boolean
  everHadOrigin: boolean
  route: Itinerary | null
  loading: boolean
  routeLoading: boolean
  ease: Ease
  setCoords: SetCoords
  onClearDestination: () => void
}) {
  return (
    <div className="sm:hidden">
      <AnimatePresence mode="wait">
      {!hasOrigin && !everHadOrigin && (
        <HintBubble k="origin" ease={ease}>
          <div className="text-center text-[13px] font-medium text-neutral-700">
            Klikni bilo gdje da vidiš dokle možeš stići tramvajem i busom
          </div>
        </HintBubble>
      )}
      {hasOrigin && !route && !loading && !routeLoading && (
        <HintBubble k="dest" ease={ease}>
          <div className="flex items-center justify-center gap-2 py-1 pr-1 pl-4">
            <span className="text-[13px] font-medium text-neutral-700">
              Klikni odredište
            </span>
            <button
              type="button"
              onClick={() => setCoords({ lat: null, lon: null })}
              className="group relative flex items-center gap-2 rounded-full pr-3 pl-1.5 py-1.5 text-[12px] font-medium text-neutral-500 transition-all duration-300 ease-out hover:bg-[#1264ab]/15 hover:text-[#1264ab] active:scale-[0.96]"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100 text-neutral-400 transition-all duration-300 group-hover:bg-[#1264ab] group-hover:text-white">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-500 ease-out group-hover:rotate-180 group-hover:scale-110">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                </svg>
              </div>
              Promijeni polazište
            </button>
          </div>
        </HintBubble>
      )}
      {hasOrigin && (route !== null || routeLoading) && (
        <HintBubble k="dest-clear" ease={ease}>
          <div className="flex items-center justify-center gap-2 py-1 pr-1 pl-4">
            <span className="text-[13px] font-medium text-neutral-700">
              Drugo odredište?
            </span>
            <button
              type="button"
              onClick={onClearDestination}
              className="group relative flex items-center gap-2 rounded-full pr-3 pl-1.5 py-1.5 text-[12px] font-medium text-neutral-500 transition-all duration-300 ease-out hover:bg-[#1264ab]/15 hover:text-[#1264ab] active:scale-[0.96]"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100 text-neutral-400 transition-all duration-300 group-hover:bg-[#1264ab] group-hover:text-white">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-500 ease-out group-hover:rotate-180 group-hover:scale-110">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                </svg>
              </div>
              Promijeni odredište
            </button>
          </div>
        </HintBubble>
      )}
      </AnimatePresence>
    </div>
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
  onClearDestination,
}: {
  route: Itinerary | null
  routeLoading: boolean
  effectiveTime: string
  linkCopied: boolean
  mapRef: React.RefObject<maplibregl.Map | null>
  setLinkCopied: (v: boolean) => void
  setCoords: SetCoords
  onClearDestination: () => void
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
      onClearDestination={onClearDestination}
      shareConfirm={linkCopied}
    />
  )
}

type HudOverlayProps = Omit<TransitMapViewProps, "containerRef"> & {
  ease: Ease
}

function HudOverlay(p: HudOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid grid-cols-[auto_1fr_auto] grid-rows-[auto_1fr_auto] gap-0 px-2.5 pt-3 pb-10 sm:p-4 sm:pt-5">
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
    </>
  )
}

function DesktopLinksMenu({ setOnboardingOpen }: { setOnboardingOpen: (v: boolean) => void }) {
  return (
    <div className="pointer-events-auto hidden max-w-full min-w-0 flex-wrap items-center justify-center gap-1.5 rounded-2xl bg-white/94 px-3 py-2.5 shadow-[0_6px_28px_rgba(15,23,42,0.05)] backdrop-blur-[20px] sm:flex sm:gap-2 sm:px-5 sm:py-3 md:gap-3 md:px-6 md:py-3.5 sm:shadow-[0_8px_40px_rgba(15,23,42,0.06)]">
      <Link
        href="/o-projektu"
        prefetch={false}
        className="rounded-full px-3 py-1.5 text-[12px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
      >
        O projektu
      </Link>
      <Link
        href="/statistika"
        prefetch={false}
        className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-[12px] font-medium text-neutral-800 transition-colors hover:bg-neutral-200/90"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 3v18h18" />
          <path d="m19 9-5 5-4-4-3 3" />
        </svg>
        Statistika
      </Link>
      <button
        type="button"
        onClick={() => setOnboardingOpen(true)}
        className="rounded-full px-3 py-1.5 text-[12px] font-medium text-neutral-600 transition-[color,transform,background-color] duration-160 ease-out hover:bg-neutral-100 hover:text-neutral-900 active:scale-[0.95]"
      >
        Pomoć
      </button>
    </div>
  )
}

function HudTopCenter({ p }: { p: HudOverlayProps }) {
  return (
    <div className="col-start-2 row-start-1 flex w-full min-w-0 max-w-full flex-col items-center gap-3 justify-self-center sm:gap-4 md:gap-5">
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
        setOnboardingOpen={p.setOnboardingOpen}
      />
      <DesktopLinksMenu setOnboardingOpen={p.setOnboardingOpen} />
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
          className="island island-compact pointer-events-auto text-[12px] font-medium text-red-600/95"
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
    <div className="col-span-full col-start-1 row-start-3 self-end justify-self-stretch sm:col-span-1 sm:col-start-2 sm:justify-self-center">
      <BottomHintPanel
        hasOrigin={p.hasOrigin}
        everHadOrigin={p.everHadOrigin}
        route={p.route}
        loading={p.loading}
        routeLoading={p.routeLoading}
        ease={p.ease}
        setCoords={p.setCoords}
        onClearDestination={p.onClearDestination}
      />
      <RouteDetailsPanel
        route={p.route}
        routeLoading={p.routeLoading}
        effectiveTime={p.effectiveTime}
        linkCopied={p.linkCopied}
        mapRef={p.mapRef}
        setLinkCopied={p.setLinkCopied}
        setCoords={p.setCoords}
        onClearDestination={p.onClearDestination}
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
