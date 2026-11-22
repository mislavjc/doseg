"use client"

import { useRef } from "react"
import { AttributionControl, NavigationControl, Popup } from "@/lib/maplibre"
import type { MapLibreMap } from "@/lib/maplibre"
import "maplibre-gl/dist/maplibre-gl.css"
import useSWR from "swr"

import { MAP_STYLE_URL } from "@/lib/map-styles"
import { useGeoJSONSourceData, useMapLibre } from "@/lib/use-maplibre"

// MapLibre paint can't resolve CSS variables; these mirror :root in
// app/globals.css (--zg-blue, --ink-faint, --ink, --ground). Keep them in sync.
const STATION_OK = "#0e51c9"
const STATION_LOW = "#9aa0a6"
const STATION_EMPTY = "#0a0a0a"
const GROUND = "#ffffff"

const ZAGREB: [number, number] = [15.978, 45.815]

interface StationProps {
  name: string
  bikesAvailable: number
  docksAvailable: number
  capacity: number
}

function isStationProps(p: unknown): p is StationProps {
  return (
    typeof p === "object" &&
    p !== null &&
    "name" in p &&
    typeof p.name === "string" &&
    "bikesAvailable" in p &&
    typeof p.bikesAvailable === "number" &&
    "docksAvailable" in p &&
    typeof p.docksAvailable === "number" &&
    "capacity" in p &&
    typeof p.capacity === "number"
  )
}

function addStationLayer(map: MapLibreMap) {
  map.addSource("bajs-stations", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  })
  map.addLayer({
    id: "bajs-circles",
    type: "circle",
    source: "bajs-stations",
    paint: {
      "circle-color": [
        "case",
        ["==", ["get", "bikesAvailable"], 0],
        STATION_EMPTY,
        ["<=", ["get", "bikesAvailable"], 3],
        STATION_LOW,
        STATION_OK,
      ],
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["get", "capacity"],
        5,
        6,
        15,
        8,
        30,
        10,
      ],
      "circle-stroke-color": GROUND,
      "circle-stroke-width": 1.5,
      "circle-opacity": 0.9,
    },
  })
}

function el(tag: string, style: string, ...children: Array<Node | string>) {
  const node = document.createElement(tag)
  node.style.cssText = style
  node.append(...children)
  return node
}

function stationPopup(p: StationProps) {
  const strong = (v: number) => el("strong", "", String(v))
  return el(
    "div",
    "font-family:var(--font-heros),sans-serif;font-size:16px;line-height:24px",
    el("strong", "", p.name),
    el("div", "margin-top:4px", "Bicikli: ", strong(p.bikesAvailable)),
    el("div", "", "Dokovi: ", strong(p.docksAvailable)),
    el(
      "div",
      "color:var(--ink-muted);font-family:var(--font-mono),monospace;font-size:12px;line-height:16px;margin-top:2px",
      `Kapacitet: ${p.capacity}`
    )
  )
}

function setupInteractions(
  map: MapLibreMap,
  popupRef: React.RefObject<Popup | null>
) {
  map.on("mouseenter", "bajs-circles", () => {
    map.getCanvas().style.cursor = "pointer"
  })
  map.on("mouseleave", "bajs-circles", () => {
    map.getCanvas().style.cursor = ""
  })
  map.on("click", "bajs-circles", (e) => {
    const feature = e.features?.[0]
    if (!feature || feature.geometry.type !== "Point") {
      return
    }
    const [lng, lat] = feature.geometry.coordinates
    const p: unknown = feature.properties
    if (!isStationProps(p)) {
      return
    }
    popupRef.current?.remove()
    popupRef.current = new Popup({
      closeButton: true,
      maxWidth: "220px",
      offset: 12,
    })
      .setLngLat([lng, lat])
      .setDOMContent(stationPopup(p))
      .addTo(map)
  })
}

function MapLegend() {
  return (
    <div className="absolute bottom-3 left-3 bg-surface px-3 py-2 font-mono text-label backdrop-blur-sm">
      <div className="mb-1 font-semibold text-ink-2">Dostupnost</div>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-zg-blue" />{" "}
          4+
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-ink-faint" />{" "}
          1–3
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-ink" /> 0
        </span>
      </div>
    </div>
  )
}

export default function BajsStationMap() {
  const popupRef = useRef<Popup | null>(null)

  const { data } = useSWR<GeoJSON.FeatureCollection>("/api/bajs", {
    refreshInterval: 60_000,
    keepPreviousData: true,
  })

  const { containerRef, mapRef } = useMapLibre(
    { style: MAP_STYLE_URL, center: ZAGREB, zoom: 12.5 },
    (map) => {
      map.addControl(new NavigationControl({ showCompass: false }), "top-right")
      map.addControl(new AttributionControl({ compact: true }), "bottom-right")
      map.on("load", () => {
        addStationLayer(map)
        setupInteractions(map, popupRef)
      })
      return () => {
        popupRef.current?.remove()
      }
    },
    []
  )

  useGeoJSONSourceData(mapRef, "bajs-stations", data)

  return (
    <div className="overflow-hidden bg-surface">
      <div className="relative overflow-hidden">
        <div
          ref={containerRef}
          role="application"
          aria-label="Karta BAJS stanica u Zagrebu"
          style={{ height: 400, width: "100%" }}
        />
        <MapLegend />
      </div>
    </div>
  )
}
