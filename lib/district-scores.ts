import { join } from "node:path"

import { getDataDir } from "@/lib/data-dir"
import { KM_PER_DEG_LAT, KM_PER_DEG_LON } from "@/lib/geo"
import type { DistrictScoresOutput as ScoreData } from "@/lib/generated"
import { readJsonCached } from "@/lib/page-data"

/**
 * Canonical weekday district-scores loader, shared by /statistika, /kvartovi,
 * the OG cards, and /api/district-context so every surface shows the SAME
 * numbers.
 *
 * The legacy `district-scores.json` is built WITHOUT a --day filter, so ~7
 * service days pile up at the same clock time: the median headway collapses to a
 * fake "~1 min" (a kvart then reads "radnim danom ~1 min, vikendom ~12 min" —
 * impossible) and the reach/score roughly double. We serve the day-filtered
 * weekday build instead, backfilling only the day-INDEPENDENT spatial fields
 * (area, BAJS density/coverage) that the older day build predates. Falls back to
 * the legacy file if the day build is missing. Both reads are cached per path by
 * readJsonCached and the `??=` backfill is idempotent, so the repeated merge is
 * cheap.
 */
/**
 * Reachable grid cells → km², rounded.
 *
 * NOT gridSpacingM². That field is the spacing of the sample ORIGIN points
 * (`--grid-m`, transit/src/main.rs); the reachable cells it counts are bucketed
 * by a different, hardcoded lat/lon grid — GRID_CELL_SIZE = 0.002 DEGREES in
 * transit/src/walk_graph.rs. Degrees are not square: at Zagreb's latitude that
 * cell is 222.6 m north-south but only 155.2 m east-west, so its true area is
 * 0.0346 km², not the 0.04 the two-hundred-metre reading implies.
 *
 * Caveat on what this measures: a cell counts if ANY walk node inside it was
 * reached, so the result is an upper bound on genuinely covered area, and it
 * overstates most where the walk network is sparse (one lane through a field
 * claims the full 3.5 ha). Fine for comparing districts, not a land-cover figure.
 *
 * Keep these mirrored with transit/src/geo.rs.
 */
const REACH_CELL_DEG = 0.002 // walk_graph.rs GRID_CELL_SIZE
const REACH_CELL_KM2 = REACH_CELL_DEG * KM_PER_DEG_LAT * (REACH_CELL_DEG * KM_PER_DEG_LON)

export function reachKm2(_scores: ScoreData, cells: number): number {
  return Math.round(cells * REACH_CELL_KM2)
}

export function loadScores(): ScoreData | null {
  const dir = getDataDir()
  const day = readJsonCached<ScoreData>(join(dir, "district-scores-wednesday.json"))
  const base = readJsonCached<ScoreData>(join(dir, "district-scores.json"))
  if (!day) {
    console.error(
      base
        ? "district-scores: day-filtered build missing; serving LEGACY POOLED data with known-fake headways. Fix the data files."
        : "district-scores: no district data files found; district surfaces will render empty."
    )
    return base
  }
  if (base) {
    day.bajsStopCoveragePct ??= base.bajsStopCoveragePct
    day.bajsCoveredStops ??= base.bajsCoveredStops
    const baseByName = new Map(base.districts.map((d) => [d.name, d]))
    for (const d of day.districts) {
      const b = baseByName.get(d.name)
      if (!b) continue
      d.areaKm2 ??= b.areaKm2
      d.bajsDensityPerKm2 ??= b.bajsDensityPerKm2
      d.bajsPer10k ??= b.bajsPer10k
      d.bajsStopCoveragePct ??= b.bajsStopCoveragePct
    }
  }
  return day
}
