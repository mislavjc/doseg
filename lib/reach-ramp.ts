import type { ExpressionSpecification } from "maplibre-gl"

/**
 * Reach (isochrone) ramp, near → far — docs/map-redesign-spec.md §1.
 * Near end matches --navy / --rank-100; the far end stays a visible pale blue
 * (not the rank-0 near-white) so the reach edge reads over the basemap.
 */
export const REACH_RAMP = [
  "#0e3fb0",
  "#335dbd",
  "#6e90d6",
  "#94abdf",
  "#a4b8e4",
  "#c9d6f0",
  "#dbe4f7",
] as const

/** MapLibre color expression over the walk-area `time` property (seconds). */
export function reachColorStops(maxSeconds: number): ExpressionSpecification {
  const stops: Array<number | string> = []
  REACH_RAMP.forEach((color, i) => {
    stops.push((maxSeconds * i) / (REACH_RAMP.length - 1), color)
  })
  return [
    "interpolate",
    ["linear"],
    ["get", "time"],
    ...stops,
  ] as ExpressionSpecification
}
