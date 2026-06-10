import type { POICategory } from "./overpass"

/** The POI categories the map UI surfaces (subset of lib/overpass kinds). */
export type MapPoiCategory = Extract<POICategory, "hospital" | "school" | "park">

/**
 * Single source for POI category UI — sidebar "u dosegu" rows, the Slojevi
 * panel, and any legend. Color classes map to the --poi-* tokens.
 */
export const POI_CATEGORIES: {
  key: MapPoiCategory
  label: string
  colorClass: string
}[] = [
  { key: "hospital", label: "Bolnice", colorClass: "bg-poi-hospital" },
  { key: "school", label: "Škole", colorClass: "bg-poi-school" },
  { key: "park", label: "Parkovi", colorClass: "bg-poi-park" },
]

/**
 * Geocode result kind → autocomplete dot + croatian label (spec §7).
 * Streets share the school blue per the Paper design.
 */
export const GEOCODE_KIND_META: Record<
  string,
  { dotClass: string; label: string }
> = {
  hospital: { dotClass: "bg-poi-hospital", label: "bolnica" },
  school: { dotClass: "bg-poi-school", label: "škola" },
  park: { dotClass: "bg-poi-park", label: "park" },
  street: { dotClass: "bg-poi-school", label: "ulica" },
  address: { dotClass: "bg-ink-faint", label: "adresa" },
  place: { dotClass: "bg-ink-faint", label: "mjesto" },
}
