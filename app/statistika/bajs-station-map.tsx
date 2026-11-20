"use client"

import { useEffect, useRef, useCallback } from "react"
import {
  AttributionControl,
  MapLibreMap,
  NavigationControl,
  Popup,
} from "@/lib/maplibre"
import type { GeoJSONSource } from "@/lib/maplibre"
import "maplibre-gl/dist/maplibre-gl.css"
import useSWR from "swr"

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
        "#ef4444",
        ["<=", ["get", "bikesAvailable"], 3],
        "#eab308",
        "#22c55e",
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
      "circle-stroke-color": "#ffffff",
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
      "color:#64748b;font-family:var(--font-mono),monospace;font-size:12px;line-height:16px;margin-top:2px",
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
    <div className="absolute bottom-3 left-3 rounded-lg bg-white/90 px-3 py-2 font-mono text-label backdrop-blur-sm dark:bg-zinc-900/90">
      <div className="mb-1 font-semibold text-slate-700 dark:text-slate-300">
        Dostupnost
      </div>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#22c55e]" />{" "}
          4+
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#eab308]" />{" "}
          1–3
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#ef4444]" />{" "}
          0
        </span>
      </div>
    </div>
  )
}

export default function BajsStationMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const popupRef = useRef<Popup | null>(null)

  const { data } = useSWR<GeoJSON.FeatureCollection>("/api/bajs", {
    refreshInterval: 60_000,
    keepPreviousData: true,
  })

  const updateSource = useCallback(() => {
    const map = mapRef.current
    if (!map || !data) {
      return
    }
    const src = map.getSource<GeoJSONSource>("bajs-stations")
    if (src) {
      void src.setData(data)
    }
  }, [data])

  useEffect(() => {
    if (!containerRef.current) {
      return
    }
    const map = new MapLibreMap({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: ZAGREB,
      zoom: 12.5,
      attributionControl: false,
    })
    map.addControl(new NavigationControl({ showCompass: false }), "top-right")
    map.addControl(new AttributionControl({ compact: true }), "bottom-right")
    map.on("load", () => {
      addStationLayer(map)
      setupInteractions(map, popupRef)
    })
    mapRef.current = map
    const popup = popupRef
    return () => {
      popup.current?.remove()
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !data) {
      return
    }
    if (map.isStyleLoaded()) {
      updateSource()
    } else {
      map.once("load", updateSource)
    }
  }, [data, updateSource])

  return (
    <div className="overflow-hidden rounded-[12px] bg-[#f9f9f9] dark:bg-[#1a1a1a]">
      <div className="relative overflow-hidden rounded-[12px]">
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
