/**
 * Mode-color map — docs/map-redesign-spec.md §1 (LOCK, single source).
 * Keyed by GTFS/OTP mode. Replaces lib/transit.ts `modeColor` when /new ships.
 */
export const MODE_COLORS = {
  walk: "#9aa0a6",
  tram: "#0e51c9",
  bus: "#5b7fcf",
  rail: "#2ba88a",
  bike: "#e8883c",
} as const

/** Lighter walk band used inside the journey strip (walks are connectors). */
export const WALK_BAND = "#d2d7de"

/** POI palette — must match --poi-* tokens in globals.css (spec §1). */
export const POI_COLORS = {
  hospital: "#e05b4f",
  school: "#3d7bd9",
  park: "#3fa76b",
} as const

export function modeColorFor(otpMode: string): string {
  switch (otpMode.toUpperCase()) {
    case "TRAM":
      return MODE_COLORS.tram
    case "BUS":
      return MODE_COLORS.bus
    case "RAIL":
    case "TRAIN":
      return MODE_COLORS.rail
    case "BICYCLE":
    case "BIKE":
      return MODE_COLORS.bike
    default:
      return MODE_COLORS.walk
  }
}

export function isWalkMode(otpMode: string): boolean {
  const m = otpMode.toUpperCase()
  return m === "WALK" || m === "TRANSFER"
}

export function isBikeMode(otpMode: string): boolean {
  const m = otpMode.toUpperCase()
  return m === "BIKE" || m === "BICYCLE"
}

/**
 * Distinct colors for the transit lines within one itinerary — the journey
 * strip, leg list, and map polylines all share them so each line is
 * traceable from sidebar to map. Walks stay grey.
 */
export const LINE_PALETTE = [
  "#0e51c9", // zg-blue
  "#2ba88a", // rail green
  "#7b68b8", // purple
  "#e05b4f", // red
  "#16949e", // teal
] as const // amber (#e8883c) is reserved for BAJS legs

/** Color per leg: same line → same color, new line → next palette slot.
 *  Walks stay grey; BAJS legs always get the brand amber (matches the map). */
export function legLineColors(
  legs: { mode: string; route?: string }[]
): string[] {
  const byLine = new Map<string, string>()
  return legs.map((leg) => {
    if (isWalkMode(leg.mode)) return MODE_COLORS.walk
    if (isBikeMode(leg.mode)) return MODE_COLORS.bike
    const key = `${leg.mode.toUpperCase()}:${leg.route ?? ""}`
    let color = byLine.get(key)
    if (!color) {
      color = LINE_PALETTE[byLine.size % LINE_PALETTE.length]
      byLine.set(key, color)
    }
    return color
  })
}
