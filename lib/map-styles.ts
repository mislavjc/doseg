import type { Map as MapLibreMap } from "maplibre-gl"

/** Single basemap — Carto Positron (light, MapLibre-compatible vector tiles). */
export const DEFAULT_MAP_STYLE = "positron" as const
export type MapStyleId = typeof DEFAULT_MAP_STYLE

export function getMapStyleUrl(_id: MapStyleId = DEFAULT_MAP_STYLE): string {
  return "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
}

/** Subtle tint behind vector tiles so the UI matches the light shell. */
export function applyBasemapBackgroundTint(map: MapLibreMap, _id: MapStyleId) {
  if (!map.getLayer("background")) return
  map.setPaintProperty("background", "background-color", "#f1f5f9")
}
