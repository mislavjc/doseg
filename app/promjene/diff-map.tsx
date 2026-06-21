"use client"

import { useEffect, useRef, useState } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { getMapStyleUrl } from "@/lib/map-styles"
import { MapTile, MapTileButton } from "@/components/home/ui/controls"
import { expandStop, INK, OLD, BLUE, KEPT } from "./lib"

/**
 * PROTOTYPE — interactive diff map on real CARTO Positron vector tiles. The
 * basemap is muted (POIs hidden, labels faded, paper tint) so the two routes are
 * the only saturated thing. Retired route = dotted slate on a white track,
 * current route = blue on a white casing. Crisp at any zoom; cooperative scroll
 * so the page still scrolls past it.
 */

// Central icons (square-outlined-radius-0-stroke-2): flag = new terminus,
// ban-sign (circle + slash) = discontinued terminus.
const FLAG = "M5 21V15M5 15V3H20L16 9L20 15H5Z"
const BAN = "M21 12C21 16.9706 16.9706 21 12 21C9.51472 21 7.26472 19.9926 5.63604 18.364C4.00736 16.7353 3 14.4853 3 12C3 7.02944 7.02944 3 12 3C14.4853 3 16.7353 4.00736 18.364 5.63604C19.9926 7.26472 21 9.51472 21 12Z M18 6L6 18"
type LonLat = [number, number]
type Pt = { lat: number; lon: number; name: string }


const fcLine = (coords: LonLat[]) => ({ type: "FeatureCollection" as const, features: [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: coords } }] })
const fcPts = (pts: Pt[]) => ({ type: "FeatureCollection" as const, features: pts.map((p) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] } })) })
/** zoom-interpolated number */
const Z = (a: number, b: number, c: number): maplibregl.ExpressionSpecification => ["interpolate", ["linear"], ["zoom"], 11, a, 14, b, 16, c]

function muteBasemap(map: maplibregl.Map) {
  if (map.getLayer("background")) map.setPaintProperty("background", "background-color", "#F6F7F9")
  for (const l of map.getStyle().layers ?? []) {
    try {
      if (/poi|airport|housenum|aeroway|ferry/i.test(l.id)) { map.setLayoutProperty(l.id, "visibility", "none"); continue }
      if (l.type === "symbol") { map.setPaintProperty(l.id, "text-opacity", 0.6); map.setPaintProperty(l.id, "icon-opacity", 0) }
      if (l.id === "water") map.setPaintProperty(l.id, "fill-color", "#E7EDF3")
      if (/^(park|landcover|wood|grass|wetland)/i.test(l.id) && l.type === "fill") map.setPaintProperty(l.id, "fill-opacity", 0.5)
    } catch { /* layer lacks that property — fine */ }
  }
}

function endpointMarker(map: maplibregl.Map, p: Pt, kind: "shared" | "new" | "old" | "old-origin", centerLon: number) {
  // Icon lives inside the name pill; the pill is offset from the point so the
  // station dot already on the line marks the exact spot.
  const onRight = p.lon > centerLon
  const isNew = kind === "new", isOld = kind === "old", slate = isOld || kind === "old-origin"
  const fg = isNew ? "#fff" : slate ? OLD : INK
  const pill = document.createElement("div")
  pill.style.cssText = `display:inline-flex;align-items:center;gap:6px;padding:5px 10px;white-space:nowrap;pointer-events:none;color:${fg};font-family:'TeX Gyre Heros',system-ui,sans-serif;font-weight:${slate ? 600 : 700};font-size:16px;line-height:17px;` +
    (isNew ? `background:${BLUE};box-shadow:0 1px 3px rgba(15,23,42,.2)` : `background:#fff;box-shadow:inset 0 0 0 1px ${slate ? "#C5CAD1" : "#C2C7CD"},0 1px 3px rgba(15,23,42,.16)`)
  const path = isNew ? FLAG : isOld ? BAN : null
  if (path) {
    const ic = document.createElement("span")
    ic.style.cssText = `display:flex;flex:0 0 auto;color:${fg}`
    ic.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="${path}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    pill.appendChild(ic)
  }
  const t = document.createElement("span")
  t.textContent = expandStop(p.name)
  pill.appendChild(t)
  new maplibregl.Marker({ element: pill, anchor: onRight ? "right" : "left", offset: onRight ? [-12, 0] : [12, 0] }).setLngLat([p.lon, p.lat]).addTo(map)
}

export function DiffMap({ oldShape, newShape, shared, newTip, oldTip, allStops, added, removed, mode = "diff", change = "terminus", stopConnected = false, label }: {
  oldShape: LonLat[]; newShape: LonLat[]; shared: Pt; newTip: Pt; oldTip: Pt; allStops: Pt[]; added: Pt[]; removed: Pt[]; mode?: "diff" | "new" | "removed"; change?: "terminus" | "midroute"; stopConnected?: boolean; label?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const bounds = new maplibregl.LngLatBounds()
    for (const [lon, lat] of [...oldShape, ...newShape]) bounds.extend([lon, lat])

    const map = new maplibregl.Map({
      container: ref.current,
      style: getMapStyleUrl(),
      center: bounds.getCenter(),
      zoom: 11,
      attributionControl: false,
      cooperativeGestures: true,
      dragRotate: false,
      locale: {
        "CooperativeGesturesHandler.WindowsHelpText": "Ctrl + scroll za zum karte",
        "CooperativeGesturesHandler.MacHelpText": "⌘ + scroll za zum karte",
        "CooperativeGesturesHandler.MobileHelpText": "Dodirni s dva prsta za pomicanje",
      },
    })
    map.touchZoomRotate.disableRotation()
    mapRef.current = map
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left")

    const fit = () => {
      const w = map.getContainer().clientWidth
      const pad = Math.max(26, Math.min(86, w * 0.1))
      map.fitBounds(bounds, { padding: { top: pad * 0.85, bottom: pad + 16, left: pad, right: pad }, maxZoom: 15.5, duration: 0 })
    }

    map.on("load", () => {
      muteBasemap(map)
      const addedNames = new Set(added.map((s) => s.name))
      const kept = allStops.filter((s) => !addedNames.has(s.name))
      map.addSource("old", { type: "geojson", data: fcLine(oldShape) })
      map.addSource("new", { type: "geojson", data: fcLine(newShape) })
      map.addSource("kept", { type: "geojson", data: fcPts(kept) })
      map.addSource("removed", { type: "geojson", data: fcPts(removed) })
      map.addSource("added", { type: "geojson", data: fcPts(added) })

      const round = { "line-cap": "round" as const, "line-join": "round" as const }
      // retired: white track + slate dots
      map.addLayer({ id: "old-casing", type: "line", source: "old", paint: { "line-color": "#fff", "line-width": Z(5, 8.5, 10.5), "line-blur": 0.4 }, layout: round })
      map.addLayer({ id: "old-line", type: "line", source: "old", paint: { "line-color": OLD, "line-width": Z(3, 4.5, 5.5), "line-dasharray": [0, 2.2], "line-opacity": 0.92 }, layout: round })
      // current route. Real GTFS shape = bold solid blue on a white casing; a
      // stop-connected schematic = thinner dashed blue, so it reads as "just
      // joins the stops, approximate" and can't be mistaken for a surveyed road.
      const newCasing = stopConnected ? Z(5, 8, 10) : Z(6.5, 11.5, 14.5)
      const newWidth = stopConnected ? Z(2.6, 4, 5) : Z(3.5, 6, 7.5)
      map.addLayer({ id: "new-casing", type: "line", source: "new", paint: { "line-color": "#fff", "line-width": newCasing, "line-blur": 0.4 }, layout: round })
      const newPaint: maplibregl.LineLayerSpecification["paint"] = { "line-color": BLUE, "line-width": newWidth }
      if (stopConnected) newPaint!["line-dasharray"] = [1.8, 1.3]
      map.addLayer({ id: "new-line", type: "line", source: "new", paint: newPaint, layout: round })
      // every station: white halo under each, then the ringed dot.
      // kept = hollow gray · removed = hollow slate · added = solid blue (on top)
      const halo = (id: string, src: string) => map.addLayer({ id, type: "circle", source: src, paint: { "circle-radius": Z(3.6, 5.2, 6.6), "circle-color": "#fff" } })
      halo("kept-halo", "kept"); map.addLayer({ id: "kept-dots", type: "circle", source: "kept", paint: { "circle-radius": Z(2.4, 3.6, 4.6), "circle-color": "#fff", "circle-stroke-color": KEPT, "circle-stroke-width": 2 } })
      halo("removed-halo", "removed"); map.addLayer({ id: "removed-dots", type: "circle", source: "removed", paint: { "circle-radius": Z(2.4, 3.6, 4.6), "circle-color": "#fff", "circle-stroke-color": OLD, "circle-stroke-width": 2 } })
      halo("added-halo", "added"); map.addLayer({ id: "added-dots", type: "circle", source: "added", paint: { "circle-radius": Z(2.8, 4.2, 5.2), "circle-color": BLUE, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } })

      const cl = bounds.getCenter().lng
      // On loop lines the origin and terminus are the same stop, so the plain
      // origin pill would stack under the icon pill. Drop it when they coincide.
      const near = (a: Pt, b: Pt) => {
        const dx = (a.lon - b.lon) * Math.cos((a.lat * Math.PI) / 180) * 111320
        const dy = (a.lat - b.lat) * 110540
        return Math.hypot(dx, dy) < 220
      }
      if (mode === "removed") {
        endpointMarker(map, oldTip, "old", cl)
        if (!near(shared, oldTip)) endpointMarker(map, shared, "old-origin", cl)
      } else if (mode === "new") {
        endpointMarker(map, newTip, "new", cl)
        if (!near(shared, newTip)) endpointMarker(map, shared, "shared", cl)
      } else if (change === "midroute") {
        // termini unchanged — both ends are plain labels; the reroute shows as the
        // diverging blue/slate paths + the added/removed station dots in between.
        endpointMarker(map, shared, "shared", cl)
        if (!near(shared, newTip)) endpointMarker(map, newTip, "shared", cl)
      } else {
        endpointMarker(map, oldTip, "old", cl)
        endpointMarker(map, newTip, "new", cl)
        if (!near(shared, oldTip) && !near(shared, newTip)) endpointMarker(map, shared, "shared", cl)
      }
      fit()
    })

    const ro = new ResizeObserver(() => map.resize())
    ro.observe(ref.current)
    return () => { ro.disconnect(); mapRef.current = null; map.remove() }
  }, [oldShape, newShape, shared, newTip, oldTip, allStops, added, removed, mode, change, stopConnected])

  return (
    <div role="img" aria-label={label} style={{ position: "relative", width: "100%", height: "clamp(360px, 44vw, 580px)", overflow: "hidden" }}>
      <div ref={ref} className="diffmap" style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 0 1px #E5E8EC, inset 0 0 60px rgba(15,23,42,.05)" }} />
      <MapTile className="absolute bottom-3 right-3 z-[2] flex flex-col">
        <MapTileButton label="Približi kartu" onClick={() => mapRef.current?.zoomIn()} className="size-[34px] border-b border-hairline font-heros text-[18px] leading-[22px] text-ink-2">+</MapTileButton>
        <MapTileButton label="Udalji kartu" onClick={() => mapRef.current?.zoomOut()} className="size-[34px] font-heros text-[18px] leading-[22px] text-ink-2">−</MapTileButton>
      </MapTile>
    </div>
  )
}

type DiffMapProps = Parameters<typeof DiffMap>[0]

/**
 * Mounts the live MapLibre map only while it's near the viewport and unmounts it
 * once far away. Each map holds a WebGL context and browsers cap those at ~16, so
 * a page with many before/after maps would otherwise lose contexts; this keeps
 * only the few maps around the viewport alive.
 */
export function LazyDiffMap(props: DiffMapProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { rootMargin: "500px 0px" })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} style={{ position: "relative", width: "100%", height: "clamp(360px, 44vw, 580px)" }}>
      {active ? (
        <DiffMap {...props} />
      ) : (
        <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 0 1px #E5E8EC, inset 0 0 60px rgba(15,23,42,.05)", background: "#F6F7F9" }} />
      )}
    </div>
  )
}
