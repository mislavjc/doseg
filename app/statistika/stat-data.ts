import { join } from "node:path"
import { getDataDir } from "@/lib/data-dir"
import { fmtHR } from "@/lib/format"
import { readJsonCached } from "@/lib/page-data"
import type {
  District as DistrictScore,
  DistrictScoresOutput as ScoreData,
  RouteStatsOutput as RouteStats,
  RouteStatsRoute as RouteInfo,
} from "@/lib/generated"
import type { ConnectivityGap } from "./insights-section"

export type { DistrictScore, ScoreData, RouteStats, RouteInfo }

export type DistrictEmblems = Record<string, string>

// Canonical day-filtered loader lives in lib/district-scores so the OG cards and
// /api/district-context share it without importing this whole insights module.
export { loadScores } from "@/lib/district-scores"

function loadDistrictEmblems(): DistrictEmblems {
  return (
    readJsonCached<DistrictEmblems>(
      join(process.cwd(), "public", "district-emblems.json")
    ) ?? {}
  )
}

export interface TravelMatrix {
  generatedAt: string
  departureTime: string
  date: string
  districts: Array<string>
  matrix: Array<Array<number>>
  transferMatrix: Array<Array<number>>
  walkDistanceMatrix: Array<Array<number>>
}

export function loadTravelMatrix(): TravelMatrix | null {
  return readJsonCached<TravelMatrix>(join(getDataDir(), "travel-matrix.json"))
}

export function loadRouteStats(): RouteStats | null {
  return readJsonCached<RouteStats>(join(getDataDir(), "route-stats.json"))
}

export function loadSaturdayScores(): ScoreData | null {
  return readJsonCached<ScoreData>(
    join(getDataDir(), "district-scores-saturday.json")
  )
}

export function pct(cells: number, total: number): string {
  if (total === 0) {
    return "0"
  }
  const p = (cells / total) * 100
  if (p < 0.1) {
    return "<0,1"
  }
  if (p < 1) {
    return fmtHR(p, 1)
  }
  return Math.round(p).toString()
}

/** Population-weighted Gini coefficient via trapezoidal Lorenz curve. */
function computeGini(
  districts: Array<DistrictScore>,
  accessor: (d: DistrictScore) => number
): number {
  const sorted = districts
    .filter((d) => (d.population ?? 0) > 0)
    .toSorted((a, b) => accessor(a) - accessor(b))
  if (sorted.length === 0) {
    return 0
  }
  const totalPop = sorted.reduce((s, d) => s + (d.population ?? 0), 0)
  const totalWeighted = sorted.reduce(
    (s, d) => s + (d.population ?? 0) * accessor(d),
    0
  )
  if (totalPop === 0 || totalWeighted === 0) {
    return 0
  }
  let cumPop = 0
  let cumAccess = 0
  let area = 0
  let prevX = 0
  let prevY = 0
  for (const d of sorted) {
    cumPop += d.population ?? 0
    cumAccess += (d.population ?? 0) * accessor(d)
    const x = cumPop / totalPop
    const y = cumAccess / totalWeighted
    area += ((x - prevX) * (prevY + y)) / 2
    prevX = x
    prevY = y
  }
  return Math.max(0, 1 - 2 * area)
}

/** Compute weighted percentage change between two district metrics. */
function weightedPctChange(
  districts: Array<DistrictScore>,
  baseValue: (d: DistrictScore) => number,
  compValue: (d: DistrictScore) => number
): number {
  let baseW = 0
  let compW = 0
  for (const d of districts) {
    baseW += baseValue(d) * d.sampleCount
    compW += compValue(d) * d.sampleCount
  }
  return baseW > 0 ? Math.round(((compW - baseW) / baseW) * 100) : 0
}

export function computeBaseInsights(data: ScoreData) {
  const totalPop = data.districts.reduce((s, d) => s + (d.population ?? 0), 0)
  const poorDistricts = data.districts.filter((d) => d.score < 25)
  const goodDistricts = data.districts.filter((d) => d.score >= 50)
  const poorPop = poorDistricts.reduce((s, d) => s + (d.population ?? 0), 0)
  const goodPop = goodDistricts.reduce((s, d) => s + (d.population ?? 0), 0)
  const emptyDistrict: DistrictScore = {
    name: "-",
    osmId: 0,
    population: 0,
    sampleCount: 0,
    avgReachableCells: 0,
    minReachableCells: 0,
    maxReachableCells: 0,
    stddevReachableCells: 0,
    medianReachableCells: 0,
    p25ReachableCells: 0,
    p75ReachableCells: 0,
    eveningAvgReachableCells: 0,
    peakOffpeakDrop: 0,
    trainAvgReachableCells: 0,
    trainBoostPct: 0,
    bajsAvgReachableCells: 0,
    bajsBoostPct: 0,
    bajsStations: 0,
    areaKm2: 0,
    bajsDensityPerKm2: 0,
    bajsPer10k: 0,
    bajsStopCoveragePct: 0,
    desertPct: 0,
    avgNearestStopM: 0,
    bestPoint: { lat: 0, lon: 0 },
    tramLines: [],
    busLines: [],
    trainLines: [],
    stops: 0,
    medianHeadwayMin: 0,
    rank: 0,
    score: 0,
  }
  const best = data.districts.length > 0 ? data.districts[0] : emptyDistrict
  const worst =
    data.districts.length > 0
      ? data.districts[data.districts.length - 1]
      : emptyDistrict
  const bestPct = pct(best.avgReachableCells, data.totalGridCells)
  const worstPct = pct(worst.avgReachableCells, data.totalGridCells)
  const ratio =
    worst.avgReachableCells > 0
      ? Math.round(best.avgReachableCells / worst.avgReachableCells)
      : Infinity
  const generatedLabel = new Date(data.generatedAt).toLocaleDateString(
    "hr-HR",
    { day: "numeric", month: "long", year: "numeric" }
  )
  const displayDepartureTime = data.departureWindow
  const weightedSum = data.districts.reduce(
    (s, d) => s + d.avgReachableCells * d.sampleCount,
    0
  )
  const cityAvg = weightedSum / Math.max(data.totalSamplePoints, 1)
  const cityWeightedScore = Math.round(
    totalPop > 0
      ? data.districts.reduce((s, d) => s + d.score * (d.population ?? 0), 0) /
          totalPop
      : 0
  )
  return {
    totalPop,
    poorDistricts,
    goodDistricts,
    poorPop,
    goodPop,
    best,
    worst,
    bestPct,
    worstPct,
    ratio,
    generatedLabel,
    displayDepartureTime,
    cityAvg,
    cityWeightedScore,
  }
}

export function computeBajsInsights(data: ScoreData) {
  const hasBajs = data.bajsTotalStations > 0
  const bajsTotalStations = data.bajsTotalStations
  const cityBajsBoost = hasBajs
    ? weightedPctChange(
        data.districts,
        (d) => d.trainAvgReachableCells,
        (d) => d.bajsAvgReachableCells
      )
    : 0
  const bajsRankedByBoost = hasBajs
    ? data.districts.toSorted((a, b) => b.bajsBoostPct - a.bajsBoostPct)
    : []
  const topBajsBeneficiary = bajsRankedByBoost[0]

  // 2.6: Coverage - % of transit stops within 350m of a BAJS station
  const coveragePct = data.bajsStopCoveragePct
  const coveredStops = data.bajsCoveredStops
  const totalStops = data.districts.reduce((s, d) => s + d.stops, 0)

  // 2.7: Density - stations per km² and per 10k residents
  const densityRanked = hasBajs
    ? data.districts
        .filter((d) => d.bajsStations > 0)
        .toSorted((a, b) => b.bajsDensityPerKm2 - a.bajsDensityPerKm2)
    : []
  const topDensity = densityRanked[0]
  const zeroBajsDistricts = data.districts.filter((d) => d.bajsStations === 0)

  return {
    hasBajs,
    bajsTotalStations,
    cityBajsBoost,
    bajsRankedByBoost,
    topBajsBeneficiary,
    coveragePct,
    coveredStops,
    totalStops,
    densityRanked,
    topDensity,
    zeroBajsDistricts,
  }
}

export function computeDesertInsights(data: ScoreData) {
  const desertDistricts = data.districts
    .filter((d) => d.desertPct > 0)
    .toSorted((a, b) => b.desertPct - a.desertPct)
  const lowFreqDistricts = data.districts.filter(
    (d) => d.medianHeadwayMin >= 30
  )
  const stopDistSorted = data.districts.toSorted(
    (a, b) => a.avgNearestStopM - b.avgNearestStopM
  )
  const maxStopDist = Math.max(
    ...stopDistSorted.map((d) => d.avgNearestStopM),
    1
  )
  const stopDistOver400 = stopDistSorted.filter((d) => d.avgNearestStopM > 400)
  return {
    desertDistricts,
    lowFreqDistricts,
    stopDistSorted,
    maxStopDist,
    stopDistOver400,
  }
}

export function computeEveningInsights(data: ScoreData) {
  const eveningRankedByDrop = data.districts
    .filter((d) => d.peakOffpeakDrop > 0)
    .toSorted((a, b) => b.peakOffpeakDrop - a.peakOffpeakDrop)
  const cityEveningDrop = -weightedPctChange(
    data.districts,
    (d) => d.avgReachableCells,
    (d) => d.eveningAvgReachableCells
  )
  return { eveningRankedByDrop, cityEveningDrop }
}

export function computeVarianceInsights(data: ScoreData) {
  const varianceRanked = data.districts
    .filter((d) => d.stddevReachableCells > 0)
    .toSorted((a, b) => b.stddevReachableCells - a.stddevReachableCells)
  return { varianceRanked }
}

export function computeFrequencyInsights(data: ScoreData) {
  const freqRanked = data.districts.toSorted(
    (a, b) => a.medianHeadwayMin - b.medianHeadwayMin
  )
  const allTramLines = new Set(data.districts.flatMap((d) => d.tramLines))
  const allBusLines = new Set(data.districts.flatMap((d) => d.busLines))
  const totalLines = allTramLines.size + allBusLines.size
  const maxHeadway = Math.max(...freqRanked.map((d) => d.medianHeadwayMin))
  const tramlessDistricts = data.districts.filter(
    (d) => d.tramLines.length === 0
  )
  const bestTramless =
    tramlessDistricts.length > 0
      ? Math.max(...tramlessDistricts.map((d) => d.score))
      : 0
  const manyTramDistricts = data.districts.filter(
    (d) => d.tramLines.length > 10
  )
  const avgScoreWithManyTramLines =
    manyTramDistricts.length > 0
      ? Math.round(
          manyTramDistricts.reduce((s, d) => s + d.score, 0) /
            manyTramDistricts.length
        )
      : 0
  return {
    freqRanked,
    allTramLines,
    allBusLines,
    totalLines,
    maxHeadway,
    tramlessDistricts,
    bestTramless,
    avgScoreWithManyTramLines,
  }
}

export const TRAM_SPEED_KMH = 15
export const BUS_SPEED_KMH = 25
export const TRAIN_SPEED_KMH = 40

export function computeLineSpeedInsights(data: ScoreData) {
  const lineDistrictMap = new Map<
    string,
    { type: "tram" | "bus" | "train"; districts: Array<string> }
  >()
  for (const d of data.districts) {
    for (const line of d.tramLines) {
      let entry = lineDistrictMap.get(line)
      if (!entry) {
        entry = { type: "tram", districts: [] }
        lineDistrictMap.set(line, entry)
      }
      entry.districts.push(d.name)
    }
    for (const line of d.busLines) {
      let entry = lineDistrictMap.get(line)
      if (!entry) {
        entry = { type: "bus", districts: [] }
        lineDistrictMap.set(line, entry)
      }
      entry.districts.push(d.name)
    }
    for (const line of d.trainLines) {
      const short = line.split(" - ").pop() ?? line
      let entry = lineDistrictMap.get(short)
      if (!entry) {
        entry = { type: "train", districts: [] }
        lineDistrictMap.set(short, entry)
      }
      entry.districts.push(d.name)
    }
  }
  const lineSpeedRows = Array.from(lineDistrictMap.entries())
    .map(([name, info]) => ({
      name,
      type: info.type,
      speed:
        info.type === "tram"
          ? TRAM_SPEED_KMH
          : info.type === "train"
            ? TRAIN_SPEED_KMH
            : BUS_SPEED_KMH,
      districtCount: info.districts.length,
    }))
    .toSorted((a, b) => b.speed - a.speed || b.districtCount - a.districtCount)
  const tramLineCount = lineSpeedRows.filter((l) => l.type === "tram").length
  const busLineCount = lineSpeedRows.filter((l) => l.type === "bus").length
  const trainLineCount = lineSpeedRows.filter((l) => l.type === "train").length
  const avgTramCoverage =
    tramLineCount > 0
      ? Math.round(
          lineSpeedRows
            .filter((l) => l.type === "tram")
            .reduce((s, l) => s + l.districtCount, 0) / tramLineCount
        )
      : 0
  const avgBusCoverage =
    busLineCount > 0
      ? Math.round(
          lineSpeedRows
            .filter((l) => l.type === "bus")
            .reduce((s, l) => s + l.districtCount, 0) / busLineCount
        )
      : 0
  return {
    tramLineCount,
    busLineCount,
    trainLineCount,
    avgTramCoverage,
    avgBusCoverage,
  }
}

export interface DensityDatum {
  name: string
  score: number
  density: number
  population: number
  hasTram: boolean
  tramLineCount: number
  sampleCount: number
}

export function computeScatterData(data: ScoreData) {
  const densityData: Array<DensityDatum> = data.districts.map((d) => ({
    name: d.name,
    score: d.score,
    density: (d.population ?? 0) / Math.max(d.sampleCount, 1),
    population: d.population ?? 0,
    hasTram: d.tramLines.length > 0,
    tramLineCount: d.tramLines.length,
    sampleCount: d.sampleCount,
  }))
  const maxDensity = Math.max(...densityData.map((d) => d.density))
  const scatterSesvete = densityData.find((d) => d.name === "Sesvete")
  const scatterDonjiGrad = densityData.find((d) => d.name === "Donji grad")
  const scatterNovizg = densityData.find(
    (d) => d.name === "Novi Zagreb - istok" || d.name === "Novi Zagreb - zapad"
  )
  return {
    densityData,
    maxDensity,
    scatterSesvete,
    scatterDonjiGrad,
    scatterNovizg,
  }
}

export function computeGiniData(data: ScoreData) {
  const gini = computeGini(data.districts, (d) => d.avgReachableCells)
  const bajsGini = computeGini(data.districts, (d) => d.bajsAvgReachableCells)
  const eveningGini = computeGini(
    data.districts,
    (d) => d.eveningAvgReachableCells
  )
  const giniDiff = bajsGini - gini
  const popSorted = data.districts.toSorted(
    (a, b) => a.avgReachableCells - b.avgReachableCells
  )
  const lorenzPoints: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }]
  let cumPop = 0
  let cumAccess = 0
  const totalPopL = popSorted.reduce((s, d) => s + (d.population ?? 0), 0)
  const totalAccessL = popSorted.reduce(
    (s, d) => s + (d.population ?? 0) * d.avgReachableCells,
    0
  )
  for (const d of popSorted) {
    cumPop += d.population ?? 0
    cumAccess += (d.population ?? 0) * d.avgReachableCells
    lorenzPoints.push({ x: cumPop / totalPopL, y: cumAccess / totalAccessL })
  }
  return { gini, bajsGini, eveningGini, giniDiff, popSorted, lorenzPoints }
}

export function computeBands(data: ScoreData) {
  return [
    {
      label: "Odlična povezanost",
      color: "#16a34a",
      districts: data.districts.filter((d) => d.score >= 70),
    },
    {
      label: "Dobra povezanost",
      color: "#0891b2",
      districts: data.districts.filter((d) => d.score >= 50 && d.score < 70),
    },
    {
      label: "Slaba povezanost",
      color: "#2563eb",
      districts: data.districts.filter((d) => d.score >= 25 && d.score < 50),
    },
    {
      label: "Loša povezanost",
      color: "#9333ea",
      districts: data.districts.filter((d) => d.score < 25),
    },
  ].filter((b) => b.districts.length > 0)
}

export function computeMatrixInsights(travelMatrix: TravelMatrix | null) {
  const matrixWorstCorridor = (() => {
    if (!travelMatrix) {
      return null
    }
    let worstTime = 0
    let worstFrom = ""
    let worstTo = ""
    for (let i = 0; i < travelMatrix.matrix.length; i++) {
      for (let j = 0; j < travelMatrix.matrix[i].length; j++) {
        if (i !== j && travelMatrix.matrix[i][j] > worstTime) {
          worstTime = travelMatrix.matrix[i][j]
          worstFrom = travelMatrix.districts[i]
          worstTo = travelMatrix.districts[j]
        }
      }
    }
    return { from: worstFrom, to: worstTo, time: worstTime }
  })()
  const matrixBestPair = (() => {
    if (!travelMatrix) {
      return null
    }
    let bestTime = Infinity
    let bestFrom = ""
    let bestTo = ""
    for (let i = 0; i < travelMatrix.matrix.length; i++) {
      for (let j = 0; j < travelMatrix.matrix[i].length; j++) {
        if (
          i !== j &&
          travelMatrix.matrix[i][j] > 0 &&
          travelMatrix.matrix[i][j] < bestTime
        ) {
          bestTime = travelMatrix.matrix[i][j]
          bestFrom = travelMatrix.districts[i]
          bestTo = travelMatrix.districts[j]
        }
      }
    }
    return { from: bestFrom, to: bestTo, time: bestTime }
  })()
  const avgTimeAll = (() => {
    if (!travelMatrix) {
      return 0
    }
    let sum = 0
    let count = 0
    for (let i = 0; i < travelMatrix.matrix.length; i++) {
      for (let j = 0; j < travelMatrix.matrix[i].length; j++) {
        if (i !== j && travelMatrix.matrix[i][j] > 0) {
          sum += travelMatrix.matrix[i][j]
          count++
        }
      }
    }
    return count > 0 ? Math.round(sum / count) : 0
  })()
  return { matrixWorstCorridor, matrixBestPair, avgTimeAll }
}

export function fmtPop(n: number): string {
  return n.toLocaleString("hr-HR")
}

function findUnderservedGaps(data: ScoreData) {
  const gaps: Array<ConnectivityGap> = []
  const underserved = data.districts
    .filter((d) => d.score < 25 && (d.population ?? 0) > 20_000)
    .toSorted((a, b) => (b.population ?? 0) - (a.population ?? 0))
  for (const d of underserved.slice(0, 2)) {
    const noTram = d.tramLines.length === 0
    gaps.push({
      severity: "critical",
      issue: `${d.name} (${fmtPop(d.population ?? 0)} stan.) - rezultat povezanosti ${d.score}/100${noTram ? ", bez tramvajske veze" : ""}`,
      impact: `Velika populacija s ograničenim pristupom ostatku grada. Doseže samo ${pct(d.avgReachableCells, data.totalGridCells)}% gradske površine u ${data.maxMinutes} min.`,
      recommendation: noTram
        ? "Brza autobusna linija (BRT) ili produljenje tramvajske mreže"
        : "Povećanje frekvencija i direktnije veze prema centru",
    })
  }
  return { gaps, underserved }
}

function findMatrixGaps(
  travelMatrix: TravelMatrix,
  usedNames: Set<string>
): Array<ConnectivityGap> {
  const gaps: Array<ConnectivityGap> = []
  const pairs: Array<{ from: string; to: string; time: number }> = []
  const n = travelMatrix.districts.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const t = Math.max(travelMatrix.matrix[i][j], travelMatrix.matrix[j][i])
      if (t > 80) {
        pairs.push({
          from: travelMatrix.districts[i],
          to: travelMatrix.districts[j],
          time: t,
        })
      }
    }
  }
  pairs.sort((a, b) => b.time - a.time)
  let added = 0
  for (const p of pairs) {
    if (added >= 2) {
      break
    }
    if (usedNames.has(p.from) && usedNames.has(p.to)) {
      continue
    }
    gaps.push({
      severity: p.time > 100 ? "critical" : "warning",
      issue: `${p.from} \u2194 ${p.to}: ${Math.round(p.time)} min putovanja`,
      impact:
        "Nema izravne veze - zahtijeva presjedanje kroz centar, što udvostručuje vrijeme putovanja",
      recommendation:
        "Razmotriti dijagonalnu ili kružnu liniju koja povezuje rubne kvartove bez prolaska kroz centar",
    })
    added++
  }
  return gaps
}

function computeConnectivityGaps(
  data: ScoreData,
  travelMatrix: TravelMatrix | null
): Array<ConnectivityGap> {
  const { gaps, underserved } = findUnderservedGaps(data)

  if (travelMatrix) {
    const usedNames = new Set(underserved.map((d) => d.name))
    gaps.push(...findMatrixGaps(travelMatrix, usedNames))
  }

  const tramless = data.districts
    .filter((d) => d.tramLines.length === 0 && (d.population ?? 0) > 40_000)
    .filter((d) => !underserved.some((u) => u.name === d.name))
    .toSorted((a, b) => (b.population ?? 0) - (a.population ?? 0))

  for (const d of tramless.slice(0, 1)) {
    gaps.push({
      severity: "warning",
      issue: `${d.name} (${fmtPop(d.population ?? 0)} stan.) nema tramvajsku vezu`,
      impact:
        "Oslanja se isključivo na autobusne linije koje su sporije i manje pouzdane od tramvaja",
      recommendation:
        "Produljenje tramvajske mreže ili uvođenje BRT linije s prioritetom na prometnicama",
    })
  }

  return gaps.slice(0, 5)
}

export const districtAbbrev = new Map<string, string>(
  Object.entries({
    "Donji grad": "DG",
    "Gornji grad-Medveščak": "GGM",
    Trnje: "Trn",
    Maksimir: "Maks",
    "Peščenica-Žitnjak": "PŽ",
    "Novi Zagreb - istok": "NZI",
    "Novi Zagreb - zapad": "NZZ",
    "Trešnjevka - sjever": "TrS",
    "Trešnjevka - jug": "TrJ",
    Črnomerec: "Črn",
    "Gornja Dubrava": "GD",
    "Donja Dubrava": "DD",
    Stenjevec: "Sten",
    "Podsused-Vrapče": "PV",
    Podsljeme: "Pods",
    Sesvete: "Sesv",
    Brezovica: "Brez",
  })
)

export interface WeekendItem {
  name: string
  weekdayScore: number
  weekendScore: number
  change: number
  population: number
}

export function computeWeekendData(
  data: ScoreData,
  saturdayData: ScoreData | null
) {
  if (!saturdayData) {
    return { weekendComparison: null, cityWeekendChange: 0 }
  }
  const items: Array<WeekendItem> = data.districts.map((wd) => {
    const sat = saturdayData.districts.find((sd) => sd.name === wd.name)
    const weekdayScore = wd.score
    const weekendScore = sat?.score ?? 0
    const change =
      weekdayScore > 0
        ? ((weekendScore - weekdayScore) / weekdayScore) * 100
        : 0
    return {
      name: wd.name,
      weekdayScore,
      weekendScore,
      change: Math.round(change * 10) / 10,
      population: wd.population ?? 0,
    }
  })
  items.sort((a, b) => b.change - a.change)
  let wdWeighted = 0
  let weWeighted = 0
  let totalP = 0
  for (const p of items) {
    wdWeighted += p.weekdayScore * p.population
    weWeighted += p.weekendScore * p.population
    totalP += p.population
  }
  const cityWeekendChange =
    totalP > 0 && wdWeighted > 0
      ? Math.round(((weWeighted - wdWeighted) / wdWeighted) * 1000) / 10
      : 0
  return { weekendComparison: items, cityWeekendChange }
}

function computeRouteInsights(routeStats: RouteStats | null) {
  const urbanRoutes = routeStats?.routes.filter((r) => r.mode !== "RAIL") ?? []
  const tramRoutes = urbanRoutes.filter((r) => r.mode === "TRAM")
  const busRoutes = urbanRoutes.filter((r) => r.mode === "BUS")
  const longestTram = tramRoutes.toSorted(
    (a, b) => b.distanceKm - a.distanceKm
  )[0]
  const shortestTram = tramRoutes.toSorted(
    (a, b) => a.distanceKm - b.distanceKm
  )[0]
  const longestBus = busRoutes.toSorted(
    (a, b) => b.distanceKm - a.distanceKm
  )[0]
  const shortestBus = busRoutes.toSorted(
    (a, b) => a.distanceKm - b.distanceKm
  )[0]
  const busiestRoute = urbanRoutes.toSorted(
    (a, b) => b.dailyDepartures - a.dailyDepartures
  )[0]
  const mostStopsTram = tramRoutes.toSorted((a, b) => b.stops - a.stops)[0]
  const mostStopsBus = busRoutes.toSorted((a, b) => b.stops - a.stops)[0]
  const fastestBus = busRoutes.toSorted(
    (a, b) => b.commercialSpeedKmh - a.commercialSpeedKmh
  )[0]
  const slowestBus = busRoutes
    .filter((r) => r.commercialSpeedKmh > 0)
    .toSorted((a, b) => a.commercialSpeedKmh - b.commercialSpeedKmh)[0]
  return {
    urbanRoutes,
    tramRoutes,
    busRoutes,
    longestTram,
    shortestTram,
    longestBus,
    shortestBus,
    busiestRoute,
    mostStopsTram,
    mostStopsBus,
    fastestBus,
    slowestBus,
  }
}

export function loadAllData(data: ScoreData) {
  const districtEmblems = loadDistrictEmblems()
  const travelMatrix = loadTravelMatrix()
  const saturdayData = loadSaturdayScores()
  const routeStats = loadRouteStats()
  const base = computeBaseInsights(data)
  const bajs = computeBajsInsights(data)
  const desert = computeDesertInsights(data)
  const evening = computeEveningInsights(data)
  const variance = computeVarianceInsights(data)
  const freq = computeFrequencyInsights(data)
  const lineSpeed = computeLineSpeedInsights(data)
  const scatter = computeScatterData(data)
  const giniData = computeGiniData(data)
  const bands = computeBands(data)
  const matrix = computeMatrixInsights(travelMatrix)
  const weekend = computeWeekendData(data, saturdayData)
  const routes = computeRouteInsights(routeStats)
  const connectivityGaps = computeConnectivityGaps(data, travelMatrix)
  return {
    districtEmblems,
    travelMatrix,
    routeStats,
    base,
    bajs,
    desert,
    evening,
    variance,
    freq,
    lineSpeed,
    scatter,
    giniData,
    bands,
    matrix,
    weekend,
    routes,
    connectivityGaps,
  }
}

export type AllData = ReturnType<typeof loadAllData>

export function sortRoutesByName(routes: Array<RouteInfo>): Array<RouteInfo> {
  return routes.toSorted((a, b) => {
    const na = Number.parseInt(a.name, 10),
      nb = Number.parseInt(b.name, 10)
    if (!Number.isNaN(na) && !Number.isNaN(nb)) {
      return na - nb
    }
    if (!Number.isNaN(na)) {
      return -1
    }
    if (!Number.isNaN(nb)) {
      return 1
    }
    return a.name.localeCompare(b.name)
  })
}
