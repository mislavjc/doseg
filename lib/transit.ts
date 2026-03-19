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

export function modeColor(mode: string): string {
  return TRANSIT_MODES[mode as TransitMode]?.color ?? "#64748b"
}

export function modeSpeed(mode: string): number {
  return TRANSIT_MODES[mode as TransitMode]?.speed ?? 16
}

export function modeLabel(mode: string): string {
  return TRANSIT_MODES[mode as TransitMode]?.label ?? mode
}
