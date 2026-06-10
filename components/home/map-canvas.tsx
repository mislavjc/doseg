"use client"

import { useEffect, useRef, useState } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

import {
  applyBasemapBackgroundTint,
  DEFAULT_MAP_STYLE,
  getMapStyleUrl,
} from "@/lib/map-styles"
import { MODE_COLORS, POI_COLORS } from "@/lib/mode-colors"
import { reachColorStops } from "@/lib/reach-ramp"
import type { LayersState } from "./layers-panel"
import type { LatLon, Poi } from "./reach-state"
import { MapTile, MapTileButton } from "./ui"

/**
 * The interactive map. Reach fill + route lines use the editorial palette
 * (lib/reach-ramp + lib/mode-colors) — the same single sources the sidebar
 * legend and journey chips use, so the map and panel always agree.
 */

const ZAGREB: [number, number] = [15.9819, 45.815]

/** Keep in sync with Tailwind's `md:` (sidebar vs bottom-sheet layouts). */
const MD_BREAKPOINT_PX = 768

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
}

// Reach fill ramp (navy → pale) over the walk-area `time` in seconds — the same
// single source the legend uses (lib/reach-ramp). Clamps at 30 min, as before.
const REACH_FILL = reachColorStops(1800)

/** First symbol/label layer ID so data layers render below text. */
function firstSymbolLayerId(map: maplibregl.Map): string | undefined {
  for (const l of map.getStyle().layers ?? []) {
    if (l.type === "symbol") return l.id
  }
  return undefined
}

/** Same basemap tweaks as `/` — hide buildings, surface labels earlier. */
function tweakBasemapForIsochrone(map: maplibregl.Map, active: boolean) {
  for (const id of ["building", "building-top"]) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", active ? "none" : "visible")
    }
  }
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

function addWalkAreaLayers(map: maplibregl.Map) {
  const firstLabelId = firstSymbolLayerId(map)
  map.addSource("walk-area", { type: "geojson", data: EMPTY_FC })
  map.addLayer(
    {
      id: "walk-area-fill",
      type: "fill",
      source: "walk-area",
      paint: {
        "fill-color": REACH_FILL,
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
  map.addLayer(
    {
      id: "walk-area-border",
      type: "line",
      source: "walk-area",
      paint: {
        "line-color": REACH_FILL,
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

function addRouteLayers(map: maplibregl.Map) {
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
  map.addLayer({
    id: "route-walk",
    type: "line",
    source: "route",
    filter: ["==", ["get", "mode"], "WALK"],
    paint: {
      "line-color": MODE_COLORS.walk,
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
      // Per-leg color (BAJS amber) — matches the sidebar strip/chips.
      "line-color": ["coalesce", ["get", "color"], MODE_COLORS.bike],
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
      // Per-line color from the itinerary (matches the sidebar strip/list).
      "line-color": ["coalesce", ["get", "color"], "#e2e8f0"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3, 13, 5, 16, 7],
    },
    layout: { "line-cap": "round", "line-join": "round" },
  })
}

function addPoiBajsLayers(map: maplibregl.Map) {
  map.addSource("poi", { type: "geojson", data: EMPTY_FC })
  map.addLayer({
    id: "poi-dots",
    type: "circle",
    source: "poi",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        10,
        3.5,
        13,
        5.5,
        16,
        7,
      ],
      "circle-color": [
        "match",
        ["get", "category"],
        "hospital",
        POI_COLORS.hospital,
        "school",
        POI_COLORS.school,
        "park",
        POI_COLORS.park,
        "#9aa0a6",
      ],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  })
  map.addSource("bajs", { type: "geojson", data: EMPTY_FC })
  map.addLayer({
    id: "bajs-dots",
    type: "circle",
    source: "bajs",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        10,
        3,
        13,
        5,
        16,
        6.5,
      ],
      "circle-color": "#e8883c",
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  })
}

function dataBounds(
  fc: GeoJSON.FeatureCollection
): maplibregl.LngLatBounds | null {
  const bounds = new maplibregl.LngLatBounds()
  for (const f of fc.features) {
    const g = f.geometry
    if (g.type === "MultiPolygon") {
      for (const poly of g.coordinates)
        for (const pt of poly[0]) bounds.extend(pt as [number, number])
    } else if (g.type === "LineString") {
      for (const pt of g.coordinates) bounds.extend(pt as [number, number])
    }
  }
  return bounds.isEmpty() ? null : bounds
}

function markerElement(className: string, inner: string): HTMLDivElement {
  const el = document.createElement("div")
  el.className = className
  el.innerHTML = inner
  return el
}

/** Same origin marker as `/` (green dot + ping ring). */
function makeOriginMarker() {
  return new maplibregl.Marker({
    element: markerElement(
      "origin-marker",
      '<div class="origin-marker-dot"></div><div class="origin-marker-ring"></div>'
    ),
  })
}

/** Same destination dot as `/` (small slate circle). */
function makeDestMarker() {
  return new maplibregl.Marker({
    element: markerElement("dest-dot-marker", ""),
  })
}

function useMapInstance(onMapClick: (p: LatLon) => void) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [ready, setReady] = useState(false)

  const onMapClickRef = useRef(onMapClick)
  useEffect(() => {
    onMapClickRef.current = onMapClick
  }, [onMapClick])

  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyleUrl(),
      center: ZAGREB,
      zoom: 12.4,
      attributionControl: false,
    })
    mapRef.current = map
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right"
    )
    map.on("load", () => {
      applyBasemapBackgroundTint(map, DEFAULT_MAP_STYLE)
      addWalkAreaLayers(map)
      addRouteLayers(map)
      addPoiBajsLayers(map)
      setReady(true)
    })
    map.on("click", (e) => {
      onMapClickRef.current({ lat: e.lngLat.lat, lon: e.lngLat.lng })
    })
    return () => {
      mapRef.current = null
      setReady(false)
      map.remove()
    }
  }, [])

  return { containerRef, mapRef, ready }
}

/** Keeps a marker in sync with a point; creates/removes it as needed. */
function useMarker(
  mapRef: React.RefObject<maplibregl.Map | null>,
  point: LatLon | null,
  make: () => maplibregl.Marker
) {
  const markerRef = useRef<maplibregl.Marker | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!point) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    if (!markerRef.current) markerRef.current = make()
    markerRef.current.setLngLat([point.lon, point.lat]).addTo(map)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- make is stable
  }, [mapRef, point])
}

/** Toggleable layers: POI dots (per category) + BAJS stations (spec §5). */
function useLayerSync(
  mapRef: React.RefObject<maplibregl.Map | null>,
  ready: boolean,
  layers: LayersState,
  pois: Poi[] | null,
  bajs: GeoJSON.FeatureCollection | null
) {
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const enabled = (
      Object.keys(layers.poi) as (keyof LayersState["poi"])[]
    ).filter((k) => layers.poi[k])
    const src = map.getSource("poi") as maplibregl.GeoJSONSource | undefined
    src?.setData(
      pois
        ? {
            type: "FeatureCollection",
            features: pois.map((p) => ({
              type: "Feature" as const,
              properties: { category: p.category, name: p.name },
              geometry: {
                type: "Point" as const,
                coordinates: [p.lon, p.lat],
              },
            })),
          }
        : EMPTY_FC
    )
    map.setFilter("poi-dots", ["in", ["get", "category"], ["literal", enabled]])
    map.setLayoutProperty(
      "poi-dots",
      "visibility",
      enabled.length > 0 ? "visible" : "none"
    )
  }, [mapRef, ready, layers.poi, pois])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource("bajs") as maplibregl.GeoJSONSource | undefined
    src?.setData(bajs ?? EMPTY_FC)
    map.setLayoutProperty(
      "bajs-dots",
      "visibility",
      layers.bajs ? "visible" : "none"
    )
  }, [mapRef, ready, layers.bajs, bajs])
}

/** Sidebar-aware on desktop, sheet-aware on mobile (spec §9). */
function fitPadding(map: maplibregl.Map, forRoute: boolean) {
  const mobile = map.getContainer().clientWidth < MD_BREAKPOINT_PX
  if (mobile) return { left: 30, right: 30, top: 100, bottom: 240 }
  return forRoute
    ? { left: 440, top: 80, right: 80, bottom: 80 }
    : { left: 420, top: 60, right: 60, bottom: 60 }
}

/** Sync reach + route GeoJSON into the map and frame the active data. */
function useDataSync(
  mapRef: React.RefObject<maplibregl.Map | null>,
  ready: boolean,
  walkArea: GeoJSON.FeatureCollection | null,
  route: GeoJSON.FeatureCollection | null,
  doseg: boolean
) {
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource("walk-area") as
      | maplibregl.GeoJSONSource
      | undefined
    src?.setData(walkArea ?? EMPTY_FC)
    tweakBasemapForIsochrone(map, Boolean(walkArea?.features.length))
    if (walkArea?.features.length && !route) {
      const bounds = dataBounds(walkArea)
      if (bounds) {
        map.fitBounds(bounds, {
          padding: fitPadding(map, false),
          duration: 600,
          maxZoom: 13.5,
        })
      }
    }
  }, [mapRef, walkArea, ready, route])

  // Same dimming as `/` — fill hides, borders drop to 0.15 under a route.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const hasRoute = Boolean(route?.features.length)
    map.setLayoutProperty(
      "walk-area-fill",
      "visibility",
      hasRoute || !doseg ? "none" : "visible"
    )
    map.setLayoutProperty(
      "walk-area-border",
      "visibility",
      doseg ? "visible" : "none"
    )
    map.setPaintProperty(
      "walk-area-border",
      "line-opacity",
      hasRoute
        ? 0.15
        : ["interpolate", ["linear"], ["get", "time"], 600, 0.7, 2700, 0.4]
    )
    const src = map.getSource("route") as maplibregl.GeoJSONSource | undefined
    src?.setData(route ?? EMPTY_FC)
    if (route?.features.length) {
      const bounds = dataBounds(route)
      if (bounds) {
        map.fitBounds(bounds, {
          padding: fitPadding(map, true),
          duration: 600,
          maxZoom: 15,
        })
      }
    }
  }, [mapRef, route, ready, doseg])
}

function ZoomControl({
  mapRef,
}: {
  mapRef: React.RefObject<maplibregl.Map | null>
}) {
  return (
    <MapTile className="absolute bottom-6 left-6 z-20 hidden flex-col md:flex md:left-[404px]">
      <MapTileButton
        label="Približi kartu"
        onClick={() => mapRef.current?.zoomIn()}
        className="size-[34px] border-b border-hairline font-heros text-[18px] leading-[22px] text-ink-2"
      >
        +
      </MapTileButton>
      <MapTileButton
        label="Udalji kartu"
        onClick={() => mapRef.current?.zoomOut()}
        className="size-[34px] font-heros text-[18px] leading-[22px] text-ink-2"
      >
        −
      </MapTileButton>
    </MapTile>
  )
}

export function MapCanvas({
  walkArea,
  route,
  origin,
  dest,
  layers,
  pois,
  bajs,
  onMapClick,
}: {
  walkArea: GeoJSON.FeatureCollection | null
  route: GeoJSON.FeatureCollection | null
  origin: LatLon | null
  dest: LatLon | null
  layers: LayersState
  pois: Poi[] | null
  bajs: GeoJSON.FeatureCollection | null
  onMapClick: (p: LatLon) => void
}) {
  const { containerRef, mapRef, ready } = useMapInstance(onMapClick)
  useMarker(mapRef, origin, makeOriginMarker)
  useMarker(mapRef, dest, makeDestMarker)
  useDataSync(mapRef, ready, walkArea, route, layers.doseg)
  useLayerSync(mapRef, ready, layers, pois, bajs)

  return (
    <>
      {/* NB: not `absolute inset-0` — maplibre's stylesheet forces
          `.maplibregl-map { position: relative }`, which would zero the height. */}
      <div ref={containerRef} className="h-full w-full" />
      <ZoomControl mapRef={mapRef} />
    </>
  )
}
