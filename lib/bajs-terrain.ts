import type { BajsRanking } from "./bajs-rides"
import { districtAt } from "./district-at"

/**
 * Rides folded from stations up to kvartovi, for the 3D terrain on /bajs.
 *
 * The terrain reuses `app/statistika/editorial/terrain-view.tsx`, which extrudes
 * the districts of `public/district-map.svg` by a 0–100 value. So the job here
 * is to turn per-station ride rates into exactly that: one number per kvart,
 * scaled against the busiest one, on the same scale the connectivity scores use.
 *
 * Server-only, because `districtAt` reads the geojson off disk.
 */

export type KvartRides = {
  name: string
  /** Rides per day started in this kvart, summed over its stations. */
  rides: number
  stations: number
  /** Share of the city's rides, 0–1. */
  share: number
  /** Height/colour driver: rides against the busiest kvart, 0–100. */
  value: number
}

export type BajsTerrain = {
  kvartovi: KvartRides[]
  /** Keyed by kvart name, the shape `TerrainView` wants. */
  values: Record<string, number>
  /** Stations whose coordinates fall outside every kvart polygon. */
  unplaced: number
}

export function buildBajsTerrain(ranking: BajsRanking | null): BajsTerrain | null {
  if (!ranking || ranking.all.length === 0) return null

  const totals = new Map<string, { rides: number; stations: number }>()
  let unplaced = 0

  for (const s of ranking.all) {
    const name = districtAt(s.lat, s.lon)
    if (!name) {
      unplaced++
      continue
    }
    const cur = totals.get(name) ?? { rides: 0, stations: 0 }
    // Per-day rates, not window totals: the measured window is still growing,
    // and a total would quietly change meaning every day it runs.
    cur.rides += s.startsPerDay
    cur.stations++
    totals.set(name, cur)
  }
  if (totals.size === 0) return null

  const cityRides = [...totals.values()].reduce((n, t) => n + t.rides, 0)
  const busiest = Math.max(...[...totals.values()].map((t) => t.rides))

  const kvartovi = [...totals.entries()]
    .map(([name, t]) => ({
      name,
      rides: t.rides,
      stations: t.stations,
      share: cityRides > 0 ? t.rides / cityRides : 0,
      value: busiest > 0 ? (t.rides / busiest) * 100 : 0,
    }))
    .sort((a, b) => b.rides - a.rides)

  return {
    kvartovi,
    values: Object.fromEntries(kvartovi.map((k) => [k.name, k.value])),
    unplaced,
  }
}
