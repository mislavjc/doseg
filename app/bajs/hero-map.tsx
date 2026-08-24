"use client"

import { useEffect, useRef } from "react"
import maplibregl, { type StyleSpecification } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import useSWR from "swr"

import { plural } from "@/app/linije/copy"
import meta from "@/data/bajs-tiles.json"

import { addStationLayers, setStationHover, STATION_LAYER } from "./station-marks"

/**
 * The pannable dither. Instead of a vendor basemap this map's only ground is
 * `public/bajs-tiles`, the blue-on-white figure-ground baked by
 * `scripts/build-bajs-tiles.ts`, so zooming in keeps the same fabric the rest of
 * the site is drawn on rather than dissolving into somebody else's cartography.
 */

const ATTRIBUTION =
  '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, <a href="https://carto.com/attributions">CARTO</a>'

/** Refresh cadence of the live feed; GBFS itself only moves about this often. */
const REFRESH_MS = 60_000

type Feed = GeoJSON.FeatureCollection<GeoJSON.Point>

const EMPTY: Feed = { type: "FeatureCollection", features: [] }

/** The pannable world: the padded box the tiles were baked over. */
const BOUNDS = meta.bounds as [number, number, number, number]

const DITHER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    dither: {
      type: "raster",
      tiles: ["/bajs-tiles/{z}/{x}/{y}.png"],
      // The tiles are 512 px filling a 256 slot, which is what renders them 1:1
      // on a retina screen instead of interpolated.
      tileSize: 256,
      minzoom: meta.minZoom,
      maxzoom: meta.maxZoom,
      bounds: BOUNDS,
      attribution: ATTRIBUTION,
    },
  },
  layers: [
    { id: "ground", type: "background", paint: { "background-color": "#ffffff" } },
    { id: "dither", type: "raster", source: "dither" },
  ],
}

/** Built as nodes, not markup: station names come from a third-party feed. */
function popupContent(p: Record<string, unknown>) {
  const bikes = Number(p.bikesAvailable ?? 0)
  const docks = Number(p.docksAvailable ?? 0)

  const name = document.createElement("strong")
  name.textContent = String(p.name ?? "")
  const counts = document.createElement("span")
  counts.textContent =
    `${bikes} ${plural(bikes, "bajs", "bajsa", "bajsa")} · ` +
    `${docks} ${plural(docks, "slobodno mjesto", "slobodna mjesta", "slobodnih mjesta")}`

  const frag = document.createDocumentFragment()
  frag.append(name, counts)
  return frag
}

function addInteractions(map: maplibregl.Map, popup: maplibregl.Popup) {
  map.on("mousemove", STATION_LAYER, (e) => {
    map.getCanvas().style.cursor = "pointer"
    setStationHover(map, e.features?.[0]?.properties?.stationId)
  })
  map.on("mouseleave", STATION_LAYER, () => {
    map.getCanvas().style.cursor = ""
    setStationHover(map)
  })
  map.on("click", STATION_LAYER, (e) => {
    const f = e.features?.[0]
    if (!f || f.geometry.type !== "Point") return
    popup
      .setLngLat(f.geometry.coordinates.slice(0, 2) as [number, number])
      .setDOMContent(popupContent(f.properties ?? {}))
      .addTo(map)
  })
}

/**
 * Opening frame: the middle 96% of stations, not all of them. A handful of
 * outlying stands in Sesvete and Novi Zagreb would otherwise pull the camera
 * back until the city everyone recognises is a smear across the middle. They
 * are still there, one drag east.
 */
function openingBounds(data: Feed): maplibregl.LngLatBoundsLike {
  const pts = data.features.map((f) => f.geometry.coordinates)
  if (pts.length < 20) return BOUNDS

  const at = (vals: number[], p: number) => {
    const s = vals.sort((a, b) => a - b)
    return s[Math.min(s.length - 1, Math.floor(s.length * p))]
  }
  const lons = pts.map((p) => p[0])
  const lats = pts.map((p) => p[1])
  return [
    [at(lons, 0.02), at(lats, 0.02)],
    [at(lons, 0.98), at(lats, 0.98)],
  ]
}

export default function BajsHeroMap({ initial = EMPTY }: { initial?: Feed }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  const { data } = useSWR<Feed>("/api/bajs", {
    refreshInterval: REFRESH_MS,
    keepPreviousData: true,
    fallbackData: initial,
  })

  useEffect(() => {
    if (!containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DITHER_STYLE,
      bounds: openingBounds(initial),
      fitBoundsOptions: {
        padding: { top: 60, bottom: 32, left: 20, right: 20 },
        animate: false,
      },
      maxBounds: BOUNDS,
      minZoom: meta.minZoom,
      maxZoom: 16.5,
      dragRotate: false,
      pitchWithRotate: false,
      // The map fills the top of a long editorial page, so a plain wheel must
      // keep scrolling it. Zoom is ctrl/⌘+wheel, or two fingers on touch.
      cooperativeGestures: true,
      attributionControl: false,
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right")
    map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: ATTRIBUTION }),
      "bottom-right"
    )

    const popup = new maplibregl.Popup({
      className: "bajs-hero-popup",
      closeButton: false,
      maxWidth: "240px",
      offset: 14,
    })

    map.on("load", () => {
      addStationLayers(map, initial)
      addInteractions(map, popup)
      // MapLibre opens the compact credit expanded, which drops a line of grey
      // text into the middle of the map. Fold it back behind its button.
      containerRef.current
        ?.querySelector(".maplibregl-ctrl-attrib")
        ?.classList.remove("maplibregl-compact-show")
    })

    mapRef.current = map
    return () => {
      popup.remove()
      map.remove()
      mapRef.current = null
    }
  }, [initial])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !data) return
    const apply = () => {
      const src = map.getSource("stations") as maplibregl.GeoJSONSource | undefined
      src?.setData(data)
    }
    // The source only exists once the load handler above has run, so its absence
    // is exactly the signal that we still have to wait for it.
    if (map.getSource("stations")) apply()
    else map.once("load", apply)
  }, [data])

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Karta Bajs stanica u Zagrebu"
      className="bajs-hero-map size-full"
    />
  )
}
