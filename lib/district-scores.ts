import { join } from "node:path"

import { getDataDir } from "@/lib/data-dir"
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
export function loadScores(): ScoreData | null {
  const dir = getDataDir()
  const day = readJsonCached<ScoreData>(join(dir, "district-scores-wednesday.json"))
  const base = readJsonCached<ScoreData>(join(dir, "district-scores.json"))
  if (!day) {
    if (base) {
      console.error(
        "district-scores: day-filtered build missing; serving LEGACY POOLED data with known-fake headways. Fix the data files."
      )
    }
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
