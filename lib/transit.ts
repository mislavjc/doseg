/** Shared transit mode configuration. Single source of truth. */
export const TRANSIT_MODES = {
  WALK: { label: "Hodanje", color: "#94a3b8", speed: 5 },
  BIKE: { label: "BAJS", color: "#f59e0b", speed: 14 },
  BUS: { label: "Bus", color: "#2563eb", speed: 16 },
  TRAM: { label: "Tramvaj", color: "#e11d48", speed: 18 },
  RAIL: { label: "Vlak", color: "#0d9488", speed: 40 },
  SUBWAY: { label: "Metro", color: "#7c3aed", speed: 35 },
  FERRY: { label: "Trajekt", color: "#0284c7", speed: 15 },
} as const

export type TransitMode = keyof typeof TRANSIT_MODES

/** Isochrone band colors — time ramp for map layers and OG images. */
export const ISOCHRONE_COLORS = [
  "#1a7a52",
  "#16949e",
  "#2d7ec4",
  "#7b68b8",
] as const

/** District score → color for maps and OG images. */
export function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e"
  if (score >= 60) return "#84cc16"
  if (score >= 40) return "#eab308"
  if (score >= 20) return "#f97316"
  return "#ef4444"
}

export function modeColor(mode: string): string {
  return TRANSIT_MODES[mode as TransitMode]?.color ?? "#64748b"
}

export function modeSpeed(mode: string): number {
  return TRANSIT_MODES[mode as TransitMode]?.speed ?? 16
}

export function modeLabel(mode: string): string {
  return TRANSIT_MODES[mode as TransitMode]?.label ?? mode
}
