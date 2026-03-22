"use client"

import { useEffect, useRef, useCallback } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import useSWR from "swr"

const ZAGREB: [number, number] = [15.978, 45.815]

const LIGHT_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
const DARK_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"

function getMapStyle(): string {
  if (typeof document === "undefined") return DARK_STYLE
  return document.documentElement.classList.contains("dark")
    ? DARK_STYLE
    : LIGHT_STYLE
}

function addStationLayer(map: maplibregl.Map) {
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
        5, 6, 15, 8, 30, 10,
      ],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
      "circle-opacity": 0.9,
    },
  })
}

function setupInteractions(
  map: maplibregl.Map,
  popupRef: React.RefObject<maplibregl.Popup | null>,
) {
  map.on("mouseenter", "bajs-circles", () => {
    map.getCanvas().style.cursor = "pointer"
  })
  map.on("mouseleave", "bajs-circles", () => {
    map.getCanvas().style.cursor = ""
  })
  map.on("click", "bajs-circles", (e) => {
    const feature = e.features?.[0]
    if (!feature || feature.geometry.type !== "Point") return
    const coords = feature.geometry.coordinates.slice() as [number, number]
    const p = feature.properties as {
      name: string
      bikesAvailable: number
      docksAvailable: number
      capacity: number
    }
    popupRef.current?.remove()
    popupRef.current = new maplibregl.Popup({
      closeButton: true,
      maxWidth: "220px",
      offset: 12,
    })
      .setLngLat(coords)
      .setHTML(
        `<div style="font-family:system-ui,sans-serif;font-size:13px;line-height:1.5">
          <strong style="font-size:14px">${p.name}</strong>
          <div style="margin-top:4px">Bicikli: <strong>${p.bikesAvailable}</strong></div>
          <div>Dokovi: <strong>${p.docksAvailable}</strong></div>
          <div style="color:#64748b;font-size:12px;margin-top:2px">Kapacitet: ${p.capacity}</div>
        </div>`,
      )
      .addTo(map)
  })
}

function MapLegend() {
  return (
    <div className="absolute bottom-3 left-3 rounded-lg bg-white/90 px-3 py-2 text-[11px] shadow-sm backdrop-blur-sm dark:bg-zinc-900/90">
      <div className="mb-1 font-semibold text-slate-700 dark:text-slate-300">Dostupnost</div>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#22c55e]" /> 4+
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#eab308]" /> 1–3
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#ef4444]" /> 0
        </span>
      </div>
    </div>
  )
}

export default function BajsStationMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)

  const { data } = useSWR<GeoJSON.FeatureCollection>("/api/bajs", {
    refreshInterval: 60_000,
    keepPreviousData: true,
  })

  const updateSource = useCallback(() => {
    const map = mapRef.current
    if (!map || !data) return
    const src = map.getSource("bajs-stations") as maplibregl.GeoJSONSource | undefined
    if (src) src.setData(data)
  }, [data])

  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(),
      center: ZAGREB,
      zoom: 12.5,
      attributionControl: false,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right")
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right")
    map.on("load", () => {
      addStationLayer(map)
      setupInteractions(map, popupRef)
    })
    mapRef.current = map
    const popup = popupRef
    return () => { popup.current?.remove(); map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !data) return
    if (map.isStyleLoaded()) updateSource()
    else map.once("load", updateSource)
  }, [data, updateSource])

  return (
    <div className="overflow-hidden rounded-3xl border border-dashed border-slate-200 bg-slate-50/50 dark:border-white/10 dark:bg-white/5">
      <div className="relative">
        <div ref={containerRef} role="application" aria-label="Karta BAJS stanica u Zagrebu" style={{ height: 400, width: "100%" }} />
        <MapLegend />
      </div>
    </div>
  )
}
