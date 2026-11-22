/**
 * The schematic tram map as drawn: written by scripts/build-tram-map.ts to
 * data/karta-tramvaja/layout.json from the OTP topology in network.json.
 * Coordinates are map units, 1 unit = 1 CSS px at 1x zoom.
 */

export interface TramMapMark {
  x1: number
  y1: number
  x2: number
  y2: number
  /** Line colour for ticks and terminal bars; interchanges are drawn in ink. */
  broj: string | null
}

export interface TramMapStationLayout {
  id: string
  name: string
  x: number
  y: number
  kind: "tick" | "interchange" | "terminal"
  lines: Array<string>
  mark: TramMapMark
  /** Baseline-left of the 16px Heros label, and its width. */
  label: { x: number; y: number; w: number }
  oneWay: Array<{ broj: string; towards: string }>
}

export interface TramMapLayout {
  viewBox: [number, number, number, number]
  lineWidth: number
  lines: Array<{
    broj: string
    isNight: boolean
    terminals: [string, string]
    d: string
  }>
  stations: Array<TramMapStationLayout>
  river: { d: string; width: number }
  /** Optimizer state, so a re-run can refine the committed layout. */
  skeleton: {
    nodes: Record<string, [number, number]>
    bends: Record<string, 0 | 1>
    river: [number, number, number]
  }
  score: Record<string, number>
}
