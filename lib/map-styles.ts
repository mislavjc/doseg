import type { Map as MapLibreMap } from "maplibre-gl"

/** Single basemap — Carto Positron (light, MapLibre-compatible vector tiles). */
export const MAP_STYLE_URL =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"

/** The /karta map's opening view (lon, lat) and zoom. */
export const KARTA_CENTER: [number, number] = [15.9819, 45.815]
export const KARTA_ZOOM = 12.4

/**
 * The placeholder under the map is baked at this whole 256 px tile zoom and
 * drawn at this many css px per baked pixel, which puts it on the same scale
 * as MapLibre's 512 px tiles at KARTA_ZOOM.
 */
export const KARTA_PLACEHOLDER_ZOOM = 13
export const KARTA_PLACEHOLDER_SCALE = 2 ** (KARTA_ZOOM + 1 - KARTA_PLACEHOLDER_ZOOM)

/** Subtle tint behind vector tiles so the UI matches the light shell. */
export function applyBasemapBackgroundTint(map: MapLibreMap) {
  if (!map.getLayer("background")) return
  map.setPaintProperty("background", "background-color", "#f1f5f9")
}
