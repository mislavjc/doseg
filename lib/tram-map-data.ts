import { join } from "node:path"

import { getDataDir } from "@/lib/data-dir"
import type { TramMapNetwork } from "@/lib/generated/TramMapNetwork"
import { readJsonCached } from "@/lib/page-data"
import { resolveStopSlugs } from "@/lib/stop-data"
import type { TramMapLayout } from "@/lib/tram-map-layout"

/**
 * The /karta-tramvaja schematic: the drawn layout (scripts/build-tram-map.ts)
 * joined with the OTP topology it was drawn from (transit crate, --tram-map).
 */

export interface TramMapLine {
  broj: string
  isNight: boolean
  terminals: [string, string]
  d: string
  /** Station ids from terminal to terminal. */
  stations: Array<string>
}

export interface TramMapData {
  viewBox: TramMapLayout["viewBox"]
  lineWidth: number
  river: TramMapLayout["river"]
  stations: TramMapLayout["stations"]
  lines: Array<TramMapLine>
  /** Station id to its /stanice page slug, where one exists. */
  slugs: Record<string, string>
}

export function loadTramMap(): TramMapData {
  const dir = join(getDataDir(), "karta-tramvaja")
  const layout = readJsonCached<TramMapLayout>(join(dir, "layout.json"))
  const network = readJsonCached<TramMapNetwork>(join(dir, "network.json"))
  if (!layout || !network) {
    throw new Error(
      "data/karta-tramvaja missing: run the transit crate with --tram-map, then scripts/build-tram-map.ts"
    )
  }
  const byName = resolveStopSlugs(network.stations)
  const slugs: Record<string, string> = {}
  for (const s of network.stations) {
    const slug = byName[s.name]
    if (slug) {
      slugs[s.id] = slug
    }
  }
  const order = new Map(network.lines.map((l) => [l.broj, l.stations]))
  return {
    viewBox: layout.viewBox,
    lineWidth: layout.lineWidth,
    river: layout.river,
    stations: layout.stations,
    lines: layout.lines.map(({ broj, isNight, terminals, d }) => ({
      broj,
      isNight,
      terminals,
      d,
      stations: order.get(broj) ?? [],
    })),
    slugs,
  }
}
