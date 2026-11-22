import type { Network } from "./graph"
import type { TramMapLayout } from "@/lib/tram-map-layout"
import type { TramMapNetwork } from "@/lib/generated/TramMapNetwork"

/**
 * Hard topology checks: every GTFS station is drawn exactly once, and every
 * line's skeleton walk visits its stations in GTFS order. Any error fails
 * the build instead of writing a layout.
 */
export function validateLayout(
  raw: TramMapNetwork,
  layout: TramMapLayout,
  net: Network
): Array<string> {
  const errors: Array<string> = []
  const drawn = new Set(layout.stations.map((s) => s.id))
  for (const s of raw.stations) {
    if (!drawn.has(s.id)) {
      errors.push(`station ${s.name} (${s.id}) is missing from the map`)
    }
  }
  if (drawn.size !== layout.stations.length) {
    errors.push("a station is drawn twice")
  }
  for (const line of raw.lines) {
    const steps = net.lineChains.get(line.broj) ?? []
    const walk: Array<string> = []
    for (const { chain, forward } of steps) {
      const c = net.chains[chain]
      const seq = [c.a, ...c.mids, c.b].map((i) => net.stations[i].id)
      const ordered = forward ? seq : seq.toReversed()
      walk.push(...(walk.length === 0 ? ordered : ordered.slice(1)))
    }
    if (walk.join(">") !== line.stations.join(">")) {
      errors.push(`line ${line.broj}: drawn order differs from GTFS`)
    }
    if (!layout.lines.some((l) => l.broj === line.broj && l.d.length > 0)) {
      errors.push(`line ${line.broj} has no path`)
    }
  }
  return errors
}
