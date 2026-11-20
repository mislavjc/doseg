import { formatHrDate } from "@/lib/hr-date"

import type { DistrictScore, ScoreData } from "../stat-data"
import { fmtHR } from "@/lib/format"
import { fmtPop } from "../stat-data"

/**
 * Editorial facts derived from the score data for the static narrative sections
 * (Phase 5). Numbers only — district names stay as hand-written copy so Croatian
 * declensions ("iz Podsljemena") read correctly. Verified against live data:
 * 7,4× · 95,6/12,8 km² · 4% · Sesvete 70.800/313/17.
 */

// 200 m raster ⇒ each reachable grid cell is 0.2 × 0.2 = 0.04 km².
const CELL_KM2 = 0.04

function rankBy(
  districts: Array<DistrictScore>,
  name: string,
  value: (d: DistrictScore) => number
): number {
  return (
    districts
      .toSorted((a, b) => value(b) - value(a))
      .findIndex((d) => d.name === name) + 1
  )
}

export function computeEditorialFacts(data: ScoreData) {
  const ds = data.districts
  const best = ds[0]
  const worst = ds[ds.length - 1]
  const totalPop = ds.reduce((s, d) => s + (d.population ?? 0), 0)

  // "X times less" — truncate, not round, so the claim is never overstated
  // (7.47 → 7,4, matching the locked design).
  const ratioRaw =
    worst.avgReachableCells > 0
      ? best.avgReachableCells / worst.avgReachableCells
      : 0
  const ratio = fmtHR(Math.floor(ratioRaw * 10) / 10, 1)

  const sesvete = ds.find((d) => d.name === "Sesvete")
  const maxPop = Math.max(...ds.map((d) => d.population ?? 0), 1)
  const maxStops = Math.max(...ds.map((d) => d.stops), 1)

  return {
    districtCount: ds.length,
    // "7,4"
    ratio,
    // "95,6"
    bestKm2: fmtHR(best.avgReachableCells * CELL_KM2, 1),
    // "12,8"
    worstKm2: fmtHR(worst.avgReachableCells * CELL_KM2, 1),
    // 4
    bestPopPct: Math.round((best.population ?? 0) / Math.max(totalPop, 1) * 100),
    sesvete: sesvete && {
      // "70.800"
      population: fmtPop(sesvete.population ?? 0),
      populationRank: rankBy(ds, "Sesvete", (d) => d.population ?? 0),
      populationBarPct: Math.round(((sesvete.population ?? 0) / maxPop) * 100),
      stops: sesvete.stops,
      stopsRank: rankBy(ds, "Sesvete", (d) => d.stops),
      stopsBarPct: Math.round((sesvete.stops / maxStops) * 100),
      score: sesvete.score,
      scoreRank: sesvete.rank,
    },
  }
}

export type EditorialFacts = ReturnType<typeof computeEditorialFacts>

const cv = (d: DistrictScore) =>
  d.avgReachableCells > 0
    ? d.stddevReachableCells / d.avgReachableCells
    : 0

/**
 * Povezanost ranking + summary stats. `spread` is the within-district
 * coefficient of variation (stddev / mean reach), normalised to [0,1] — the
 * "raspon iznutra": low = uniform access, high = uneven (centre vs edge).
 */
export function computePovezanost(data: ScoreData) {
  const ds = data.districts
  const maxCv = Math.max(...ds.map((d) => cv(d)), 1e-9)

  const rows = ds.map((d, i) => ({
    rank: i + 1,
    name: d.name,
    score: d.score,
    spread: cv(d) / maxCv,
  }))

  const totalPop = ds.reduce((s, d) => s + (d.population ?? 0), 0)
  const poorPop = ds
    .filter((d) => d.score < 25)
    .reduce((s, d) => s + (d.population ?? 0), 0)
  const avg = Math.round(
    ds.reduce((s, d) => s + d.score * (d.population ?? 0), 0) /
      Math.max(totalPop, 1)
  )
  const updated = formatHrDate(data.generatedAt)

  return {
    rows,
    total: ds.length,
    good: ds.filter((d) => d.score >= 50).length,
    avg,
    poorPct: Math.round((poorPop / Math.max(totalPop, 1)) * 100),
    updated,
  }
}

export type PovezanostData = ReturnType<typeof computePovezanost>

const SHORT_NAME: Record<string, string> = {
  "Novi Zagreb - istok": "Novi Zagreb-istok",
  "Novi Zagreb - zapad": "Novi Zagreb-zapad",
  "Peščenica - Žitnjak": "Peščenica",
  "Trešnjevka - sjever": "Trešnjevka-sj.",
  "Trešnjevka - jug": "Trešnjevka-jug",
  "Gornji grad - Medveščak": "Gornji grad",
  "Podsused - Vrapče": "Podsused",
}
const shortName = (n: string) => SHORT_NAME[n] ?? n

const m = (d: DistrictScore) => Math.round(d.avgNearestStopM)

/** Pristup — walk-to-nearest-stop: best vs city average vs worst (metres). */
export function computeWalk(data: ScoreData) {
  const ds = data.districts
  if (ds.length === 0) {return null}
  const sorted = ds.toSorted(
    (a, b) => a.avgNearestStopM - b.avgNearestStopM
  )
  const best = sorted[0]
  const worst = sorted[sorted.length - 1]
  const avg = Math.round(
    ds.reduce((s, d) => s + d.avgNearestStopM, 0) / Math.max(ds.length, 1)
  )
  return {
    best: { name: best.name, m: m(best) },
    avg,
    worst: { name: worst.name, m: m(worst) },
    maxM: m(worst),
    ratio: fmtHR(worst.avgNearestStopM / (best.avgNearestStopM || 1), 1),
  }
}
export type WalkData = NonNullable<ReturnType<typeof computeWalk>>

/** Jutro vs. večer — each district's peak→evening reach drop (%), sorted. */
export function computeEvening(data: ScoreData) {
  return data.districts
    .map((d) => ({
      name: d.name,
      short: shortName(d.name),
      drop: Math.round(d.peakOffpeakDrop),
    }))
    .toSorted((a, b) => b.drop - a.drop)
}
export type EveningRow = ReturnType<typeof computeEvening>[number]
