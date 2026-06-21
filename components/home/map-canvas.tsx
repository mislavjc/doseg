"use client"

import { useEffect, useRef, useState } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import {
  IconMinusMedium,
  IconPlusMedium,
} from "@central-icons-react/square-outlined-radius-0-stroke-2"

import {
  applyBasemapBackgroundTint,
  DEFAULT_MAP_STYLE,
  getMapStyleUrl,
} from "@/lib/map-styles"
import { MODE_COLORS, POI_COLORS } from "@/lib/mode-colors"
import { GEOCODE_KIND_META } from "@/lib/poi"
import { reachColorStops } from "@/lib/reach-ramp"
import type { LayersState } from "./layers-panel"
import { deShout, type LatLon, type MapPoi } from "./reach-state"
import { MapTile, MapTileButton } from "./ui"

/**
 * The interactive map. Reach fill + route lines use the editorial palette
 * (lib/reach-ramp + lib/mode-colors) — the same single sources the sidebar
 * legend and journey chips use, so the map and panel always agree.
 */

const ZAGREB: [number, number] = [15.9819, 45.815]

/** Keep in sync with Tailwind's `md:` (sidebar vs bottom-sheet layouts). */
const MD_BREAKPOINT_PX = 768

/** Interactive dot layers — clicking these picks a POI, not a map point. */
const DOT_LAYERS = ["poi-dots", "bajs-dots"]

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

// POIs outside the current reach fade back — counts in the sidebar refer to
// what's inside the band, the map should agree at a glance.
const IN_REACH_OPACITY: maplibregl.ExpressionSpecification = [
  "case",
  ["==", ["get", "inReach"], false],
  0.25,
  1,
]

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
      "circle-opacity": IN_REACH_OPACITY,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-opacity": IN_REACH_OPACITY,
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
      // Dot clicks open the POI popup (usePoiInteractions) — don't also
      // treat them as a bare map click that would silently start a route.
      const dotLayers = DOT_LAYERS.filter((l) => map.getLayer(l))
      if (
        dotLayers.length &&
        map.queryRenderedFeatures(e.point, { layers: dotLayers }).length
      )
        return
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
  pois: MapPoi[] | null,
  bajs: GeoJSON.FeatureCollection | null
) {
  // Rebuild + upload the source only when the POI data itself changes —
  // not on a category toggle (which just re-filters the same features).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource("poi") as maplibregl.GeoJSONSource | undefined
    src?.setData(
      pois
        ? {
            type: "FeatureCollection",
            features: pois.map((p) => ({
              type: "Feature" as const,
              // Flat props only — GeoJSON feature state can't hold objects.
              properties: {
                category: p.category,
                name: p.name,
                inReach: p.inReach,
                photoThumb: p.photo?.thumb ?? null,
                photoPage: p.photo?.page ?? null,
                photoCredit: p.photo?.credit ?? null,
              },
              geometry: {
                type: "Point" as const,
                coordinates: [p.lon, p.lat],
              },
            })),
          }
        : EMPTY_FC
    )
  }, [mapRef, ready, pois])

  // Category toggles are two cheap GL calls — no data rebuild.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const enabled = (
      Object.keys(layers.poi) as (keyof LayersState["poi"])[]
    ).filter((k) => layers.poi[k])
    map.setFilter("poi-dots", ["in", ["get", "category"], ["literal", enabled]])
    map.setLayoutProperty(
      "poi-dots",
      "visibility",
      enabled.length > 0 ? "visible" : "none"
    )
  }, [mapRef, ready, layers.poi])

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

type DotPhoto = { thumb: string; page: string; credit: string }
type DotInfo = { name: string | null; sub: string; photo: DotPhoto | null }

/** Title + context line (+ photo) for a clicked/hovered dot. */
function describeDot(f: maplibregl.MapGeoJSONFeature): DotInfo {
  const p = f.properties as Record<string, unknown>
  const photo = p.photoThumb
    ? {
        thumb: String(p.photoThumb),
        page: String(p.photoPage ?? ""),
        credit: String(p.photoCredit ?? ""),
      }
    : null
  if (f.layer.id === "bajs-dots") {
    return {
      name: p.name ? deShout(String(p.name)) : null,
      sub: `bajs stanica · ${p.bikesAvailable ?? "?"} bic.`,
      photo,
    }
  }
  const meta = GEOCODE_KIND_META[String(p.category)]
  return {
    name: p.name ? String(p.name) : null,
    sub: (meta?.label ?? "") + (p.inReach === false ? " · izvan dosega" : ""),
    photo,
  }
}

type PopupOpts = {
  /** Show the Commons photo + credit (click popup only — not hover). */
  withPhoto?: boolean
  action?: { label: string; onClick: () => void }
}

/** Popup content — name + context, plus optional photo/credit/action.
 * textContent throughout (never innerHTML: OSM + Commons strings). */
function dotPopupEl(
  info: DotInfo,
  fallbackTitle: string,
  opts: PopupOpts = {}
): HTMLDivElement {
  const root = document.createElement("div")
  root.className = "flex flex-col"
  const photo = opts.withPhoto ? info.photo : null
  if (photo) {
    root.style.width = "232px"
    const img = document.createElement("img")
    img.src = photo.thumb
    img.alt = info.name ?? ""
    img.loading = "lazy"
    img.className = "block h-[120px] w-full bg-surface object-cover"
    root.appendChild(img)
  }

  const body = document.createElement("div")
  body.className = "flex flex-col px-3.5 py-3"
  const title = document.createElement("span")
  title.className = "font-heros text-[16px] leading-5 text-ink"
  title.textContent = info.name ?? fallbackTitle
  body.appendChild(title)
  if (info.sub) {
    const sub = document.createElement("span")
    sub.className = "mt-0.5 font-mono text-label text-ink-faint"
    sub.textContent = info.sub
    body.appendChild(sub)
  }
  if (opts.action) {
    const btn = document.createElement("button")
    btn.type = "button"
    btn.className =
      "mt-2.5 border border-hairline-strong px-3 py-2 text-left font-mono text-label text-zg-blue transition-colors duration-150 hover:bg-row-tint"
    btn.textContent = opts.action.label
    btn.addEventListener("click", opts.action.onClick)
    body.appendChild(btn)
  }
  if (photo && photo.credit) {
    const credit = document.createElement("a")
    credit.href = photo.page
    credit.target = "_blank"
    credit.rel = "noopener noreferrer"
    credit.title = photo.credit
    credit.className =
      "mt-2 block max-w-full truncate font-mono text-label text-ink-faint transition-colors duration-150 hover:text-ink-muted"
    credit.textContent = `© ${photo.credit}`
    body.appendChild(credit)
  }

  root.appendChild(body)
  return root
}

/**
 * Dot affordances (POI + BAJS): pointer cursor, hover tooltip, and a click
 * popup with an explicit routing action — a dot click answers "what is
 * this?" instead of silently starting a route.
 */
const POPUP_OPTS = {
  closeButton: false,
  className: "reach-popup",
  offset: 12,
  maxWidth: "260px",
} as const

/** Resolve the hovered/clicked dot feature + its geo coords. */
function dotFeatureAt(e: maplibregl.MapLayerMouseEvent) {
  const f = e.features?.[0]
  if (!f) return null
  const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number]
  return { f, coords }
}

/**
 * Wire hover + click popups onto the dot layers; returns a teardown.
 * Hover shows the full card minus the button (photo + name + category +
 * credit); the button is click-only so the cursor never has to travel off
 * the dot to reach it. A dwell guard defers the photo load, so a fast
 * mouse-sweep across the dense dot field doesn't fire dozens of requests.
 */
function bindDotPopups(
  map: maplibregl.Map,
  originRef: React.RefObject<LatLon | null>,
  pickRef: React.RefObject<(p: LatLon, name?: string) => void>
): () => void {
  const hover = new maplibregl.Popup(POPUP_OPTS)
  const action = new maplibregl.Popup(POPUP_OPTS)
  const canvas = map.getCanvas()
  let dwellTimer: ReturnType<typeof setTimeout> | null = null
  let hoverKey: string | null = null
  const clearDwell = () => {
    if (dwellTimer) clearTimeout(dwellTimer)
    dwellTimer = null
  }

  const onMove = (e: maplibregl.MapLayerMouseEvent) => {
    canvas.style.cursor = "pointer"
    if (action.isOpen()) return
    const hit = dotFeatureAt(e)
    if (!hit) return
    const key = hit.coords.join(",")
    if (key === hoverKey) return // already shown/pending for this dot
    hoverKey = key
    clearDwell()
    const info = describeDot(hit.f)
    const show = () =>
      hover
        .setLngLat(hit.coords)
        .setDOMContent(dotPopupEl(info, "bez imena", { withPhoto: true }))
        .addTo(map)
    // Instant for plain dots; brief dwell only when a photo would load.
    if (info.photo) dwellTimer = setTimeout(show, 150)
    else show()
  }
  const onLeave = () => {
    canvas.style.cursor = ""
    clearDwell()
    hoverKey = null
    hover.remove()
  }
  const onClick = (e: maplibregl.MapLayerMouseEvent) => {
    const hit = dotFeatureAt(e)
    if (!hit) return
    clearDwell()
    hoverKey = null
    hover.remove()
    const info = describeDot(hit.f)
    const el = dotPopupEl(info, "bez imena", {
      withPhoto: true,
      action: {
        label: originRef.current ? "Postavi kao odredište" : "Kreni odavde",
        onClick: () => {
          action.remove()
          pickRef.current?.(
            { lat: hit.coords[1], lon: hit.coords[0] },
            info.name ?? undefined
          )
        },
      },
    })
    action.setLngLat(hit.coords).setDOMContent(el).addTo(map)
  }

  for (const id of DOT_LAYERS) {
    map.on("mousemove", id, onMove)
    map.on("mouseleave", id, onLeave)
    map.on("click", id, onClick)
  }
  return () => {
    clearDwell()
    hover.remove()
    action.remove()
    canvas.style.cursor = ""
    for (const id of DOT_LAYERS) {
      map.off("mousemove", id, onMove)
      map.off("mouseleave", id, onLeave)
      map.off("click", id, onClick)
    }
  }
}

function usePoiInteractions(
  mapRef: React.RefObject<maplibregl.Map | null>,
  ready: boolean,
  origin: LatLon | null,
  onPoiPick: (p: LatLon, name?: string) => void
) {
  const originRef = useRef(origin)
  const pickRef = useRef(onPoiPick)
  useEffect(() => {
    originRef.current = origin
    pickRef.current = onPoiPick
  }, [origin, onPoiPick])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    return bindDotPopups(map, originRef, pickRef)
  }, [mapRef, ready])
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
        className="size-[34px] border-b border-hairline text-ink-2"
      >
        <IconPlusMedium size={18} />
      </MapTileButton>
      <MapTileButton
        label="Udalji kartu"
        onClick={() => mapRef.current?.zoomOut()}
        className="size-[34px] text-ink-2"
      >
        <IconMinusMedium size={18} />
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
  onPoiPick,
}: {
  walkArea: GeoJSON.FeatureCollection | null
  route: GeoJSON.FeatureCollection | null
  origin: LatLon | null
  dest: LatLon | null
  layers: LayersState
  pois: MapPoi[] | null
  bajs: GeoJSON.FeatureCollection | null
  onMapClick: (p: LatLon) => void
  onPoiPick: (p: LatLon, name?: string) => void
}) {
  const { containerRef, mapRef, ready } = useMapInstance(onMapClick)
  useMarker(mapRef, origin, makeOriginMarker)
  useMarker(mapRef, dest, makeDestMarker)
  useDataSync(mapRef, ready, walkArea, route, layers.doseg)
  useLayerSync(mapRef, ready, layers, pois, bajs)
  usePoiInteractions(mapRef, ready, origin, onPoiPick)

  return (
    <>
      {/* NB: not `absolute inset-0` — maplibre's stylesheet forces
          `.maplibregl-map { position: relative }`, which would zero the height. */}
      <div ref={containerRef} className="h-full w-full" />
      <ZoomControl mapRef={mapRef} />
    </>
  )
}
