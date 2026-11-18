import type { Map as MapLibreMap } from "maplibre-gl"

/** Single basemap — Carto Positron (light, MapLibre-compatible vector tiles). */
export const MAP_STYLE_URL =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"

/** Subtle tint behind vector tiles so the UI matches the light shell. */
export function applyBasemapBackgroundTint(map: MapLibreMap) {
  if (!map.getLayer("background")) return
  map.setPaintProperty("background", "background-color", "#f1f5f9")
}
