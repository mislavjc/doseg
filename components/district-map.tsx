"use client"

import { useEffect, useRef } from "react"
import maplibregl from "maplibre-gl"

export default function DistrictMap({
  geojson,
}: {
  geojson: GeoJSON.FeatureCollection
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style:
        "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [15.98, 45.815],
      zoom: 10.5,
      attributionControl: false,
    })

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right"
    )

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: "district-popup",
      offset: 12,
    })

    let hoveredOsmId: number | null = null

    map.on("load", () => {
      map.addSource("districts", { type: "geojson", data: geojson })

      map.addLayer({
        id: "district-fill",
        type: "fill",
        source: "districts",
        paint: {
          "fill-color": [
            "interpolate",
            ["linear"],
            ["get", "score"],
            0,
            "#9333ea",
            25,
            "#2563eb",
            50,
            "#0891b2",
            100,
            "#16a34a",
          ],
          "fill-opacity": 0.35,
        },
      })

      map.addLayer({
        id: "district-line",
        type: "line",
        source: "districts",
        paint: {
          "line-color": "rgba(255,255,255,0.15)",
          "line-width": 1,
        },
      })

      map.addLayer({
        id: "district-labels",
        type: "symbol",
        source: "districts",
        layout: {
          "text-field": [
            "concat",
            ["get", "name"],
            "\n",
            ["to-string", ["get", "score"]],
          ],
          "text-size": 11,
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Regular"],
          "text-line-height": 1.5,
          "text-anchor": "center",
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "rgba(255,255,255,0.6)",
          "text-halo-color": "rgba(20,20,28,0.9)",
          "text-halo-width": 1.5,
        },
      })

      // Fit bounds
      const bounds = new maplibregl.LngLatBounds()
      for (const f of geojson.features) {
        const geom = f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon
        const rings =
          geom.type === "Polygon"
            ? geom.coordinates
            : geom.coordinates.map((c) => c[0])
        for (const ring of rings) {
          for (const coord of ring) {
            bounds.extend(coord as [number, number])
          }
        }
      }
      map.fitBounds(bounds, { padding: 20 })
    })

    map.on("mousemove", "district-fill", (e) => {
      if (!e.features?.length) return
      const f = e.features[0]
      const osmId = f.properties!.osmId as number

      if (hoveredOsmId !== osmId) {
        hoveredOsmId = osmId
        map.setPaintProperty("district-fill", "fill-opacity", [
          "case",
          ["==", ["get", "osmId"], osmId],
          0.6,
          0.2,
        ])
        map.setPaintProperty("district-line", "line-width", [
          "case",
          ["==", ["get", "osmId"], osmId],
          2,
          1,
        ])
        map.setPaintProperty("district-line", "line-color", [
          "case",
          ["==", ["get", "osmId"], osmId],
          "rgba(255,255,255,0.4)",
          "rgba(255,255,255,0.15)",
        ])
      }

      map.getCanvas().style.cursor = "pointer"
      const pop = f.properties!.population
        ? `<span class="pop">${Number(f.properties!.population).toLocaleString("hr-HR")} stanovnika</span>`
        : ""
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<strong>${f.properties!.name}</strong>` +
            `<span class="score">${f.properties!.score}/100</span>` +
            `<span class="detail">${f.properties!.reachPct}% grada dostupno za ${f.properties!.maxMinutes} min</span>` +
            pop
        )
        .addTo(map)
    })

    map.on("mouseleave", "district-fill", () => {
      hoveredOsmId = null
      map.getCanvas().style.cursor = ""
      map.setPaintProperty("district-fill", "fill-opacity", 0.35)
      map.setPaintProperty("district-line", "line-width", 1)
      map.setPaintProperty(
        "district-line",
        "line-color",
        "rgba(255,255,255,0.15)"
      )
      popup.remove()
    })

    return () => map.remove()
  }, [geojson])

  return (
    <div
      ref={containerRef}
      className="h-[350px] w-full overflow-hidden rounded-xl ring-1 ring-white/[0.06] sm:h-[420px]"
    />
  )
}
