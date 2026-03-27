import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { Metadata } from "next"
import Link from "next/link"
import TableOfContents from "@/components/table-of-contents"
import DistrictMap from "@/components/district-map"
import { getDataDir } from "@/lib/data-dir"
import { scaleLinear, scaleSqrt } from "@visx/scale"
import { Group } from "@visx/group"
import { LinePath } from "@visx/shape"
import { GridRows, GridColumns } from "@visx/grid"
import NetworkStatsSection from "./network-stats-section"
import PunctualitySection from "./punctuality-section"
import FleetDeploymentSection from "./fleet-deployment-section"
import SpeedComparisonSection from "./speed-comparison-section"
import OccupancySection from "./occupancy-section"
import AlertStatsSection from "./alert-stats-section"
import DelayPropagationSection from "./delay-propagation-section"
import BajsUtilizationSection from "./bajs-utilization-section"
import InsightsSection, { type ConnectivityGap } from "./insights-section"
import AccessibilityProfileSection from "./accessibility-profile-section"
import RouteAnalysisTables from "./route-analysis-tables"
import type {
  District as DistrictScore,
  DistrictScoresOutput as ScoreData,
  RouteStatsOutput as RouteStats,
  RouteStatsRoute as RouteInfo,
} from "@/lib/generated"

export const metadata: Metadata = {
  title: "Statistika dostupnosti — Doseg | Zagreb Transit Reachability",
  description:
    "Ranking svih 17 zagrebačkih gradskih četvrti po dostupnosti javnim prijevozom i BAJS biciklima. Bodovi, karte, analiza mreže i usporedba linija.",
  alternates: { canonical: "/statistika" },
  openGraph: {
    title: "Statistika dostupnosti — Doseg | Zagreb Transit Reachability",
    description:
      "Ranking svih 17 zagrebačkih gradskih četvrti po dostupnosti javnim prijevozom i BAJS biciklima. Bodovi, karte, analiza mreže i usporedba linija.",
    type: "article",
    images: [{ url: "/og.jpg", width: 1200, height: 630, type: "image/jpeg" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Statistika dostupnosti — Doseg | Zagreb Transit Reachability",
    description:
      "Ranking svih 17 zagrebačkih gradskih četvrti po dostupnosti javnim prijevozom i BAJS biciklima. Bodovi, karte, analiza mreže i usporedba linija.",
  },
}

export const revalidate = 3600

type DistrictEmblems = Record<string, string>

function loadScores(): ScoreData | null {
  const scorePath = join(getDataDir(), "district-scores.json")
  try {
    return JSON.parse(readFileSync(scorePath, "utf-8"))
  } catch {
    return null
  }
}

function loadDistrictEmblems(): DistrictEmblems {
  try {
    return JSON.parse(
      readFileSync(
        join(process.cwd(), "public", "district-emblems.json"),
        "utf-8"
      )
    ) as DistrictEmblems
  } catch {
    return {}
  }
}

interface TravelMatrix {
  generatedAt: string
  departureTime: string
  date: string
  districts: string[]
  matrix: number[][]
  transferMatrix: number[][]
  walkDistanceMatrix: number[][]
}

function loadTravelMatrix(): TravelMatrix | null {
  const matrixPath = join(getDataDir(), "travel-matrix.json")
  if (!existsSync(matrixPath)) return null
  try {
    return JSON.parse(readFileSync(matrixPath, "utf-8"))
  } catch {
    return null
  }
}

function loadRouteStats(): RouteStats | null {
  const statsPath = join(getDataDir(), "route-stats.json")
  if (!existsSync(statsPath)) return null
  try {
    return JSON.parse(readFileSync(statsPath, "utf-8"))
  } catch {
    return null
  }
}

function loadSaturdayScores(): ScoreData | null {
  const satPath = join(getDataDir(), "district-scores-saturday.json")
  if (!existsSync(satPath)) return null
  try {
    return JSON.parse(readFileSync(satPath, "utf-8"))
  } catch {
    return null
  }
}

/** Format number with Croatian decimal comma. */
function fmtHR(n: number, decimals = 0): string {
  return decimals > 0
    ? n.toFixed(decimals).replace(".", ",")
    : Math.round(n).toString()
}

function pct(cells: number, total: number): string {
  if (total === 0) return "0"
  const p = (cells / total) * 100
  if (p < 0.1) return "<0,1"
  if (p < 1) return fmtHR(p, 1)
  return Math.round(p).toString()
}

/** Population-weighted Gini coefficient via trapezoidal Lorenz curve. */
function computeGini(
  districts: DistrictScore[],
  accessor: (d: DistrictScore) => number
): number {
  const sorted = [...districts]
    .filter((d) => (d.population ?? 0) > 0)
    .sort((a, b) => accessor(a) - accessor(b))
  if (sorted.length === 0) return 0
  const totalPop = sorted.reduce((s, d) => s + (d.population ?? 0), 0)
  const totalWeighted = sorted.reduce(
    (s, d) => s + (d.population ?? 0) * accessor(d),
    0
  )
  if (totalPop === 0 || totalWeighted === 0) return 0
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
    area += (x - prevX) * (prevY + y) / 2
    prevX = x
    prevY = y
  }
  return Math.max(0, 1 - 2 * area)
}

/** Compute weighted percentage change between two district metrics. */
function weightedPctChange(
  districts: DistrictScore[],
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

function computeBaseInsights(data: ScoreData) {
  const totalPop = data.districts.reduce((s, d) => s + (d.population ?? 0), 0)
  const poorDistricts = data.districts.filter((d) => d.score < 25)
  const goodDistricts = data.districts.filter((d) => d.score >= 50)
  const poorPop = poorDistricts.reduce((s, d) => s + (d.population ?? 0), 0)
  const goodPop = goodDistricts.reduce((s, d) => s + (d.population ?? 0), 0)
  const emptyDistrict: DistrictScore = { name: "-", osmId: 0, population: 0, sampleCount: 0, avgReachableCells: 0, minReachableCells: 0, maxReachableCells: 0, stddevReachableCells: 0, medianReachableCells: 0, p25ReachableCells: 0, p75ReachableCells: 0, eveningAvgReachableCells: 0, peakOffpeakDrop: 0, trainAvgReachableCells: 0, trainBoostPct: 0, bajsAvgReachableCells: 0, bajsBoostPct: 0, bajsStations: 0, areaKm2: 0, bajsDensityPerKm2: 0, bajsPer10k: 0, bajsStopCoveragePct: 0, desertPct: 0, avgNearestStopM: 0, bestPoint: { lat: 0, lon: 0 }, tramLines: [], busLines: [], trainLines: [], stops: 0, medianHeadwayMin: 0, rank: 0, score: 0 }
  const best = data.districts.length > 0 ? data.districts[0] : emptyDistrict
  const worst = data.districts.length > 0 ? data.districts[data.districts.length - 1] : emptyDistrict
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
  const displayDepartureTime =
    data.departureWindow ?? "08:00"
  const weightedSum = data.districts.reduce(
    (s, d) => s + d.avgReachableCells * d.sampleCount,
    0
  )
  const cityAvg = weightedSum / Math.max(data.totalSamplePoints, 1)
  const cityWeightedScore = Math.round(
    totalPop > 0
      ? data.districts.reduce((s, d) => s + d.score * (d.population ?? 0), 0) / totalPop
      : 0
  )
  return {
    totalPop, poorDistricts, goodDistricts, poorPop, goodPop,
    best, worst, bestPct, worstPct, ratio,
    generatedLabel, displayDepartureTime, cityAvg, cityWeightedScore,
  }
}

function computeBajsInsights(data: ScoreData) {
  const hasBajs = (data.bajsTotalStations ?? 0) > 0
  const bajsTotalStations = data.bajsTotalStations ?? 0
  const cityBajsBoost = hasBajs
    ? weightedPctChange(
        data.districts,
        (d) => d.trainAvgReachableCells ?? d.avgReachableCells,
        (d) => d.bajsAvgReachableCells ?? d.avgReachableCells
      )
    : 0
  const bajsRankedByBoost = hasBajs
    ? [...data.districts].sort(
        (a, b) => (b.bajsBoostPct ?? 0) - (a.bajsBoostPct ?? 0)
      )
    : []
  const topBajsBeneficiary = bajsRankedByBoost[0]

  // 2.6: Coverage - % of transit stops within 350m of a BAJS station
  const coveragePct = data.bajsStopCoveragePct ?? 0
  const coveredStops = data.bajsCoveredStops ?? 0
  const totalStops = data.districts.reduce((s, d) => s + d.stops, 0)

  // 2.7: Density - stations per km² and per 10k residents
  const densityRanked = hasBajs
    ? [...data.districts]
        .filter((d) => (d.bajsStations ?? 0) > 0)
        .sort((a, b) => (b.bajsDensityPerKm2 ?? 0) - (a.bajsDensityPerKm2 ?? 0))
    : []
  const topDensity = densityRanked[0]
  const zeroBajsDistricts = data.districts.filter((d) => (d.bajsStations ?? 0) === 0)

  return {
    hasBajs, bajsTotalStations, cityBajsBoost, bajsRankedByBoost, topBajsBeneficiary,
    coveragePct, coveredStops, totalStops,
    densityRanked, topDensity, zeroBajsDistricts,
  }
}

function computeDesertInsights(data: ScoreData) {
  const hasDesertData = data.districts.some((d) => d.desertPct !== undefined)
  const desertDistricts = hasDesertData
    ? [...data.districts]
        .filter((d) => (d.desertPct ?? 0) > 0)
        .sort((a, b) => (b.desertPct ?? 0) - (a.desertPct ?? 0))
    : []
  const lowFreqDistricts = data.districts.filter((d) => (d.medianHeadwayMin) >= 30)
  const hasStopDistData = data.districts.some((d) => d.avgNearestStopM !== undefined)
  const stopDistSorted = hasStopDistData
    ? [...data.districts]
        .filter((d) => d.avgNearestStopM !== undefined)
        .sort((a, b) => (a.avgNearestStopM ?? 0) - (b.avgNearestStopM ?? 0))
    : []
  const maxStopDist = Math.max(...stopDistSorted.map((d) => d.avgNearestStopM ?? 0), 1)
  const stopDistOver400 = stopDistSorted.filter((d) => (d.avgNearestStopM ?? 0) > 400)
  return { hasDesertData, desertDistricts, lowFreqDistricts, hasStopDistData, stopDistSorted, maxStopDist, stopDistOver400 }
}

function computeEveningInsights(data: ScoreData) {
  const hasEveningData = data.districts.some(
    (d) => d.eveningAvgReachableCells !== undefined
  )
  const eveningRankedByDrop = hasEveningData
    ? [...data.districts]
        .filter((d) => (d.peakOffpeakDrop ?? 0) > 0)
        .sort((a, b) => (b.peakOffpeakDrop ?? 0) - (a.peakOffpeakDrop ?? 0))
    : []
  const cityEveningDrop = hasEveningData
    ? -weightedPctChange(
        data.districts,
        (d) => d.avgReachableCells,
        (d) => d.eveningAvgReachableCells ?? d.avgReachableCells
      )
    : 0
  return { hasEveningData, eveningRankedByDrop, cityEveningDrop }
}

function computeVarianceInsights(data: ScoreData) {
  const hasVarianceData = data.districts.some((d) => d.stddevReachableCells !== undefined)
  const varianceRanked = hasVarianceData
    ? [...data.districts]
        .filter((d) => (d.stddevReachableCells ?? 0) > 0)
        .sort((a, b) => (b.stddevReachableCells ?? 0) - (a.stddevReachableCells ?? 0))
    : []
  return { hasVarianceData, varianceRanked }
}

function computeFrequencyInsights(data: ScoreData) {
  const freqRanked = [...data.districts].sort(
    (a, b) =>
      a.medianHeadwayMin - b.medianHeadwayMin
  )
  const allTramLines = new Set(data.districts.flatMap((d) => d.tramLines))
  const allBusLines = new Set(data.districts.flatMap((d) => d.busLines))
  const totalLines = allTramLines.size + allBusLines.size
  const maxHeadway = Math.max(...freqRanked.map((d) => (d.medianHeadwayMin)))
  const tramlessDistricts = data.districts.filter((d) => d.tramLines.length === 0)
  const bestTramless = tramlessDistricts.length > 0
    ? Math.max(...tramlessDistricts.map((d) => d.score))
    : 0
  const manyTramDistricts = data.districts.filter((d) => d.tramLines.length > 10)
  const avgScoreWithManyTramLines = manyTramDistricts.length > 0
    ? Math.round(manyTramDistricts.reduce((s, d) => s + d.score, 0) / manyTramDistricts.length)
    : 0
  return { freqRanked, allTramLines, allBusLines, totalLines, maxHeadway, tramlessDistricts, bestTramless, avgScoreWithManyTramLines }
}

const TRAM_SPEED_KMH = 15
const BUS_SPEED_KMH = 25
const TRAIN_SPEED_KMH = 40

function computeLineSpeedInsights(data: ScoreData) {
  const lineDistrictMap = new Map<string, { type: "tram" | "bus" | "train"; districts: string[] }>()
  for (const d of data.districts) {
    for (const line of d.tramLines) {
      if (!lineDistrictMap.has(line)) lineDistrictMap.set(line, { type: "tram", districts: [] })
      lineDistrictMap.get(line)!.districts.push(d.name)
    }
    for (const line of d.busLines) {
      if (!lineDistrictMap.has(line)) lineDistrictMap.set(line, { type: "bus", districts: [] })
      lineDistrictMap.get(line)!.districts.push(d.name)
    }
    for (const line of d.trainLines ?? []) {
      const short = line.split(" - ").pop() ?? line
      if (!lineDistrictMap.has(short)) lineDistrictMap.set(short, { type: "train", districts: [] })
      lineDistrictMap.get(short)!.districts.push(d.name)
    }
  }
  const lineSpeedRows = Array.from(lineDistrictMap.entries())
    .map(([name, info]) => ({
      name,
      type: info.type,
      speed: info.type === "tram" ? TRAM_SPEED_KMH : info.type === "train" ? TRAIN_SPEED_KMH : BUS_SPEED_KMH,
      districtCount: info.districts.length,
    }))
    .sort((a, b) => b.speed - a.speed || b.districtCount - a.districtCount)
  const tramLineCount = lineSpeedRows.filter((l) => l.type === "tram").length
  const busLineCount = lineSpeedRows.filter((l) => l.type === "bus").length
  const trainLineCount = lineSpeedRows.filter((l) => l.type === "train").length
  const avgTramCoverage = tramLineCount > 0
    ? Math.round(lineSpeedRows.filter((l) => l.type === "tram").reduce((s, l) => s + l.districtCount, 0) / tramLineCount)
    : 0
  const avgBusCoverage = busLineCount > 0
    ? Math.round(lineSpeedRows.filter((l) => l.type === "bus").reduce((s, l) => s + l.districtCount, 0) / busLineCount)
    : 0
  return { tramLineCount, busLineCount, trainLineCount, avgTramCoverage, avgBusCoverage }
}

interface DensityDatum {
  name: string
  score: number
  density: number
  population: number
  hasTram: boolean
  tramLineCount: number
  sampleCount: number
}

function computeScatterData(data: ScoreData) {
  const densityData: DensityDatum[] = data.districts.map((d) => ({
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
  return { densityData, maxDensity, scatterSesvete, scatterDonjiGrad, scatterNovizg }
}

function computeGiniData(data: ScoreData) {
  const gini = computeGini(data.districts, (d) => d.avgReachableCells)
  const bajsGini = computeGini(data.districts, (d) => d.bajsAvgReachableCells ?? d.avgReachableCells)
  const eveningGini = computeGini(data.districts, (d) => d.eveningAvgReachableCells ?? d.avgReachableCells)
  const giniDiff = bajsGini - gini
  const popSorted = [...data.districts].sort(
    (a, b) => a.avgReachableCells - b.avgReachableCells
  )
  const lorenzPoints: { x: number; y: number }[] = [{ x: 0, y: 0 }]
  let cumPop = 0
  let cumAccess = 0
  const totalPopL = popSorted.reduce((s, d) => s + (d.population ?? 0), 0)
  const totalAccessL = popSorted.reduce(
    (s, d) => s + (d.population ?? 0) * d.avgReachableCells, 0
  )
  for (const d of popSorted) {
    cumPop += d.population ?? 0
    cumAccess += (d.population ?? 0) * d.avgReachableCells
    lorenzPoints.push({ x: cumPop / totalPopL, y: cumAccess / totalAccessL })
  }
  return { gini, bajsGini, eveningGini, giniDiff, popSorted, lorenzPoints }
}

function computeBands(data: ScoreData) {
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

function computeMatrixInsights(travelMatrix: TravelMatrix | null) {
  const matrixWorstCorridor = (() => {
    if (!travelMatrix) return null
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
    if (!travelMatrix) return null
    let bestTime = Infinity
    let bestFrom = ""
    let bestTo = ""
    for (let i = 0; i < travelMatrix.matrix.length; i++) {
      for (let j = 0; j < travelMatrix.matrix[i].length; j++) {
        if (i !== j && travelMatrix.matrix[i][j] > 0 && travelMatrix.matrix[i][j] < bestTime) {
          bestTime = travelMatrix.matrix[i][j]
          bestFrom = travelMatrix.districts[i]
          bestTo = travelMatrix.districts[j]
        }
      }
    }
    return { from: bestFrom, to: bestTo, time: bestTime }
  })()
  const avgTimeAll = (() => {
    if (!travelMatrix) return 0
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

function fmtPop(n: number): string {
  return n.toLocaleString("hr-HR")
}

function findUnderservedGaps(data: ScoreData): { gaps: ConnectivityGap[]; underserved: DistrictScore[] } {
  const gaps: ConnectivityGap[] = []
  const underserved = [...data.districts]
    .filter((d) => d.score < 25 && (d.population ?? 0) > 20000)
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
  for (const d of underserved.slice(0, 2)) {
    const noTram = d.tramLines.length === 0
    gaps.push({
      severity: "critical",
      issue: `${d.name} (${fmtPop(d.population ?? 0)} stan.) \u2014 rezultat povezanosti ${d.score}/100${noTram ? ", bez tramvajske veze" : ""}`,
      impact: `Velika populacija s ograničenim pristupom ostatku grada. Doseže samo ${pct(d.avgReachableCells, data.totalGridCells)}% gradske površine u ${data.maxMinutes} min.`,
      recommendation: noTram
        ? "Brza autobusna linija (BRT) ili produljenje tramvajske mreže"
        : "Povećanje frekvencija i direktnije veze prema centru",
    })
  }
  return { gaps, underserved }
}

function findMatrixGaps(travelMatrix: TravelMatrix, usedNames: Set<string>): ConnectivityGap[] {
  const gaps: ConnectivityGap[] = []
  const pairs: { from: string; to: string; time: number }[] = []
  const n = travelMatrix.districts.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const t = Math.max(travelMatrix.matrix[i][j], travelMatrix.matrix[j][i])
      if (t > 80) pairs.push({ from: travelMatrix.districts[i], to: travelMatrix.districts[j], time: t })
    }
  }
  pairs.sort((a, b) => b.time - a.time)
  let added = 0
  for (const p of pairs) {
    if (added >= 2) break
    if (usedNames.has(p.from) && usedNames.has(p.to)) continue
    gaps.push({
      severity: p.time > 100 ? "critical" : "warning",
      issue: `${p.from} \u2194 ${p.to}: ${Math.round(p.time)} min putovanja`,
      impact: "Nema izravne veze \u2014 zahtijeva presjedanje kroz centar, što udvostručuje vrijeme putovanja",
      recommendation: "Razmotriti dijagonalnu ili kružnu liniju koja povezuje rubne četvrti bez prolaska kroz centar",
    })
    added++
  }
  return gaps
}

function computeConnectivityGaps(
  data: ScoreData,
  travelMatrix: TravelMatrix | null,
): ConnectivityGap[] {
  const { gaps, underserved } = findUnderservedGaps(data)

  if (travelMatrix) {
    const usedNames = new Set(underserved.map((d) => d.name))
    gaps.push(...findMatrixGaps(travelMatrix, usedNames))
  }

  // 3. Districts without tram but large population
  const tramless = data.districts
    .filter((d) => d.tramLines.length === 0 && (d.population ?? 0) > 40000)
    .filter((d) => !underserved.some((u) => u.name === d.name))
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))

  for (const d of tramless.slice(0, 1)) {
    gaps.push({
      severity: "warning",
      issue: `${d.name} (${fmtPop(d.population ?? 0)} stan.) nema tramvajsku vezu`,
      impact: "Oslanja se isključivo na autobusne linije koje su sporije i manje pouzdane od tramvaja",
      recommendation: "Produljenje tramvajske mreže ili uvođenje BRT linije s prioritetom na prometnicama",
    })
  }

  return gaps.slice(0, 5)
}

const districtAbbrev: Record<string, string> = {
  "Donji grad": "DG",
  "Gornji grad-Medveščak": "GGM",
  "Trnje": "Trn",
  "Maksimir": "Maks",
  "Peščenica-Žitnjak": "PŽ",
  "Novi Zagreb - istok": "NZI",
  "Novi Zagreb - zapad": "NZZ",
  "Trešnjevka - sjever": "TrS",
  "Trešnjevka - jug": "TrJ",
  "Črnomerec": "Črn",
  "Gornja Dubrava": "GD",
  "Donja Dubrava": "DD",
  "Stenjevec": "Sten",
  "Podsused-Vrapče": "PV",
  "Podsljeme": "Pods",
  "Sesvete": "Sesv",
  "Brezovica": "Brez",
}

interface WeekendItem {
  name: string
  weekdayScore: number
  weekendScore: number
  change: number
  population: number
}

function computeWeekendData(data: ScoreData, saturdayData: ScoreData | null) {
  if (!saturdayData) return { weekendComparison: null, cityWeekendChange: 0 }
  const items: WeekendItem[] = data.districts.map((wd) => {
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
  const cityWeekendChange = totalP > 0 && wdWeighted > 0
    ? Math.round(((weWeighted - wdWeighted) / wdWeighted) * 1000) / 10
    : 0
  return { weekendComparison: items, cityWeekendChange }
}

function computeRouteInsights(routeStats: RouteStats | null) {
  const urbanRoutes = routeStats?.routes.filter((r) => r.mode !== "RAIL") ?? []
  const tramRoutes = urbanRoutes.filter((r) => r.mode === "TRAM")
  const busRoutes = urbanRoutes.filter((r) => r.mode === "BUS")
  const longestTram = [...tramRoutes].sort((a, b) => b.distanceKm - a.distanceKm)[0]
  const shortestTram = [...tramRoutes].sort((a, b) => a.distanceKm - b.distanceKm)[0]
  const longestBus = [...busRoutes].sort((a, b) => b.distanceKm - a.distanceKm)[0]
  const shortestBus = [...busRoutes].sort((a, b) => a.distanceKm - b.distanceKm)[0]
  const busiestRoute = [...urbanRoutes].sort((a, b) => b.dailyDepartures - a.dailyDepartures)[0]
  const mostStopsTram = [...tramRoutes].sort((a, b) => b.stops - a.stops)[0]
  const mostStopsBus = [...busRoutes].sort((a, b) => b.stops - a.stops)[0]
  const fastestBus = [...busRoutes].sort((a, b) => b.commercialSpeedKmh - a.commercialSpeedKmh)[0]
  const slowestBus = [...busRoutes].filter((r) => r.commercialSpeedKmh > 0).sort((a, b) => a.commercialSpeedKmh - b.commercialSpeedKmh)[0]
  return {
    urbanRoutes, tramRoutes, busRoutes,
    longestTram, shortestTram, longestBus, shortestBus,
    busiestRoute, mostStopsTram, mostStopsBus, fastestBus, slowestBus,
  }
}

export default function StatistikaPage() {
  const data = loadScores()
  if (!data) {
    return (
      <Shell>
        <BackLink />
        <NoDataMessage />
      </Shell>
    )
  }
  return <StatistikaContent data={data} />
}

function NoDataMessage() {
  return (
    <>
      <h1 className="mt-8 text-2xl font-semibold tracking-tight text-white">
        Povezanost četvrti
      </h1>
      <div className="mt-10 rounded-xl bg-white/4 px-5 py-4 ring-1 ring-white/6">
        <p className="text-[14px] text-slate-400">
          Nije moguće generirati podatke. Provjeri je li OTP pokrenut.
        </p>
        <p className="mt-1 text-[13px] text-slate-600">
          Pokreni{" "}
          <code className="rounded bg-white/6 px-1.5 py-0.5 text-[12px] text-slate-400">
            docker compose up otp
          </code>{" "}
          pa osvježi stranicu.
        </p>
      </div>
    </>
  )
}

function loadAllData(data: ScoreData) {
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
    districtEmblems, travelMatrix, routeStats,
    base, bajs, desert, evening, variance, freq,
    lineSpeed, scatter, giniData, bands, matrix, weekend, routes,
    connectivityGaps,
  }
}

function StatistikaContent({ data }: { data: ScoreData }) {
  const all = loadAllData(data)
  return (
    <Shell>
      <BackLink />
      <StatHero
        best={all.base.best}
        bestPct={all.base.bestPct}
        departureTime={all.base.displayDepartureTime}
        maxMinutes={data.maxMinutes}
        ratio={all.base.ratio}
        worst={all.base.worst}
      />
      <ChoroplethSection />
      
      <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-12 px-4 sm:px-6 lg:flex-row lg:px-8">
        <aside className="sticky top-24 hidden w-64 shrink-0 pt-24 lg:block">
          <TableOfContents />
        </aside>
        
        <div className="min-w-0 flex-1 pb-24 w-full">
          <TableOfContents isMobile className="mb-8" />
          <HeadlineInsights data={data} base={all.base} bajs={all.bajs} />
          <InsightsSection connectivityGaps={all.connectivityGaps} />
          <StatistikaContentSections data={data} all={all} />
        </div>
      </div>
    </Shell>
  )
}

type AllData = ReturnType<typeof loadAllData>

function StatistikaContentSections({ data, all }: { data: ScoreData; all: AllData }) {
  return (
    <>
      <RealTimeGroup all={all} />
      <ReliabilityGroup routeStats={all.routeStats} />
      <AccessibilityGroup data={data} all={all} />
      <BajsGroup data={data} bajs={all.bajs} />
      <DeepDiveGroup data={data} all={all} />
      <DistrictBandsSection data={data} bands={all.bands} districtEmblems={all.districtEmblems} base={all.base} />
      <MethodologySection data={data} base={all.base} bajs={all.bajs} />
    </>
  )
}

function RealTimeGroup({ all }: { all: AllData }) {
  const routes = sortRoutesByName(all.routeStats?.routes.filter((r: RouteInfo) => r.mode !== "RAIL") ?? [])
  return (
    <SectionGroup id="promet-danas" title="Radi li promet danas?" description="Stvarni podaci iz ZET-ovog sustava praćenja vozila u realnom vremenu.">
      {all.routeStats && <PunctualitySection routes={routes.map((r) => ({ name: r.name, mode: r.mode }))} />}
      <AlertStatsSection />
      {all.routeStats && <DelayPropagationSection routes={routes.map((r) => r.name)} />}
    </SectionGroup>
  )
}

function ReliabilityGroup({ routeStats }: { routeStats: AllData["routeStats"] }) {
  return (
    <SectionGroup id="pouzdanost" title="Pouzdanost i brzina linija" description="Koliko su pouzdane pojedine linije — iz voznog reda i stvarnih mjerenja.">
      <RouteStatsSection routeStats={routeStats} />
      <FleetDeploymentSection />
      <SpeedComparisonSection />
      <OccupancySection />
    </SectionGroup>
  )
}

function AccessibilityGroup({ data, all }: { data: ScoreData; all: AllData }) {
  return (
    <SectionGroup id="povezanost" title="Povezanost kvartova" description="Koliko je grada dostupno iz vaše četvrti u 30 minuta javnim prijevozom.">
      <AccessibilityProfileSection />
      <ScoreMeaningSection data={data} base={all.base} bajs={all.bajs} />
      <AccessibilityGapSection base={all.base} />
      <PeakOffPeakSection data={data} base={all.base} evening={all.evening} />
      <WeekendSection weekend={all.weekend} />
      <TravelMatrixSection travelMatrix={all.travelMatrix} matrix={all.matrix} />
      <TransferDependencySection travelMatrix={all.travelMatrix} />
    </SectionGroup>
  )
}

function BajsGroup({ data, bajs }: { data: ScoreData; bajs: AllData["bajs"] }) {
  return (
    <SectionGroup id="bajs" title="BAJS bicikli" description="Dijeljeni bicikli kao nadopuna javnom prijevozu — dostupnost i utjecaj na povezanost.">
      <BajsUtilizationSection />
      <BajsImpactSection data={data} bajs={bajs} />
    </SectionGroup>
  )
}

function DeepDiveGroup({ data, all }: { data: ScoreData; all: AllData }) {
  return (
    <SectionGroup id="analiza" title="Struktura mreže" description="Detaljnija analiza za one koji žele razumjeti sustav u dubinu.">
      <NetworkStatsSection />
      <CentralitySection />
      <DensityScatterSection scatter={all.scatter} />
      <TransitDesertSection data={data} desert={all.desert} />
      <StopDistanceSection desert={all.desert} />
      <TramSection freq={all.freq} />
      <HzTrainSection data={data} />
      <LorenzSection giniData={all.giniData} />
      <GiniSection giniData={all.giniData} />
      <VarianceSection data={data} variance={all.variance} />
      <FrequencySection freq={all.freq} />
      <LineSpeedSection lineSpeed={all.lineSpeed} />
    </SectionGroup>
  )
}

function sortRoutesByName(routes: RouteInfo[]): RouteInfo[] {
  return [...routes].sort((a, b) => {
    const na = parseInt(a.name, 10), nb = parseInt(b.name, 10)
    if (!isNaN(na) && !isNaN(nb)) return na - nb
    if (!isNaN(na)) return -1
    if (!isNaN(nb)) return 1
    return a.name.localeCompare(b.name)
  })
}

function SectionGroup({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div id={id} className="mt-24 sm:mt-32">
      <div className="mb-3 flex items-center gap-4">
        <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
        <span className="font-sans text-[11px] font-bold tracking-[0.2em] text-slate-400 uppercase dark:text-slate-500">
          {title}
        </span>
        <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
      </div>
      <p className="mb-12 text-center text-[15px] text-slate-500 dark:text-slate-400">
        {description}
      </p>
      {children}
    </div>
  )
}

// --- Section Components ---

function ChoroplethSection() {
  return (
    <section id="karta" className="mt-20 flex flex-col items-center border-t border-slate-200 py-16 sm:mt-32 sm:py-24 dark:border-white/10">
      <div className="mb-12 flex flex-col items-center text-center">
        <h2 className="font-serif text-[28px] tracking-tight text-slate-900 sm:text-[32px] dark:text-slate-100">
          Karta područja
        </h2>
        <ChoroplethLegend />
      </div>
      <div className="w-full max-w-5xl">
        <DistrictMap />
      </div>
    </section>
  )
}

function ChoroplethLegend() {
  return (
    <p className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[13px] text-slate-600 dark:text-slate-400">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-[#16a34a]" />
        Zeleno = bolja povezanost
      </span>
      <span className="hidden opacity-50 sm:inline-block">•</span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-[#9333ea]" />
        Ljubičasto = lošija
      </span>
      <span className="hidden opacity-50 sm:inline-block">•</span>
      Zadrži pokazivač ili fokusiraj četvrt
    </p>
  )
}

function HeadlineInsights({
  data,
  base,
  bajs,
}: {
  data: ScoreData
  base: ReturnType<typeof computeBaseInsights>
  bajs: ReturnType<typeof computeBajsInsights>
}) {
  return (
    <div className="border-t border-slate-200 py-16 sm:py-24 dark:border-white/10">
      <div className="grid grid-cols-2 gap-x-8 gap-y-12 lg:grid-cols-3 xl:grid-cols-6">
        <EditorialStat
          title="Gradski prosjek"
          value={String(base.cityWeightedScore)}
          note="od 100"
          detail="populacijski ponderiran prosječni rezultat."
        />
        <EditorialStat
          title="Dobra povezanost"
          value={String(base.goodDistricts.length)}
          note={`/ ${data.districts.length}`}
          detail="četvrti s rezultatom iznad 50 bodova."
        />
        <EditorialStat
          title="Jaz u dostupnosti"
          value={`${base.totalPop > 0 ? Math.round((base.poorPop / base.totalPop) * 100) : 0}%`}
          note="stanovnika"
          detail="živi u četvrtima s rezultatom manjim od 25."
        />
        <EditorialStat
          title="Maksimalni doseg"
          value={`${base.bestPct}%`}
          note="grada"
          detail={`može se doseći iz najbolje četvrti (${base.best.name}).`}
        />
        <HzEditorialStat data={data} />
        {bajs.hasBajs && (
          <BajsEditorialStat bajs={bajs} />
        )}
      </div>
    </div>
  )
}

function EditorialStat({
  title,
  value,
  note,
  detail,
  valueColor = "text-slate-900 dark:text-slate-100",
}: {
  title: string
  value: string
  note?: string
  detail?: string
  valueColor?: string
}) {
  return (
    <div className="flex flex-col">
      <div className="font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
        {title}
      </div>
      <div className="mt-4 flex items-baseline gap-1.5">
        <span className={`font-serif text-[44px] leading-none tabular-nums ${valueColor}`}>
          {value}
        </span>
        {note && (
          <span className="text-[15px] text-slate-500 dark:text-slate-400">
            {note}
          </span>
        )}
      </div>
      {detail && (
        <div className="mt-3 text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">
          {detail}
        </div>
      )}
    </div>
  )
}

function HzEditorialStat({ data }: { data: ScoreData }) {
  const districtsWithTrains = data.districts.filter(
    (d) => (d.trainLines?.length ?? 0) > 0
  ).length
  if (districtsWithTrains === 0) return null
  return (
    <EditorialStat
      title="HŽ vlakovi"
      value={String(districtsWithTrains)}
      note={`/ ${data.districts.length}`}
      valueColor="text-teal-700 dark:text-teal-400"
      detail="Doprinos dosegu: 0%. Rijedak interval troši cijeli budžet."
    />
  )
}

function BajsEditorialStat({ bajs }: { bajs: ReturnType<typeof computeBajsInsights> }) {
  return (
    <EditorialStat
      title="BAJS sustav"
      value={String(bajs.bajsTotalStations)}
      note="stanica"
      valueColor="text-amber-700 dark:text-amber-400"
      detail={`Prosječno +${bajs.cityBajsBoost}% dosega za cijeli grad.`}
    />
  )
}

function ScoreMeaningSection({
  data,
  base,
  bajs,
}: {
  data: ScoreData
  base: ReturnType<typeof computeBaseInsights>
  bajs: ReturnType<typeof computeBajsInsights>
}) {
  return (
    <section id="metodika" className="flex flex-col border-t border-slate-200 py-16 sm:py-24 dark:border-white/10">
      <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-serif text-[28px] tracking-tight text-slate-900 sm:text-[32px] dark:text-slate-100">
            Što znači rezultat
          </h2>
          <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
            Grad je podijeljen u ćelije od ~200m. Rezultat mjeri koliki udio tih ćelija ({data.totalGridCells.toLocaleString("hr-HR")} ukupno) možeš doseći za <strong className="font-medium text-slate-900 dark:text-slate-100">{data.maxMinutes} minuta</strong> koristeći tramvaj, bus i hodanje. Uzorkovane su samo naseljene točke (blizu zgrada).
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-6 text-[18px] leading-relaxed text-slate-700 dark:text-slate-300 lg:flex-row lg:gap-16">
        <div className="flex-1 space-y-6">
          <ScoreMeaningDetails base={base} bajs={bajs} />
        </div>
      </div>
    </section>
  )
}

function ScoreMeaningDetails({
  base,
  bajs,
}: {
  base: ReturnType<typeof computeBaseInsights>
  bajs: ReturnType<typeof computeBajsInsights>
}) {
  return (
    <>
      <p>
        <strong className="font-medium text-slate-900 dark:text-slate-100">
          {base.best.name}
        </strong>{" "}
        ima rezultat 100 - njeni stanovnici prosječno mogu doseći{" "}
        {base.bestPct}% grada.{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">
          {base.worst.name}
        </strong>{" "}
        ima rezultat {base.worst.score} - samo {base.worstPct}%.
      </p>
      {bajs.hasBajs && (
        <p>
          Dodatno mjerimo utjecaj{" "}
          <strong className="font-medium text-amber-700 dark:text-amber-400">
            BAJS bike-sharinga
          </strong>{" "}
          - u idealnom scenariju (svaka stanica ima bicikl) prosječni
          stanovnik grada dobiva{" "}
          <strong className="font-medium text-slate-900 dark:text-slate-100">
            +{bajs.cityBajsBoost}%
          </strong>{" "}
          veći doseg.
        </p>
      )}
    </>
  )
}

function AccessibilityGapSection({ base }: { base: ReturnType<typeof computeBaseInsights> }) {
  return (
    <section id="jaz" className="flex flex-col border-t border-slate-200 py-16 sm:py-24 dark:border-white/10">
      <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-serif text-[28px] tracking-tight text-rose-800 sm:text-[32px] dark:text-rose-400">
            Jaz u dostupnosti
          </h2>
          <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
            Samo <strong className="font-medium text-rose-900 dark:text-rose-300">{base.totalPop > 0 ? Math.round((base.goodPop / base.totalPop) * 100) : 0}%</strong> Zagrepčana ({base.goodPop.toLocaleString("hr-HR")} stan.) živi u
            četvrtima s rezultatom ≥50. Istovremeno, <strong className="font-medium text-rose-900 dark:text-rose-300">{base.totalPop > 0 ? Math.round((base.poorPop / base.totalPop) * 100) : 0}%</strong> ({base.poorPop.toLocaleString("hr-HR")} stan.) živi u četvrtima gdje je
            rezultat ispod 25 - to uključuje <span className="text-slate-600 dark:text-slate-400">{base.poorDistricts.map((d) => d.name).join(", ")}</span>.
          </p>
        </div>
      </div>
    </section>
  )
}

const sectionColorMap: Record<string, string> = {
  slate: "text-slate-800 dark:text-slate-200",
  rose: "text-rose-800 dark:text-rose-200",
  emerald: "text-emerald-800 dark:text-emerald-200",
  teal: "text-teal-800 dark:text-teal-200",
  violet: "text-violet-800 dark:text-violet-200",
  red: "text-red-800 dark:text-red-200",
  amber: "text-amber-800 dark:text-amber-200",
  sky: "text-sky-800 dark:text-sky-200",
  blue: "text-blue-800 dark:text-blue-200",
  orange: "text-orange-800 dark:text-orange-200",
  indigo: "text-indigo-800 dark:text-indigo-200",
}

const sectionBgMap: Record<string, string> = {
  slate: "dark:bg-white/10",
  rose: "dark:bg-rose-500/20",
  emerald: "dark:bg-emerald-500/20",
  teal: "dark:bg-teal-500/20",
  violet: "dark:bg-violet-500/20",
  red: "dark:bg-red-500/20",
  amber: "dark:bg-amber-500/20",
  sky: "dark:bg-sky-500/20",
  blue: "dark:bg-blue-500/20",
  orange: "dark:bg-orange-500/20",
  indigo: "dark:bg-indigo-500/20",
}

function SectionIconSvg({ icon }: { icon: string }) {
  const paths: Record<string, React.ReactNode> = {
    info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>,
    warning: <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
    chart: <><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></>,
    tram: <><rect x="4" y="3" width="16" height="14" rx="2" /><path d="M12 3v14" /><path d="M4 10h16" /><path d="M7 21l2-4" /><path d="M17 21l-2-4" /></>,
    flag: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></>,
    clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
    venn: <><circle cx="7.5" cy="7.5" r="5.5" /><circle cx="16.5" cy="16.5" r="5.5" /></>,
    moon: <><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
    pin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
    bars: <><path d="M2 20h.01" /><path d="M7 20v-4" /><path d="M12 20v-8" /><path d="M17 20V8" /><path d="M22 4v16" /></>,
    bolt: <><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></>,
    "circle-down": <><circle cx="12" cy="12" r="10" /><path d="m16 10-4 4-4-4" /></>,
  }
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths[icon]}
    </svg>
  )
}

function SectionIcon({ icon, color, title }: { icon: string; color: string; title: string }) {
  return (
    <div className={`mb-6 flex items-center gap-3 ${sectionColorMap[color] ?? ""}`}>
      <span className={`flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm ${sectionBgMap[color] ?? ""}`}>
        <SectionIconSvg icon={icon} />
      </span>
      <h2 className="font-serif text-[22px] text-slate-900 dark:text-slate-100">{title}</h2>
    </div>
  )
}

function LorenzSection({
  giniData,
}: {
  giniData: ReturnType<typeof computeGiniData>
}) {
  return (
    <section id="lorenz" className="flex flex-col border-t border-slate-200 py-16 sm:py-24 dark:border-white/10">
      <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-serif text-[28px] tracking-tight text-slate-900 sm:text-[32px] dark:text-slate-100">
            Lorenzova krivulja dostupnosti
          </h2>
          <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
            Krivulja prikazuje kumulativni udio stanovništva u odnosu na kumulativni udio dostupnosti. Što je krivulja bliže dijagonali, to je raspodjela pravednija.
          </p>
        </div>
      </div>
      <div className="flex flex-col md:flex-row md:items-start md:gap-16">
        <div className="w-full md:w-[320px] md:shrink-0">
          <LorenzChart lorenzPoints={giniData.lorenzPoints} />
          <p className="mt-6 text-center text-[13px] leading-snug text-slate-500 dark:text-slate-400">
            Što je krivulja dalje od dijagonale, to je nejednakost veća.
          </p>
        </div>
        <div className="mt-12 flex-1 text-[18px] leading-relaxed text-slate-700 md:mt-0 dark:text-slate-300">
          <p>
            Ova krivulja prikazuje kumulativni udio dostupnosti u odnosu na
            kumulativni udio stanovništva.
          </p>
          <p className="mt-6">
            Kada bi svi građani imali jednaku dostupnost, krivulja bi pratila
            ravnu dijagonalu (linija savršene jednakosti). Odstupanje od te linije
            pokazuje koliko su resursi neravnomjerno raspoređeni po gradu.
          </p>
          <div className="mt-12">
            <LorenzAccessibilityTable popSorted={giniData.popSorted} />
          </div>
        </div>
      </div>
    </section>
  )
}

function LorenzChart({ lorenzPoints }: { lorenzPoints: { x: number; y: number }[] }) {
  const lm = { top: 10, right: 10, bottom: 30, left: 30 }
  const lw = 280
  const lh = 280
  const liw = lw - lm.left - lm.right
  const lih = lh - lm.top - lm.bottom
  const lxScale = scaleLinear<number>({ domain: [0, 1], range: [0, liw] })
  const lyScale = scaleLinear<number>({ domain: [0, 1], range: [lih, 0] })

  return (
    <div className="relative mx-auto w-full max-w-[320px]">
      <svg viewBox={`0 0 ${lw} ${lh}`} className="w-full" aria-label="Lorenzova krivulja dostupnosti">
        <Group top={lm.top} left={lm.left}>
          <LorenzGridAndCurve
            lorenzPoints={lorenzPoints}
            lxScale={lxScale}
            lyScale={lyScale}
            liw={liw}
            lih={lih}
          />
          <LorenzAxisLabels lxScale={lxScale} lyScale={lyScale} liw={liw} lih={lih} />
        </Group>
      </svg>
    </div>
  )
}

function LorenzGridAndCurve({
  lorenzPoints,
  lxScale,
  lyScale,
  liw,
  lih,
}: {
  lorenzPoints: { x: number; y: number }[]
  lxScale: ReturnType<typeof scaleLinear<number>>
  lyScale: ReturnType<typeof scaleLinear<number>>
  liw: number
  lih: number
}) {
  return (
    <>
      <GridRows scale={lyScale} width={liw} tickValues={[0.25, 0.5, 0.75]} stroke="#94a3b8" strokeOpacity={0.15} strokeWidth={1} />
      <GridColumns scale={lxScale} height={lih} tickValues={[0.25, 0.5, 0.75]} stroke="#94a3b8" strokeOpacity={0.15} strokeWidth={1} />
      <polygon
        points={[
          ...lorenzPoints.map((p) => `${lxScale(p.x)},${lyScale(p.x)}`),
          ...[...lorenzPoints].reverse().map((p) => `${lxScale(p.x)},${lyScale(p.y)}`),
        ].join(" ")}
        fill="#6ee7b7"
        fillOpacity={0.3}
      />
      <line x1={0} y1={lih} x2={liw} y2={0} stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 3" />
      <LinePath<{ x: number; y: number }>
        data={lorenzPoints}
        x={(d) => lxScale(d.x)}
        y={(d) => lyScale(d.y)}
        stroke="#059669"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
    </>
  )
}

function LorenzAxisLabels({
  lxScale,
  lyScale,
  liw,
  lih,
}: {
  lxScale: ReturnType<typeof scaleLinear<number>>
  lyScale: ReturnType<typeof scaleLinear<number>>
  liw: number
  lih: number
}) {
  return (
    <>
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <text key={`xt-${v}`} x={lxScale(v)} y={lih + 16} textAnchor="middle" className="fill-slate-400 text-[8px] dark:fill-slate-500">
          {Math.round(v * 100)}%
        </text>
      ))}
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <text key={`yt-${v}`} x={-8} y={lyScale(v) + 1} textAnchor="end" dominantBaseline="middle" className="fill-slate-400 text-[8px] dark:fill-slate-500">
          {Math.round(v * 100)}%
        </text>
      ))}
      <text x={liw / 2} y={lih + 28} textAnchor="middle" className="fill-slate-500 text-[9px] dark:fill-slate-400">
        Udio stanovništva (%)
      </text>
      <text x={-22} y={lih / 2} textAnchor="middle" dominantBaseline="middle" transform={`rotate(-90, -22, ${lih / 2})`} className="fill-slate-500 text-[9px] dark:fill-slate-400">
        Udio dostupnosti (%)
      </text>
    </>
  )
}

function LorenzAccessibilityTable({ popSorted }: { popSorted: DistrictScore[] }) {
  return (
    <div className="sr-only">
      <table>
        <caption>Lorenzova krivulja - podaci po četvrtima sortirani po dostupnosti</caption>
        <thead>
          <tr>
            <th scope="col">Četvrt</th>
            <th scope="col">Rezultat</th>
            <th scope="col">Populacija</th>
          </tr>
        </thead>
        <tbody>
          {popSorted.map((d) => (
            <tr key={d.osmId}>
              <td>{d.name}</td>
              <td>{d.score}</td>
              <td>{(d.population ?? 0).toLocaleString("hr-HR")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GiniSection({
  giniData,
}: {
  giniData: ReturnType<typeof computeGiniData>
}) {
  return (
    <section id="gini" className="flex flex-col border-t border-slate-200 py-16 sm:py-24 dark:border-white/10">
      <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-serif text-[28px] tracking-tight text-slate-900 sm:text-[32px] dark:text-slate-100">
            Gini koeficijent
          </h2>
          <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
            Gini koeficijent mjeri nejednakost. 0 predstavlja savršenu jednakost (svi imaju istu dostupnost), a 1 potpunu nejednakost.
          </p>
        </div>
      </div>
      
      <div className="flex flex-col gap-12 lg:flex-row lg:items-start lg:gap-16">
        <div className="flex shrink-0 items-baseline gap-2">
          <span className="font-serif text-[96px] leading-none tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
            {fmtHR(giniData.gini, 2)}
          </span>
        </div>
        <div className="flex-1">
          <GiniCards giniData={giniData} />
          <div className="mt-12 text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
            <GiniInterpretation giniData={giniData} />
            <p className="mt-6">
              Za usporedbu: većina europskih gradova s dobrim javnim prijevozom
              ima Gini koeficijent između 0,25 i 0,35. Više vrijednosti ukazuju da je dobar javni prijevoz koncentriran samo u malom dijelu grada.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function GiniCards({ giniData }: { giniData: ReturnType<typeof computeGiniData> }) {
  return (
    <div className="grid grid-cols-1 gap-8 border-l-2 border-slate-200 pl-6 sm:grid-cols-3 dark:border-white/10">
      <div className="flex flex-col">
        <div className="font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">Jutro</div>
        <div className="mt-2 font-serif text-[32px] leading-none text-slate-900 tabular-nums dark:text-slate-100">{fmtHR(giniData.gini, 3)}</div>
      </div>
      <div className="flex flex-col">
        <div className="font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">S BAJS-om</div>
        <div className={`mt-2 font-serif text-[32px] leading-none tabular-nums ${giniData.bajsGini > giniData.gini ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
          {fmtHR(giniData.bajsGini, 3)}
        </div>
      </div>
      <div className="flex flex-col">
        <div className="font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">Večer</div>
        <div className="mt-2 font-serif text-[32px] leading-none text-slate-900 tabular-nums dark:text-slate-100">{fmtHR(giniData.eveningGini, 3)}</div>
      </div>
    </div>
  )
}

function GiniInterpretation({ giniData }: { giniData: ReturnType<typeof computeGiniData> }) {
  return (
    <p>
      BAJS bike-sharing blago{" "}
      {giniData.giniDiff > 0 ? "pogor\u0161ava" : "pobolj\u0161ava"} jednakost
      (Gini {giniData.giniDiff > 0 ? "+" : ""}
      {fmtHR(giniData.giniDiff, 3)}) jer su stanice
      koncentrirane u već dobro povezanim četvrtima. Proširenje mreže
      prema rubnim četvrtima moglo bi smanjiti nejednakost.
    </p>
  )
}

function TramSection({ freq }: { freq: ReturnType<typeof computeFrequencyInsights> }) {
  if (freq.tramlessDistricts.length === 0) return null
  return (
    <section id="tramvaj" className="flex flex-col border-t border-slate-200 py-16 sm:py-24 dark:border-white/10">
      <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-serif text-[28px] tracking-tight text-slate-900 sm:text-[32px] dark:text-slate-100">
            Tramvaj je kralj
          </h2>
          <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
            Nijedna četvrt bez tramvaja ne prelazi rezultat <strong className="font-medium text-slate-900 dark:text-slate-100">{freq.bestTramless}</strong>. Broj tramvajskih linija je najjači prediktor rezultata - četvrti s više od 10 linija prosječno imaju rezultat <strong className="font-medium text-slate-900 dark:text-slate-100">{freq.avgScoreWithManyTramLines}</strong>.
          </p>
        </div>
      </div>
      <div className="flex flex-col md:flex-row md:items-start md:gap-12">
        <div className="mt-8 md:mt-0 md:w-1/2">
          <div className="mb-6 font-sans text-[13px] font-bold tracking-widest text-slate-500 dark:text-slate-400 uppercase">
            {freq.tramlessDistricts.length} četvrti bez tramvaja
          </div>
          <TramlessScores districts={freq.tramlessDistricts} />
        </div>
      </div>
    </section>
  )
}

function TramlessScores({ districts }: { districts: DistrictScore[] }) {
  return (
    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-slate-600 dark:text-slate-400">
      {[...districts]
        .sort((a, b) => b.score - a.score)
        .map((d) => (
          <span key={d.name}>
            {d.name}:{" "}
            <strong className="font-medium text-slate-900 dark:text-slate-100">
              {d.score}
            </strong>
          </span>
        ))}
    </div>
  )
}

function HzTrainSection({ data }: { data: ScoreData }) {
  const withTrains = data.districts.filter(
    (d) => (d.trainLines?.length ?? 0) > 0
  )
  const anyTrainBoost = withTrains.some(
    (d) => (d.trainBoostPct ?? 0) > 0
  )
  if (withTrains.length === 0 || anyTrainBoost) return null
  return (
    <section id="vlak" className="flex flex-col border-t border-slate-200 py-16 sm:py-24 dark:border-white/10">
      <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-serif text-[28px] tracking-tight text-slate-900 sm:text-[32px] dark:text-slate-100">
            HŽ vlak - neiskorišten potencijal
          </h2>
          <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
            HŽ ima stanice u <strong className="font-medium text-slate-900 dark:text-slate-100">{withTrains.length}</strong> od {data.districts.length} četvrti. Međutim, doprinos vlaka u prosječnom 30-minutnom putovanju je zanemariv.
          </p>
        </div>
      </div>
      <div className="flex flex-col md:flex-row md:items-start md:gap-12">
        <div className="md:w-1/2">
          <HzTrainBody withTrains={withTrains} totalDistricts={data.districts.length} />
        </div>
        <div className="mt-8 md:mt-0 md:w-1/2">
          <div className="mb-6 font-sans text-[13px] font-bold tracking-widest text-slate-500 dark:text-slate-400 uppercase">
            Četvrti uz željeznicu
          </div>
          <HzTrainDistrictList withTrains={withTrains} />
        </div>
      </div>
    </section>
  )
}

function HzTrainBody({ withTrains, totalDistricts }: { withTrains: DistrictScore[]; totalDistricts: number }) {
  return (
    <div className="space-y-6 text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
      <p>
        <strong className="font-medium text-slate-900 dark:text-slate-100">
          {withTrains.length} od {totalDistricts} četvrti
        </strong>{" "}
        ima pristup željezničkoj mreži - ali vlak ne poboljšava
        30-minutnu dostupnost ni u jednoj od njih. Doprinos
        vlaka je <strong className="font-medium text-slate-900 dark:text-slate-100">0%</strong> posvuda.
      </p>
      <p>
        Razlog je frekvencija. HŽ regionalni vlakovi voze svakih
        30-60 minuta. Uz prosječno čekanje od 15-30 minuta, putnik
        potroši većinu svog 30-minutnog budžeta samo čekajući na
        peronu. Kad vlak napokon stigne, preostalo vrijeme nije
        dovoljno da bi značajno proširilo doseg u usporedbi s
        tramvajem ili autobusom koji su već krenuli.
      </p>
      <p className="text-[15px] text-slate-500 dark:text-slate-400">
        Za usporedbu: tramvaj u vršnom satu dolazi svakih 7-10 minuta
        po liniji, ali na frekventnim stanicama s više linija
        efektivno čekanje je ~2-3 min. Kad bi HŽ vozio svakih 15
        minuta, čekanje bi palo na ~7 min i vlak bi značajno proširio
        doseg perifernih četvrti poput Sesveta i Velike Gorice.
      </p>
    </div>
  )
}

function HzTrainDistrictList({ withTrains }: { withTrains: DistrictScore[] }) {
  return (
    <div className="flex flex-col gap-4 text-[14px] text-slate-600 dark:text-slate-400">
      {withTrains
        .sort((a, b) => b.score - a.score)
        .map((d) => (
          <div key={d.name} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0 dark:border-white/5">
            <span className="font-medium text-slate-700 dark:text-slate-300">{d.name}</span>
            <div className="flex items-center gap-4">
              <span>
                <strong className="font-medium text-slate-900 dark:text-slate-100">
                  {d.trainLines?.length ?? 0}
                </strong>{" "}
                linija
              </span>
              <span className="w-16 text-right">
                boost <strong className="font-medium text-slate-900 dark:text-slate-100">0%</strong>
              </span>
            </div>
          </div>
        ))}
    </div>
  )
}

function DensityScatterSection({
  scatter,
}: {
  scatter: ReturnType<typeof computeScatterData>
}) {
  const scatterMargin = { top: 20, right: 16, bottom: 50, left: 40 }
  const scatterW = 400
  const scatterH = 320
  const scatterInnerW = scatterW - scatterMargin.left - scatterMargin.right
  const scatterInnerH = scatterH - scatterMargin.top - scatterMargin.bottom
  const scatterCeilDensity = Math.ceil(scatter.maxDensity / 100) * 100 || scatter.maxDensity + 10
  const scatterXScale = scaleLinear<number>({ domain: [0, scatterCeilDensity], range: [0, scatterInnerW] })
  const scatterYScale = scaleLinear<number>({ domain: [0, 100], range: [scatterInnerH, 0] })
  const scatterMaxPop = Math.max(...scatter.densityData.map((d) => d.population))
  const scatterRScale = scaleSqrt<number>({ domain: [0, scatterMaxPop], range: [4, 18] })

  return (
    <section id="gustoca" className="flex flex-col border-t border-slate-200 py-16 sm:py-24 dark:border-white/10">
      <DensitySectionHeader />
      <div className="mt-12 flex flex-col items-start gap-12 lg:flex-row lg:gap-16">
        <div className="w-full lg:w-[480px] shrink-0">
          <ScatterPlot
            scatter={scatter}
            scatterMargin={scatterMargin}
            scatterW={scatterW}
            scatterH={scatterH}
            scatterInnerW={scatterInnerW}
            scatterInnerH={scatterInnerH}
            scatterCeilDensity={scatterCeilDensity}
            scatterXScale={scatterXScale}
            scatterYScale={scatterYScale}
            scatterRScale={scatterRScale}
          />
          <ScatterLegend />
          <ScatterAccessibilityTable densityData={scatter.densityData} />
        </div>
        <div className="flex-1">
          <DensityInterpretation scatter={scatter} />
        </div>
      </div>
    </section>
  )
}

function DensitySectionHeader() {
  return (
    <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="font-serif text-[28px] tracking-tight text-slate-900 sm:text-[32px] dark:text-slate-100">
          Gustoća vs. povezanost
        </h2>
        <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-600 dark:text-slate-400">
          Svaka točka je jedna gradska četvrt. Idealno bi gušće naseljene
          četvrti trebale imati bolji javni prijevoz - ali to u Zagrebu često
          nije slučaj.
        </p>
      </div>
    </div>
  )
}

function ScatterPlot({
  scatter,
  scatterMargin,
  scatterW,
  scatterH,
  scatterInnerW,
  scatterInnerH,
  scatterCeilDensity,
  scatterXScale,
  scatterYScale,
  scatterRScale,
}: {
  scatter: ReturnType<typeof computeScatterData>
  scatterMargin: { top: number; right: number; bottom: number; left: number }
  scatterW: number
  scatterH: number
  scatterInnerW: number
  scatterInnerH: number
  scatterCeilDensity: number
  scatterXScale: ReturnType<typeof scaleLinear<number>>
  scatterYScale: ReturnType<typeof scaleLinear<number>>
  scatterRScale: ReturnType<typeof scaleSqrt<number>>
}) {
  return (
    <svg viewBox={`0 0 ${scatterW} ${scatterH}`} className="w-full" role="img" aria-label="Raspršeni dijagram gustoće stanovništva i rezultata povezanosti po četvrtima">
      <Group top={scatterMargin.top} left={scatterMargin.left}>
        <ScatterGrid scatterYScale={scatterYScale} scatterInnerW={scatterInnerW} scatterInnerH={scatterInnerH} />
        <ScatterAxes
          scatterXScale={scatterXScale}
          scatterYScale={scatterYScale}
          scatterInnerW={scatterInnerW}
          scatterInnerH={scatterInnerH}
          scatterCeilDensity={scatterCeilDensity}
        />
        <ScatterPoints densityData={scatter.densityData} scatterXScale={scatterXScale} scatterYScale={scatterYScale} scatterRScale={scatterRScale} />
        <ScatterLabels scatter={scatter} scatterXScale={scatterXScale} scatterYScale={scatterYScale} scatterRScale={scatterRScale} />
      </Group>
    </svg>
  )
}

function ScatterGrid({
  scatterYScale,
  scatterInnerW,
  scatterInnerH,
}: {
  scatterYScale: ReturnType<typeof scaleLinear<number>>
  scatterInnerW: number
  scatterInnerH: number
}) {
  return (
    <>
      <GridRows scale={scatterYScale} width={scatterInnerW} tickValues={[25, 50, 75]} stroke="#94a3b8" strokeOpacity={0.15} strokeWidth={1} strokeDasharray="3,3" />
      {[0, 25, 50, 75, 100].map((v) => (
        <text key={v} x={-6} y={scatterYScale(v) + 1} textAnchor="end" dominantBaseline="middle" className="fill-slate-400 text-[8px] dark:fill-slate-500">{v}</text>
      ))}
      <line x1={0} y1={0} x2={0} y2={scatterInnerH} stroke="#cbd5e1" strokeWidth={0.5} />
      <line x1={0} y1={scatterInnerH} x2={scatterInnerW} y2={scatterInnerH} stroke="#cbd5e1" strokeWidth={0.5} />
    </>
  )
}

function ScatterAxes({
  scatterXScale,
  scatterInnerW,
  scatterInnerH,
  scatterCeilDensity,
}: {
  scatterXScale: ReturnType<typeof scaleLinear<number>>
  scatterYScale: ReturnType<typeof scaleLinear<number>>
  scatterInnerW: number
  scatterInnerH: number
  scatterCeilDensity: number
}) {
  return (
    <>
      {[0, Math.round(scatterCeilDensity / 2), scatterCeilDensity].map((v) => (
        <text key={v} x={scatterXScale(v)} y={scatterInnerH + 16} textAnchor="middle" className="fill-slate-400 text-[8px] dark:fill-slate-500">{v}</text>
      ))}
      <text x={scatterInnerW / 2} y={scatterInnerH + 32} textAnchor="middle" className="fill-slate-500 text-[9px] dark:fill-slate-400">
        Gustoća (stan. / uzorak)
      </text>
      <text x={-28} y={scatterInnerH / 2} textAnchor="middle" dominantBaseline="middle" transform={`rotate(-90, -28, ${scatterInnerH / 2})`} className="fill-slate-500 text-[9px] dark:fill-slate-400">
        Rezultat
      </text>
    </>
  )
}

function ScatterPoints({
  densityData,
  scatterXScale,
  scatterYScale,
  scatterRScale,
}: {
  densityData: DensityDatum[]
  scatterXScale: ReturnType<typeof scaleLinear<number>>
  scatterYScale: ReturnType<typeof scaleLinear<number>>
  scatterRScale: ReturnType<typeof scaleSqrt<number>>
}) {
  return (
    <>
      {densityData.map((d) => {
        const cx = scatterXScale(d.density)
        const cy = scatterYScale(d.score)
        const r = scatterRScale(d.population)
        const title = `${d.name}: rezultat ${d.score}, gustoća ${Math.round(d.density)}, ${d.population} stan.`
        if (d.hasTram) {
          return (
            <circle key={d.name} cx={cx} cy={cy} r={r} fill="#16a34a" fillOpacity={0.6} stroke="#15803d" strokeWidth={0.5}>
              <title>{title}</title>
            </circle>
          )
        }
        const s = r * 1.2
        return (
          <polygon key={d.name} points={`${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`} fill="#8b5cf6" fillOpacity={0.6} stroke="#7c3aed" strokeWidth={0.5}>
            <title>{title}</title>
          </polygon>
        )
      })}
    </>
  )
}

function ScatterLabels({
  scatter,
  scatterXScale,
  scatterYScale,
  scatterRScale,
}: {
  scatter: ReturnType<typeof computeScatterData>
  scatterXScale: ReturnType<typeof scaleLinear<number>>
  scatterYScale: ReturnType<typeof scaleLinear<number>>
  scatterRScale: ReturnType<typeof scaleSqrt<number>>
}) {
  return (
    <>
      {scatter.scatterDonjiGrad && (
        <text x={scatterXScale(scatter.scatterDonjiGrad.density) - scatterRScale(scatter.scatterDonjiGrad.population) - 3} y={scatterYScale(scatter.scatterDonjiGrad.score) + 1} textAnchor="end" dominantBaseline="middle" className="fill-slate-700 text-[8px] font-medium dark:fill-slate-300">
          Donji grad
        </text>
      )}
      {scatter.scatterSesvete && (
        <text x={scatterXScale(scatter.scatterSesvete.density) + scatterRScale(scatter.scatterSesvete.population) + 3} y={scatterYScale(scatter.scatterSesvete.score) + 1} textAnchor="start" dominantBaseline="middle" className="fill-slate-700 text-[8px] font-medium dark:fill-slate-300">
          Sesvete
        </text>
      )}
      {scatter.scatterNovizg && (
        <text x={scatterXScale(scatter.scatterNovizg.density) + scatterRScale(scatter.scatterNovizg.population) + 3} y={scatterYScale(scatter.scatterNovizg.score) + 1} textAnchor="start" dominantBaseline="middle" className="fill-slate-700 text-[8px] font-medium dark:fill-slate-300">
          {scatter.scatterNovizg.name}
        </text>
      )}
    </>
  )
}

function ScatterLegend() {
  return (
    <div className="mt-3 flex items-center justify-center gap-6 text-[12px] text-slate-500 dark:text-slate-400">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-600 opacity-70" />
        Ima tramvaj (krug)
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <polygon points="5,0 10,5 5,10 0,5" fill="#8b5cf6" fillOpacity="0.7" />
        </svg>
        Bez tramvaja (romb)
      </span>
    </div>
  )
}

function ScatterAccessibilityTable({ densityData }: { densityData: DensityDatum[] }) {
  return (
    <div className="sr-only">
      <table>
        <caption>Gustoća vs. povezanost - podaci po četvrtima</caption>
        <thead>
          <tr>
            <th scope="col">Četvrt</th>
            <th scope="col">Rezultat</th>
            <th scope="col">Gustoća (stan./uzorak)</th>
            <th scope="col">Populacija</th>
            <th scope="col">Tramvaj</th>
          </tr>
        </thead>
        <tbody>
          {densityData.map((d) => (
            <tr key={d.name}>
              <td>{d.name}</td>
              <td>{d.score}</td>
              <td>{Math.round(d.density)}</td>
              <td>{d.population.toLocaleString("hr-HR")}</td>
              <td>{d.hasTram ? "Da" : "Ne"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DensityInterpretation({ scatter }: { scatter: ReturnType<typeof computeScatterData> }) {
  return (
    <div className="flex flex-col rounded-3xl bg-violet-50/50 p-8 dark:bg-violet-950/10">
      <SectionIcon icon="venn" color="violet" title="Što graf otkriva?" />
      <div className="space-y-4 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
        <p>
          Četvrti s tramvajem (zelene) grupiraju se iznad rezultata 30,
          dok četvrti bez tramvaja (ljubičaste) konzistentno zaostaju.
        </p>
        <DensitySesveteInsight scatter={scatter} />
        <DensityDonjiGradInsight scatter={scatter} />
      </div>
    </div>
  )
}

function DensitySesveteInsight({ scatter }: { scatter: ReturnType<typeof computeScatterData> }) {
  return (
    <p>
      <strong className="font-medium text-slate-900 dark:text-slate-100">
        Sesvete
      </strong>{" "}
      s{" "}
      <strong className="font-medium text-slate-900 dark:text-slate-100">
        {(
          scatter.densityData.find((d) => d.name === "Sesvete")
            ?.population ?? 0
        ).toLocaleString("hr-HR")}
      </strong>{" "}
      stanovnika i rezultatom{" "}
      {scatter.densityData.find((d) => d.name === "Sesvete")?.score ?? 15}{" "}
      je najveći primjer lošeg omjera
      gustoće i povezanosti u gradu.
    </p>
  )
}

function DensityDonjiGradInsight({ scatter }: { scatter: ReturnType<typeof computeScatterData> }) {
  return (
    <p>
      <strong className="font-medium text-slate-900 dark:text-slate-100">
        Donji grad
      </strong>{" "}
      (rezultat 100) ima samo{" "}
      <strong className="font-medium text-slate-900 dark:text-slate-100">
        {(scatter.scatterDonjiGrad?.population ?? 0).toLocaleString("hr-HR")}
      </strong>{" "}
      stanovnika ali najgušću mrežu -{" "}
      <strong className="font-medium text-slate-900 dark:text-slate-100">
        {scatter.scatterDonjiGrad?.tramLineCount ?? 0}
      </strong>{" "}
      tramvajskih linija na samo{" "}
      <strong className="font-medium text-slate-900 dark:text-slate-100">
        {fmtHR((scatter.scatterDonjiGrad?.sampleCount ?? 0) * 0.04, 1)}
      </strong>{" "}
      km².
    </p>
  )
}

function TransitDesertSection({
  data,
  desert,
}: {
  data: ScoreData
  desert: ReturnType<typeof computeDesertInsights>
}) {
  if (!desert.hasDesertData && desert.lowFreqDistricts.length === 0) return null
  return (
    <section id="pustinje" className="flex flex-col border-t border-slate-200 py-16 sm:py-24 dark:border-white/10">
      <TransitDesertHeader />
      <div className="flex flex-col items-start gap-12 lg:flex-row lg:gap-16">
        {desert.hasDesertData && desert.desertDistricts.length > 0 && (
          <div className="w-full lg:w-[400px] shrink-0">
            <DesertRanking data={data} desert={desert} />
          </div>
        )}
        {desert.hasDesertData && (
          <div className="flex-1">
            <DesertInterpretation data={data} desert={desert} />
          </div>
        )}
      </div>
    </section>
  )
}

function TransitDesertHeader() {
  return (
    <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="font-serif text-[28px] tracking-tight text-slate-900 sm:text-[32px] dark:text-slate-100">
          Prometne pustinje
        </h2>
        <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-600 dark:text-slate-400">
          Područja gdje je najbliža stanica udaljena više od 500 metara
          zračne linije (realna pješačka udaljenost je 20-40% veća) ili gdje
          prijevoz dolazi rjeđe od 2 puta na sat.
        </p>
      </div>
    </div>
  )
}

function DesertRanking({ data, desert }: { data: ScoreData; desert: ReturnType<typeof computeDesertInsights> }) {
  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="font-sans text-[13px] font-bold tracking-widest text-slate-500 dark:text-slate-400 uppercase">
          Daleko od stanice (&gt;500m)
        </h3>
        {data.cityDesertPct !== undefined && (
          <span className="font-serif text-[14px] text-slate-500 dark:text-slate-400">
            {data.cityDesertPct}% grada
          </span>
        )}
      </div>
      <p className="mb-6 text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
        Udio uzorkovanih točaka u svakoj četvrti udaljenijih više od
        500m od najbliže stanice javnog prijevoza.
      </p>
      <RankingList
        items={desert.desertDistricts}
        value={(d) => d.desertPct ?? 0}
        label={(d) => `${d.desertPct}%`}
        trailing={(d) => `~${d.avgNearestStopM}m`}
        color={{
          text: "text-rose-700 dark:text-rose-400",
          bg: "bg-rose-100 dark:bg-rose-900/30",
          bar: "bg-rose-500",
        }}
      />
    </div>
  )
}

function DesertInterpretation({ data, desert }: { data: ScoreData; desert: ReturnType<typeof computeDesertInsights> }) {
  return (
    <div>
      <h3 className="font-serif text-[28px] text-rose-800 dark:text-rose-400">
        Koliko je to loše?
      </h3>
      <DesertStatCards data={data} desert={desert} />
      <DesertInterpretationText desert={desert} />
    </div>
  )
}

function DesertStatCards({ data, desert }: { data: ScoreData; desert: ReturnType<typeof computeDesertInsights> }) {
  return (
    <div className="my-8 grid grid-cols-1 sm:grid-cols-2 gap-8 border-b border-t border-slate-200 py-6 dark:border-white/10">
      <div className="flex flex-col border-l-2 border-rose-500 pl-4 py-1">
        <div className="font-serif text-[48px] leading-none text-slate-900 tabular-nums dark:text-slate-100">
          {data.cityDesertPct ?? 0}%
        </div>
        <div className="mt-2 text-[14px] leading-snug text-slate-500 dark:text-slate-400">
          uzorkovanih točaka grada je &gt;500m od stanice
        </div>
      </div>
      <div className="flex flex-col border-l-2 border-rose-500 pl-4 py-1">
        <div className="font-serif text-[48px] leading-none text-slate-900 tabular-nums dark:text-slate-100">
          {desert.desertDistricts.length}
        </div>
        <div className="mt-2 text-[14px] leading-snug text-slate-500 dark:text-slate-400">
          od {data.districts.length} četvrti ima barem jednu pustinjsku zonu
        </div>
      </div>
    </div>
  )
}

function DesertInterpretationText({ desert }: { desert: ReturnType<typeof computeDesertInsights> }) {
  return (
    <div className="space-y-6 text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
      <p>
        Najveća prometna pustinja je{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">
          {desert.desertDistricts[0]?.name}
        </strong>{" "}
        - {desert.desertDistricts[0]?.desertPct}% uzorkovanih točaka je
        više od 500m zračne linije od najbliže stanice, s prosječnom
        udaljenošću od{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">
          ~{desert.desertDistricts[0]?.avgNearestStopM}m
        </strong>
        .
      </p>
      {desert.lowFreqDistricts.length > 0 && (
        <p>
          Dodatno,{" "}
          <strong className="font-medium text-slate-900 dark:text-slate-100">
            {desert.lowFreqDistricts.length}
          </strong>{" "}
          {desert.lowFreqDistricts.length === 1
            ? "četvrt ima"
            : "četvrti imaju"}{" "}
          medijan intervala ≥30 min - manje od 2 polaska na sat (
          {desert.lowFreqDistricts.map((d) => d.name).join(", ")}).
        </p>
      )}
    </div>
  )
}

function StopDistanceSection({
  desert,
}: {
  desert: ReturnType<typeof computeDesertInsights>
}) {
  if (!desert.hasStopDistData || desert.stopDistSorted.length === 0) return null
  return (
    <section id="udaljenost-stajalista" className="flex flex-col border-t border-slate-200 py-16 sm:py-24 dark:border-white/10">
      <StopDistanceHeader />
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
        <StopDistanceChart desert={desert} />
        <StopDistanceInterpretation desert={desert} />
      </div>
    </section>
  )
}

function StopDistanceHeader() {
  return (
    <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="font-serif text-[28px] tracking-tight text-slate-900 sm:text-[32px] dark:text-slate-100">
          Udaljenost do najbližeg stajališta
        </h2>
        <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-600 dark:text-slate-400">
          Prosječna udaljenost pješačenja do najbliže stanice javnog
          prijevoza. Urbanistički standard od <strong className="font-medium text-slate-900 dark:text-slate-100">400 metara</strong> smatra se ugodnom pješačkom udaljenošću - sve iznad toga
          odvraća ljude od korištenja javnog prijevoza.
        </p>
      </div>
    </div>
  )
}

function StopDistanceChart({ desert }: { desert: ReturnType<typeof computeDesertInsights> }) {
  return (
    <div>
      <h3 className="mb-6 font-sans text-[13px] font-bold tracking-widest text-slate-500 dark:text-slate-400 uppercase">
        Prosječna udaljenost po četvrti (m)
      </h3>
      <div className="flex flex-col gap-2">
        {desert.stopDistSorted.slice(0, 10).map((d, i) => (
          <StopDistanceBar key={d.osmId} d={d} i={i} maxStopDist={desert.maxStopDist} />
        ))}
      </div>
      <StopDistanceLegend />
    </div>
  )
}

function StopDistanceBar({ d, i, maxStopDist }: { d: DistrictScore; i: number; maxStopDist: number }) {
  const meters = d.avgNearestStopM ?? 0
  const barPct = (meters / maxStopDist) * 100
  const thresholdPct = (400 / maxStopDist) * 100
  const barColor =
    meters < 200
      ? "bg-emerald-500"
      : meters <= 400
        ? "bg-yellow-500"
        : meters <= 500
          ? "bg-orange-500"
          : "bg-red-500"
  return (
    <div className="flex items-center gap-3">
      <span className="w-5 shrink-0 text-right font-mono text-[11px] text-slate-400 dark:text-slate-500">{i + 1}</span>
      <span className="w-[7.5rem] shrink-0 truncate text-[13px] text-slate-700 dark:text-slate-300">{d.name}</span>
      <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800">
        <div className={`absolute inset-y-0 left-0 rounded-full ${barColor}`} style={{ width: `${barPct}%` }} />
        <div className="absolute inset-y-0 w-px border-l-2 border-dashed border-slate-400 dark:border-slate-500" style={{ left: `${thresholdPct}%` }} title="400m" />
      </div>
      <span className="w-12 shrink-0 text-right font-mono text-[13px] font-medium tabular-nums text-slate-900 dark:text-slate-100">{Math.round(meters)}m</span>
    </div>
  )
}

function StopDistanceLegend() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
      <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />&lt;200m</span>
      <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-500" />200-400m</span>
      <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-500" />400-500m</span>
      <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />&gt;500m</span>
      <span className="flex items-center gap-1"><span className="inline-block h-3.5 w-px border-l-2 border-dashed border-slate-400" />400m prag</span>
    </div>
  )
}

function StopDistanceInterpretation({ desert }: { desert: ReturnType<typeof computeDesertInsights> }) {
  const first = desert.stopDistSorted[0]
  const last = desert.stopDistSorted[desert.stopDistSorted.length - 1]
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6">
        <StopDistStatCards first={first} last={last} />
        <StopDistInterpretationText desert={desert} first={first} last={last} />
      </div>
    </div>
  )
}

function StopDistStatCards({ first, last }: { first: DistrictScore; last: DistrictScore }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
      <div className="flex flex-col border-l-2 border-emerald-500 pl-4 py-1">
        <div className="font-serif text-[48px] leading-none text-slate-900 tabular-nums dark:text-slate-100">~{Math.round(first?.avgNearestStopM ?? 0)}m</div>
        <div className="mt-2 text-[14px] leading-snug text-slate-500 dark:text-slate-400">{first?.name}</div>
        <div className="mt-1 text-[12px] text-slate-400">najbliže stanice u prosjeku</div>
      </div>
      <div className="flex flex-col border-l-2 border-rose-500 pl-4 py-1">
        <div className="font-serif text-[48px] leading-none text-slate-900 tabular-nums dark:text-slate-100">~{Math.round(last?.avgNearestStopM ?? 0)}m</div>
        <div className="mt-2 text-[14px] leading-snug text-slate-500 dark:text-slate-400">{last?.name}</div>
        <div className="mt-1 text-[12px] text-slate-400">najudaljenije stanice u prosjeku</div>
      </div>
    </div>
  )
}

function StopDistInterpretationText({
  desert,
  first,
  last,
}: {
  desert: ReturnType<typeof computeDesertInsights>
  first: DistrictScore
  last: DistrictScore
}) {
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
      <p>
        Stanovnici{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">{first?.name}</strong>{" "}
        u prosjeku pješače samo ~{Math.round(first?.avgNearestStopM ?? 0)}m
        do najbliže stanice, dok stanovnici{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">{last?.name}</strong>{" "}
        moraju prijeći ~{Math.round(last?.avgNearestStopM ?? 0)}m
        - {Math.round((last?.avgNearestStopM ?? 0) / Math.max(first?.avgNearestStopM ?? 1, 1))}x
        više.
      </p>
      <p>
        <strong className="font-medium text-slate-900 dark:text-slate-100">{desert.stopDistOver400.length}</strong>{" "}
        od {desert.stopDistSorted.length} četvrti prelazi prag od 400m ugodne
        pješačke udaljenosti
        {desert.stopDistOver400.length > 0 && (
          <> ({desert.stopDistOver400.map((d) => d.name).join(", ")})</>
        )}
        . Iznad tog praga, značajno opada spremnost građana da koriste
        javni prijevoz kao svakodnevni oblik putovanja.
      </p>
    </div>
  )
}

function PeakOffPeakSection({
  data,
  base,
  evening,
}: {
  data: ScoreData
  base: ReturnType<typeof computeBaseInsights>
  evening: ReturnType<typeof computeEveningInsights>
}) {
  if (!evening.hasEveningData || evening.eveningRankedByDrop.length === 0) return null
  return (
    <section id="vrsni-sat" className="flex flex-col border-t border-slate-200 py-16 sm:py-24 dark:border-white/10">
      <PeakOffPeakHeader departureTime={base.displayDepartureTime} />
      <div className="flex flex-col items-start gap-12 lg:flex-row lg:gap-16">
        <div className="w-full lg:w-[400px] shrink-0">
          <PeakOffPeakRanking data={data} evening={evening} />
        </div>
        <div className="flex-1">
          <PeakOffPeakInterpretation evening={evening} />
        </div>
      </div>
    </section>
  )
}

function PeakOffPeakHeader({ departureTime }: { departureTime: string }) {
  return (
    <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="font-serif text-[28px] tracking-tight text-slate-900 sm:text-[32px] dark:text-slate-100">
          Jutro vs. večer
        </h2>
        <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-600 dark:text-slate-400">
          Koliko dostupnosti svaka četvrt gubi navečer (21:00) u usporedbi s
          jutarnjim vršnim satom ({departureTime}). Ista mreža, manji
          broj polazaka.
        </p>
      </div>
    </div>
  )
}

function PeakOffPeakRanking({ data, evening }: { data: ScoreData; evening: ReturnType<typeof computeEveningInsights> }) {
  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="font-sans text-[13px] font-bold tracking-widest text-slate-500 dark:text-slate-400 uppercase">Najveći pad navečer</h3>
        <span className="font-serif text-[14px] text-indigo-600 dark:text-indigo-400">-{evening.cityEveningDrop}% prosjek</span>
      </div>
      <p className="mb-6 text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
        Postotak smanjenja dosežnih ćelija u 30 minuta navečer u
        usporedbi s jutarnjim vršnim satom.
      </p>
      <div className="space-y-3">
        <RankingList
          items={evening.eveningRankedByDrop}
          value={(d) => d.peakOffpeakDrop ?? 0}
          label={(d) => `-${d.peakOffpeakDrop}%`}
          trailing={(d) =>
            `${pct(d.eveningAvgReachableCells ?? d.avgReachableCells, data.totalGridCells)}%`
          }
          color={{
            text: "text-indigo-700 dark:text-indigo-400",
            bg: "bg-indigo-100 dark:bg-indigo-900/30",
            bar: "bg-indigo-500",
          }}
        />
      </div>
    </div>
  )
}

function PeakOffPeakInterpretation({ evening }: { evening: ReturnType<typeof computeEveningInsights> }) {
  return (
    <div className="flex flex-col gap-8">
      <PeakOffPeakStatCards evening={evening} />
      <div className="space-y-4 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
        <p>
          Gradski prosjek pada za{" "}
          <strong className="font-medium text-slate-900 dark:text-slate-100">{evening.cityEveningDrop}%</strong>{" "}
          navečer. Najviše gube rubne četvrti koje ovise o rijetkim
          autobusnim linijama, dok centar s gustom tramvajskom mrežom
          zadržava većinu povezanosti.
        </p>
      </div>
    </div>
  )
}

function PeakOffPeakStatCards({ evening }: { evening: ReturnType<typeof computeEveningInsights> }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
      <div className="flex flex-col border-l-2 border-indigo-500 pl-4 py-1">
        <div className="font-serif text-[48px] leading-none text-slate-900 tabular-nums dark:text-slate-100">-{evening.cityEveningDrop}%</div>
        <div className="mt-2 text-[14px] leading-snug text-slate-500 dark:text-slate-400">prosječni pad dosega<br />u cijelom gradu</div>
      </div>
      <div className="flex flex-col border-l-2 border-indigo-500 pl-4 py-1">
        <div className="font-serif text-[48px] leading-none text-slate-900 tabular-nums dark:text-slate-100">-{evening.eveningRankedByDrop[0]?.peakOffpeakDrop ?? 0}%</div>
        <div className="mt-2 text-[14px] leading-snug text-slate-500 dark:text-slate-400">najgori pad<br />({evening.eveningRankedByDrop[0]?.name ?? "-"})</div>
      </div>
    </div>
  )
}

function WeekendSection({
  weekend,
}: {
  weekend: ReturnType<typeof computeWeekendData>
}) {
  if (!weekend.weekendComparison || weekend.weekendComparison.length === 0) return null
  return (
    <section id="vikend" className="flex flex-col border-t border-slate-200 py-16 sm:py-24 dark:border-white/10">
      <WeekendHeader cityWeekendChange={weekend.cityWeekendChange} />
      <div className="flex flex-col items-start gap-12 lg:flex-row lg:gap-16">
        <div className="w-full lg:w-[480px] shrink-0">
          <WeekendBarChart weekend={weekend} />
        </div>
        <div className="flex-1">
          <WeekendInterpretation weekend={weekend} />
        </div>
      </div>
    </section>
  )
}

function WeekendHeader({ cityWeekendChange }: { cityWeekendChange: number }) {
  return (
    <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="font-serif text-[28px] tracking-tight text-slate-900 sm:text-[32px] dark:text-slate-100">Radni dan vs. subota</h2>
        <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-600 dark:text-slate-400">
          Usporedba rezultata dostupnosti radnim danom i subotom.
          {cityWeekendChange > 0
            ? " Iznenađujuće, subotom je povezanost u prosjeku bolja. OTP model koristi subotnja vremena vožnje koja su kraća zbog manjeg prometa, što više nego kompenzira rjeđi vozni red."
            : " Manji broj polazaka subotom smanjuje doseg većine četvrti."}
        </p>
      </div>
    </div>
  )
}

function WeekendBarChart({ weekend }: { weekend: ReturnType<typeof computeWeekendData> }) {
  if (!weekend.weekendComparison) return null
  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="font-sans text-[13px] font-bold tracking-widest text-slate-500 dark:text-slate-400 uppercase">Promjena rezultata subotom</h3>
        <span className="font-serif text-[14px] text-violet-600 dark:text-violet-400">prosjek {weekend.cityWeekendChange > 0 ? "+" : ""}{fmtHR(weekend.cityWeekendChange, 1)}%</span>
      </div>
      <p className="mb-6 text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
        Postotak promjene rezultata subotom u usporedbi s radnim danom.
      </p>
      <div className="flex flex-col gap-2">
        {(() => {
          const maxAbsChange = Math.max(...weekend.weekendComparison!.map((x) => Math.abs(x.change)), 1)
          return weekend.weekendComparison!.map((p, i) => (
            <WeekendBarRow key={p.name} p={p} i={i} maxAbsChange={maxAbsChange} />
          ))
        })()}
      </div>
    </div>
  )
}

function WeekendBarRow({ p, i, maxAbsChange }: { p: WeekendItem; i: number; maxAbsChange: number }) {
  const barPct = (Math.abs(p.change) / maxAbsChange) * 100
  const isPositive = p.change >= 0
  const barColor = isPositive ? "bg-emerald-500" : "bg-rose-500"
  const barBg = isPositive ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-rose-100 dark:bg-rose-900/30"
  return (
    <div className="flex flex-col border-b border-slate-100 py-3 last:border-0 dark:border-white/5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] font-bold text-slate-400 dark:text-slate-500">{(i + 1).toString().padStart(2, "0")}</span>
          <span className="text-[14px] font-medium text-slate-700 dark:text-slate-300">{p.name}</span>
        </div>
        <span className={`shrink-0 font-serif text-[15px] font-medium tabular-nums ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
          {p.change > 0 ? "+" : ""}{fmtHR(p.change, 1)}%
        </span>
      </div>
      <div className="ml-7">
        <div className={`relative h-1.5 w-full overflow-hidden rounded-full ${barBg}`}>
          <div className={`absolute inset-y-0 left-0 rounded-full ${barColor}`} style={{ width: `${barPct}%` }} />
        </div>
        <div className="mt-2 text-[12px] text-slate-500 tabular-nums dark:text-slate-400">
          Radni dan: {p.weekdayScore} &rarr; Subota: {p.weekendScore}
        </div>
      </div>
    </div>
  )
}

function WeekendInterpretation({ weekend }: { weekend: ReturnType<typeof computeWeekendData> }) {
  if (!weekend.weekendComparison) return null
  return (
    <div className="flex flex-col gap-8">
      <WeekendStatCards weekend={weekend} />
      <div className="space-y-6 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
        {weekend.cityWeekendChange > 0 ? (
          <WeekendPositiveText weekendComparison={weekend.weekendComparison} cityWeekendChange={weekend.cityWeekendChange} />
        ) : (
          <WeekendNegativeText weekendComparison={weekend.weekendComparison} cityWeekendChange={weekend.cityWeekendChange} />
        )}
      </div>
    </div>
  )
}

function WeekendStatCards({ weekend }: { weekend: ReturnType<typeof computeWeekendData> }) {
  if (!weekend.weekendComparison) return null
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
      <div className="flex flex-col border-l-2 border-violet-500 pl-4 py-1">
        <div className="font-serif text-[48px] leading-none text-slate-900 tabular-nums dark:text-slate-100">
          {weekend.cityWeekendChange > 0 ? "+" : ""}{fmtHR(weekend.cityWeekendChange, 1)}%
        </div>
        <div className="mt-2 text-[14px] leading-snug text-slate-500 dark:text-slate-400">pop. ponderirana<br />prosječna promjena</div>
      </div>
      <div className="flex flex-col border-l-2 border-violet-500 pl-4 py-1">
        <div className="font-serif text-[48px] leading-none text-slate-900 tabular-nums dark:text-slate-100">
          {weekend.weekendComparison[0]?.change > 0 ? "+" : ""}{fmtHR(weekend.weekendComparison[0]?.change ?? 0, 1)}%
        </div>
        <div className="mt-2 text-[14px] leading-snug text-slate-500 dark:text-slate-400">najveća promjena<br />({weekend.weekendComparison[0]?.name ?? "-"})</div>
      </div>
    </div>
  )
}

function WeekendPositiveText({ weekendComparison, cityWeekendChange }: { weekendComparison: WeekendItem[]; cityWeekendChange: number }) {
  const worst = [...weekendComparison].sort((a, b) => a.change - b.change).slice(0, 3)
  const hasNegative = worst.some((p) => p.change < 0)
  return (
    <>
      <p>
        Iznenađujuće, subotom je povezanost u prosjeku{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">bolja za {fmtHR(cityWeekendChange, 1)}%</strong>.
        Manji promet ubrzava tramvaje i autobuse, a kraća čekanja
        na ključnim stajalištima kompenziraju rjeđi vozni red.
      </p>
      <p>
        Najviše profitiraju{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">
          {weekendComparison.slice(0, 3).map((p) => p.name).join(", ")}
        </strong>{" "}
       ,četvrti gdje radnim danom gužva usporava promet.
      </p>
      {hasNegative ? (
        <p>
          Ipak,{" "}
          <strong className="font-medium text-slate-900 dark:text-slate-100">
            {worst.filter((p) => p.change < 0).map((p) => p.name).join(", ")}
          </strong>{" "}
          gube subotom,ovise o linijama koje vikendom voze rjeđe.
        </p>
      ) : (
        <p>
          Sve četvrti imaju jednaku ili bolju povezanost subotom
         ,rijetka pozitivna priča u javnom prijevozu.
        </p>
      )}
    </>
  )
}

function WeekendNegativeText({ weekendComparison, cityWeekendChange }: { weekendComparison: WeekendItem[]; cityWeekendChange: number }) {
  const resilient = weekendComparison.slice(0, 3)
  return (
    <>
      <p>
        Subotom grad gubi prosječno{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">{fmtHR(Math.abs(cityWeekendChange), 1)}%</strong>{" "}
        povezanosti. Najviše gube{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">
          {weekendComparison.slice(-3).map((p) => p.name).join(", ")}
        </strong>{" "}
       ,četvrti koje ovise o autobusnim linijama s rijetkim vikend voznim redom.
      </p>
      <p>
        Najotpornije su{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">
          {resilient.map((p) => p.name).join(", ")}
        </strong>{" "}
       ,gusta tramvajska mreža održava povezanost i vikendom.
      </p>
    </>
  )
}

function BajsImpactSection({
  data,
  bajs,
}: {
  data: ScoreData
  bajs: ReturnType<typeof computeBajsInsights>
}) {
  if (!bajs.hasBajs) return null
  return (
    <section id="bajs" className="flex flex-col border-t border-slate-200 py-16 sm:py-24 dark:border-white/10">
      <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <BajsHeader />
      </div>
      <BajsMapSection />
      <div className="mt-12 flex flex-col items-start gap-12 lg:flex-row lg:gap-16">
        <div className="w-full lg:w-[400px] shrink-0">
          <BajsRanking bajs={bajs} />
        </div>
        <div className="flex-1">
          <BajsAnalysis data={data} bajs={bajs} />
        </div>
      </div>
      <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <BajsCoverageCard bajs={bajs} />
        <BajsDensityCard bajs={bajs} />
      </div>
    </section>
  )
}

function BajsHeader() {
  return (
    <div>
      <h2 className="font-serif text-[28px] tracking-tight text-slate-900 sm:text-[32px] dark:text-slate-100">Utjecaj BAJS bicikala</h2>
      <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
        Koliko se dostupnost svake četvrti poboljšava kada se uz javni
        prijevoz koriste i BAJS bicikli. Mjereno u idealnom scenariju gdje
        je svaka stanica operativna s barem jednim biciklom.
      </p>
    </div>
  )
}

function BajsMapSection() {
  return (
    <div className="mt-12">
      <div className="mb-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[14px] text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-[#d97706]" />
          Tamnije = veći dobitak
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-[#94a3b8]" />
          Sivo = bez utjecaja
        </span>
      </div>
      <div className="mx-auto w-full max-w-5xl rounded-3xl bg-slate-50 p-4 dark:bg-white/5">
        <div className="w-full overflow-hidden" style={{ aspectRatio: "960/620" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/district-bajs-map.svg"
            alt="Karta utjecaja BAJS bicikala po četvrtima. Tamniji amber označava veći dobitak u dostupnosti."
            className="h-full w-full object-contain"
            width={960}
            height={620}
            loading="lazy"
          />
        </div>
      </div>
    </div>
  )
}

function BajsRanking({ bajs }: { bajs: ReturnType<typeof computeBajsInsights> }) {
  return (
    <div>
      <h3 className="mb-6 font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">Tko najviše profitira</h3>
      <RankingList
        items={bajs.bajsRankedByBoost}
        value={(d) => d.bajsBoostPct ?? 0}
        label={(d) => `+${d.bajsBoostPct}%`}
        trailing={(d) => `${d.bajsStations} st.`}
        color={{
          text: "text-amber-700 dark:text-amber-400",
          bg: "bg-amber-100 dark:bg-amber-900/30",
          bar: "bg-amber-500",
        }}
      />
    </div>
  )
}

function BajsAnalysis({ data, bajs }: { data: ScoreData; bajs: ReturnType<typeof computeBajsInsights> }) {
  return (
    <div className="flex flex-col gap-6">
      <BajsEquityCard data={data} />
      <BajsTotalImpactCard bajs={bajs} />
    </div>
  )
}

function BajsEquityCard({ data }: { data: ScoreData }) {
  return (
    <div className="flex flex-col border-l-2 border-amber-500 pl-6 py-2">
      <h3 className="mb-4 font-sans text-[13px] font-bold tracking-widest text-amber-700 uppercase">Smanjuje li BAJS jaz?</h3>
      <div className="space-y-4 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
        <p>
          <BajsEquityText data={data} />
        </p>
      </div>
    </div>
  )
}

function BajsEquityText({ data }: { data: ScoreData }) {
  const topHalf = data.districts.slice(0, Math.floor(data.districts.length / 2))
  const bottomHalf = data.districts.slice(Math.floor(data.districts.length / 2))
  const topBoost = topHalf.reduce((s, d) => s + (d.bajsBoostPct ?? 0), 0) / topHalf.length
  const bottomBoost = bottomHalf.reduce((s, d) => s + (d.bajsBoostPct ?? 0), 0) / bottomHalf.length
  const narrows = bottomBoost > topBoost
  if (narrows) {
    return (
      <>
        Da. Slabije povezane četvrti prosječno dobivaju{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">+{Math.round(bottomBoost)}%</strong>{" "}
        poboljšanja, dok bolje povezane dobivaju{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">+{Math.round(topBoost)}%</strong>.
        BAJS bicikli sužavaju jaz u dostupnosti.
      </>
    )
  }
  return (
    <>
      Ne u dovoljnoj mjeri. Bolje povezane četvrti dobivaju{" "}
      <strong className="font-medium text-slate-900 dark:text-slate-100">+{Math.round(topBoost)}%</strong>{" "}
      poboljšanja, dok slabije povezane dobivaju{" "}
      <strong className="font-medium text-slate-900 dark:text-slate-100">+{Math.round(bottomBoost)}%</strong>.
      BAJS stanice su koncentrirane u centru - proširenje
      mreže prema rubnim četvrtima moglo bi smanjiti
      nejednakost. Četvrti bez vlastitih stanica mogu
      ipak imati mali dobitak jer stanovnici na rubu
      mogu doseći stanice u susjednoj četvrti.
    </>
  )
}

function BajsTotalImpactCard({ bajs }: { bajs: ReturnType<typeof computeBajsInsights> }) {
  return (
    <div className="flex flex-col border-l-2 border-amber-500 pl-6 py-2 mt-6">
      <h3 className="mb-4 font-sans text-[13px] font-bold tracking-widest text-amber-700 uppercase">Ukupni utjecaj</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
        <div className="flex flex-col">
          <div className="font-serif text-[36px] leading-none text-slate-900 tabular-nums dark:text-slate-100">+{bajs.cityBajsBoost}%</div>
          <div className="mt-2 text-[14px] text-slate-500 dark:text-slate-400">prosječni dobitak</div>
        </div>
        <div className="flex flex-col">
          <div className="font-serif text-[36px] leading-none text-slate-900 tabular-nums dark:text-slate-100">{bajs.bajsTotalStations}</div>
          <div className="mt-2 text-[14px] text-slate-500 dark:text-slate-400">stanica u gradu</div>
        </div>
        <div className="flex flex-col">
          <div className="font-serif text-[36px] leading-none text-slate-900 tabular-nums dark:text-slate-100">
            {bajs.topBajsBeneficiary ? `+${bajs.topBajsBeneficiary.bajsBoostPct}%` : "-"}
          </div>
          <div className="mt-2 text-[14px] text-slate-500 dark:text-slate-400">max. dobitak<br />({bajs.topBajsBeneficiary?.name ?? "-"})</div>
        </div>
      </div>
    </div>
  )
}

function BajsCoverageStats({ bajs }: { bajs: ReturnType<typeof computeBajsInsights> }) {
  return (
    <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-8">
      <div className="flex flex-col">
        <div className="font-serif text-[36px] leading-none text-slate-900 tabular-nums dark:text-slate-100">
          {bajs.coveragePct}%
        </div>
        <div className="mt-2 text-[14px] text-slate-500 dark:text-slate-400">stanica pokriveno</div>
      </div>
      <div className="flex flex-col">
        <div className="font-serif text-[36px] leading-none text-slate-900 tabular-nums dark:text-slate-100">
          {bajs.coveredStops}
        </div>
        <div className="mt-2 text-[14px] text-slate-500 dark:text-slate-400">od {bajs.totalStops} stanica</div>
      </div>
      <div className="flex flex-col">
        <div className="font-serif text-[36px] leading-none text-slate-900 tabular-nums dark:text-slate-100">350m</div>
        <div className="mt-2 text-[14px] text-slate-500 dark:text-slate-400">pješački doseg</div>
      </div>
    </div>
  )
}

function BajsCoverageCard({ bajs }: { bajs: ReturnType<typeof computeBajsInsights> }) {
  return (
    <div className="flex flex-col border-l-2 border-amber-500 pl-6 py-2">
      <h3 className="mb-4 font-sans text-[13px] font-bold tracking-widest text-amber-700 uppercase">Pokrivenost posljednje milje</h3>
      <BajsCoverageStats bajs={bajs} />
      <div className="space-y-4 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
        <p>
          Bike-sharing kao &ldquo;posljednja milja&rdquo; funkcionira samo ako postoji BAJS stanica
          blizu tramvajske ili autobusne stanice. Od{" "}
          <strong className="font-medium text-slate-900 dark:text-slate-100">{bajs.totalStops}</strong>{" "}
          stanica javnog prijevoza u Zagrebu, samo{" "}
          <strong className="font-medium text-slate-900 dark:text-slate-100">
            {bajs.coveredStops} ({bajs.coveragePct}%)
          </strong>{" "}
          ima BAJS stanicu unutar 350 metara hoda.
        </p>
        <p>
          {bajs.zeroBajsDistricts.length > 0 ? (
            <>
              <strong className="font-medium text-slate-900 dark:text-slate-100">
                {bajs.zeroBajsDistricts.length} {bajs.zeroBajsDistricts.length === 1 ? "četvrt nema" : bajs.zeroBajsDistricts.length < 5 ? "četvrti nemaju" : "četvrti nema"}
              </strong>{" "}
              nijednu BAJS stanicu: {bajs.zeroBajsDistricts.map((d) => d.name).join(", ")}.
              Za stanovnike tih četvrti, kombinacija bicikla i javnog prijevoza
              jednostavno ne postoji.
            </>
          ) : (
            <>Svaka četvrt ima barem jednu BAJS stanicu, ali gustoća varira drastično.</>
          )}
        </p>
      </div>
    </div>
  )
}

function BajsDensityCard({ bajs }: { bajs: ReturnType<typeof computeBajsInsights> }) {
  const lastDistrict = bajs.densityRanked[bajs.densityRanked.length - 1]
  return (
    <div className="flex flex-col border-l-2 border-amber-500 pl-6 py-2">
      <h3 className="mb-2 font-sans text-[13px] font-bold tracking-widest text-amber-700 uppercase">
        Gustoća BAJS stanica
      </h3>
      <p className="mb-6 text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
        Stanica po km² - koliko je infrastruktura ravnomjerno raspoređena
      </p>
      <RankingList
        items={bajs.densityRanked}
        value={(d) => d.bajsDensityPerKm2 ?? 0}
        label={(d) => `${fmtHR(d.bajsDensityPerKm2 ?? 0, 2)} st./km²`}
        trailing={(d) => `${fmtHR(d.bajsPer10k ?? 0, 1)}/10k st.`}
        color={{
          text: "text-amber-600 dark:text-amber-400",
          bg: "bg-amber-100 dark:bg-amber-900/30",
          bar: "bg-amber-500",
        }}
      />
      {bajs.topDensity && lastDistrict && (
        <div className="mt-6 border-l-2 border-amber-200/50 pl-4 py-1 dark:border-amber-800/30">
          <p className="text-[14px] leading-relaxed text-slate-700 dark:text-slate-300">
            <strong className="font-medium text-slate-900 dark:text-slate-100">{bajs.topDensity.name}</strong> ima{" "}
            {fmtHR(bajs.topDensity.bajsDensityPerKm2 ?? 0, 2)} stanica/km²,
            dok {lastDistrict.name} ima samo{" "}
            {fmtHR(lastDistrict.bajsDensityPerKm2 ?? 0, 2)}.
            {" "}Razlika u gustoći od{" "}
            <strong className="font-medium text-slate-900 dark:text-slate-100">
              {Math.round((bajs.topDensity.bajsDensityPerKm2 ?? 1) / (lastDistrict.bajsDensityPerKm2 || 0.01))}×
            </strong>{" "}
            znači da kvaliteta bike-sharing usluge ovisi prije svega o tome gdje živite.
          </p>
        </div>
      )}
    </div>
  )
}

function VarianceSection({
  data,
  variance,
}: {
  data: ScoreData
  variance: ReturnType<typeof computeVarianceInsights>
}) {
  if (!variance.hasVarianceData || variance.varianceRanked.length === 0) return null
  return (
    <section id="varijacija" className="mt-16 flex flex-col border-t border-slate-200 py-16 sm:mt-20 sm:py-24 dark:border-white/10">
      <VarianceHeader />
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_320px]">
        <VarianceRanking data={data} variance={variance} />
        <VarianceInterpretation variance={variance} />
      </div>
    </section>
  )
}

function VarianceHeader() {
  return (
    <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="font-serif text-[28px] tracking-tight text-slate-900 sm:text-[32px] dark:text-slate-100">
          Nejednakost unutar četvrti
        </h2>
        <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
          Neke četvrti imaju odlične dijelove i prometne pustinje unutar
          istog područja. Standardna devijacija mjeri koliko se rezultati
          razlikuju unutar jedne četvrti.
        </p>
      </div>
    </div>
  )
}

function VarianceRanking({ data, variance }: { data: ScoreData; variance: ReturnType<typeof computeVarianceInsights> }) {
  return (
    <div className="flex flex-col">
      <div className="mb-6 font-sans text-[13px] font-bold tracking-widest text-slate-500 dark:text-slate-400 uppercase">
        Najveća varijacija u dostupnosti
      </div>
      <div className="space-y-3">
        {variance.varianceRanked.slice(0, 8).map((d, i) => (
          <VarianceRow key={d.osmId} d={d} i={i} totalGridCells={data.totalGridCells} />
        ))}
      </div>
    </div>
  )
}

function VarianceRow({ d, i, totalGridCells }: { d: DistrictScore; i: number; totalGridCells: number }) {
  const minPct = ((d.minReachableCells ?? 0) / totalGridCells) * 100
  const maxPct = ((d.maxReachableCells ?? 0) / totalGridCells) * 100
  return (
    <div className="flex flex-col border-b border-slate-100 py-3 last:border-0 dark:border-white/5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] font-bold text-slate-400 dark:text-slate-500">{(i + 1).toString().padStart(2, "0")}</span>
          <span className="text-[14px] font-medium text-slate-700 dark:text-slate-300">{d.name}</span>
        </div>
        <span className="shrink-0 font-serif text-[15px] font-medium text-sky-600 tabular-nums dark:text-sky-400">σ {Math.round(d.stddevReachableCells ?? 0)}</span>
      </div>
      <div className="ml-7">
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
          <div className="absolute inset-y-0 rounded-full bg-sky-500" style={{ left: `${minPct}%`, width: `${Math.max(maxPct - minPct, 1)}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-[12px] text-slate-500 tabular-nums dark:text-slate-400">
          <span>Min: {Math.round(d.minReachableCells ?? 0)}</span>
          <span>Max: {Math.round(d.maxReachableCells ?? 0)}</span>
        </div>
      </div>
    </div>
  )
}

function VarianceInterpretation({ variance }: { variance: ReturnType<typeof computeVarianceInsights> }) {
  const mostUnequal = variance.varianceRanked[0]
  const mostEqual = variance.varianceRanked[variance.varianceRanked.length - 1]
  
  if (!mostUnequal || !mostEqual) return null
  
  return (
    <div className="flex flex-col gap-6">
      <VarianceStatCards variance={variance} />
      <div className="flex flex-col border-l-2 border-sky-500 pl-6 py-2 mt-4">
        <h3 className="mb-4 font-sans text-[13px] font-bold tracking-widest text-sky-700 uppercase">Grad ekstrema ({mostUnequal.name})</h3>
        <div className="space-y-4 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
          <p>
            Najnejednakija četvrt je{" "}
            <strong className="font-medium text-slate-900 dark:text-slate-100">{mostUnequal.name}</strong>{" "}
            - neki stanovnici imaju odličnu povezanost javnim prijevozom,
            dok susjedi 500 metara uzbrdo nemaju gotovo ništa.
          </p>
          <p>
            Ovakav nesrazmjer obično znači da jedan dio četvrti ima odličan
            pristup tramvajskoj ili željezničkoj pruzi, dok drugi dio 
            ovisi o rijetkim autobusnim linijama ili je izoliran.
          </p>
        </div>
      </div>

      <div className="flex flex-col border-l-2 border-slate-300 pl-6 py-2 mt-6">
        <h3 className="mb-4 font-sans text-[13px] font-bold tracking-widest text-slate-500 dark:text-slate-400 uppercase">Ujednačena dostupnost ({mostEqual.name})</h3>
        <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
          Nasuprot tome, <strong>{mostEqual.name}</strong> ima 
          najmanju varijaciju (σ {Math.round(mostEqual.stddevReachableCells ?? 0)}).
          Rezultati se kreću u uskom rasponu od {Math.round(mostEqual.minReachableCells ?? 0)}{" "}
          do {Math.round(mostEqual.maxReachableCells ?? 0)}.
          Ovo ukazuje na ravnomjernu raspodjelu infrastrukture 
          kroz cijelu četvrt, gdje god se nalazili.
        </p>
      </div>
    </div>
  )
}

function VarianceStatCards({ variance }: { variance: ReturnType<typeof computeVarianceInsights> }) {
  const d = variance.varianceRanked[0]
  const rangeVal = d ? (d.maxReachableCells ?? 0) - (d.minReachableCells ?? 0) : 0
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-4">
      <div className="flex flex-col">
        <div className="font-serif text-[36px] leading-none text-slate-900 tabular-nums dark:text-slate-100">σ {Math.round(variance.varianceRanked[0]?.stddevReachableCells ?? 0)}</div>
        <div className="mt-2 text-[14px] text-slate-500 dark:text-slate-400">najveća std. devijacija<br />({variance.varianceRanked[0]?.name})</div>
      </div>
      <div className="flex flex-col">
        <div className="font-serif text-[36px] leading-none text-slate-900 tabular-nums dark:text-slate-100">{d ? rangeVal.toLocaleString("hr-HR") : "-"}</div>
        <div className="mt-2 text-[14px] text-slate-500 dark:text-slate-400">max raspon ćelija<br />(min → max unutar četvrti)</div>
      </div>
    </div>
  )
}

function FrequencySection({ freq }: { freq: ReturnType<typeof computeFrequencyInsights> }) {
  if (freq.freqRanked.length === 0) return null
  return (
    <section id="frekvencija" className="mt-16 flex flex-col border-t border-slate-200 py-16 sm:mt-20 sm:py-24 dark:border-white/10">
      <FrequencyHeader />
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_320px]">
        <FrequencyChart freq={freq} />
        <FrequencyInterpretation freq={freq} />
      </div>
    </section>
  )
}

function FrequencyHeader() {
  return (
    <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="font-serif text-[28px] tracking-tight text-slate-900 sm:text-[32px] dark:text-slate-100">
          Frekvencija prijevoza
        </h2>
        <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
          Prosječni interval dolaska vozila po četvrti. Četvrti s intervalom
          od 1-2 minute uglavnom imaju gustu mrežu tramvaja ili autobusa;
          3+ minute znači oslanjanje na rjeđe autobusne linije.
        </p>
      </div>
    </div>
  )
}

function FrequencyChart({ freq }: { freq: ReturnType<typeof computeFrequencyInsights> }) {
  return (
    <div className="flex flex-col">
      <div className="mb-6 font-sans text-[13px] font-bold tracking-widest text-slate-500 dark:text-slate-400 uppercase">
        Interval po četvrti (minuta)
      </div>
      <div className="space-y-2">
        {freq.freqRanked.map((d, i) => (
          <FrequencyBar key={d.osmId} d={d} i={i} maxHeadway={freq.maxHeadway} />
        ))}
      </div>
    </div>
  )
}

function FrequencyBar({ d, i, maxHeadway }: { d: DistrictScore; i: number; maxHeadway: number }) {
  const headway = d.medianHeadwayMin
  const barPct = maxHeadway > 0 ? (headway / maxHeadway) * 100 : 0
  const barColor =
    headway <= 1 ? "bg-emerald-500"
    : headway <= 2 ? "bg-cyan-500"
    : headway <= 3 ? "bg-blue-500"
    : "bg-indigo-500"
  return (
    <div className="flex flex-col border-b border-slate-100 py-3 last:border-0 dark:border-white/5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] font-bold text-slate-400 dark:text-slate-500">{(i + 1).toString().padStart(2, "0")}</span>
          <span className="text-[14px] font-medium text-slate-700 dark:text-slate-300">{d.name}</span>
        </div>
        <span className="shrink-0 font-serif text-[15px] font-medium text-slate-900 tabular-nums dark:text-slate-100">~{fmtHR(headway, 1)} min</span>
      </div>
      <div className="ml-7">
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
          <div className={`absolute inset-y-0 left-0 rounded-full ${barColor}`} style={{ width: `${barPct}%` }} />
        </div>
      </div>
    </div>
  )
}

function FrequencyInterpretation({ freq }: { freq: ReturnType<typeof computeFrequencyInsights> }) {
  return (
    <div className="flex flex-col gap-6">
      <FrequencyStatCards freq={freq} />
      <div className="flex flex-col border-l-2 border-blue-500 pl-6 py-2 mt-4">
        <h3 className="mb-4 font-sans text-[13px] font-bold tracking-widest text-blue-700 uppercase">Jaz u frekvenciji</h3>
        <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
          Četvrti s intervalom od{" "}
          <strong className="font-medium text-slate-900 dark:text-slate-100">1 minute</strong>{" "}
          uglavnom imaju gustu mrežu s više linija koje se preklapaju
          (svakih 7-10 min po liniji, ali efektivno češće). Rubne
          četvrti s intervalom od 3-4 minute ovise o rijetkim
          autobusnim linijama - čekanje od 15-30 minuta značajno
          umanjuje praktičnu dostupnost.
        </p>
      </div>
      <div className="mt-4 border-l-2 border-slate-300 pl-6 py-2">
        <p className="text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
          Noćne tramvajske linije (31-34) održavaju promet do ~05:30,
          dajući četvrtima s tramvajem praktično 24-satnu pokrivenost.
        </p>
      </div>
    </div>
  )
}

function FrequencyStatCards({ freq }: { freq: ReturnType<typeof computeFrequencyInsights> }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-4">
      <div className="flex flex-col">
        <div className="font-serif text-[36px] leading-none text-slate-900 tabular-nums dark:text-slate-100">{freq.totalLines}</div>
        <div className="mt-2 text-[14px] text-slate-500 dark:text-slate-400">linija opslužuje Zagreb</div>
      </div>
      <div className="flex flex-col">
        <div className="font-serif text-[36px] leading-none text-slate-900 tabular-nums dark:text-slate-100">{freq.allTramLines.size} tram + {freq.allBusLines.size} bus</div>
        <div className="mt-2 text-[14px] text-slate-500 dark:text-slate-400">tramvajskih i autobusnih</div>
      </div>
    </div>
  )
}

function LineSpeedSection({ lineSpeed }: { lineSpeed: ReturnType<typeof computeLineSpeedInsights> }) {
  return (
    <section id="brzina" className="flex flex-col border-t border-slate-200 py-16 sm:py-24 dark:border-white/10">
      <LineSpeedHeader />
      <div className="flex flex-col items-start gap-12 lg:flex-row lg:gap-16">
        <div className="w-full lg:w-[400px] shrink-0">
          <LineSpeedCards lineSpeed={lineSpeed} />
        </div>
        <div className="flex-1">
          <LineSpeedInterpretation />
        </div>
      </div>
    </section>
  )
}

function LineSpeedHeader() {
  return (
    <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="font-serif text-[28px] tracking-tight text-slate-900 sm:text-[32px] dark:text-slate-100">Brzina linija</h2>
        <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
          Komercijalna brzina prometnih sredstava - koliko brzo se vozilo
          kreće uključujući zaustavljanja na stanicama. Brži mod znači veći
          doseg u istih 30 minuta.
        </p>
      </div>
    </div>
  )
}

function LineSpeedCards({ lineSpeed }: { lineSpeed: ReturnType<typeof computeLineSpeedInsights> }) {
  return (
    <div>
      <h3 className="mb-6 font-sans text-[13px] font-bold tracking-widest text-slate-500 dark:text-slate-400 uppercase">Komercijalna brzina po modu</h3>
      <div className="flex flex-col gap-4">
        <SpeedModeRow icon="tram" label="Tramvaj" speed={TRAM_SPEED_KMH} color="rose" note={`${lineSpeed.tramLineCount} linija, prosj. ${lineSpeed.avgTramCoverage} četvrti po liniji`} pct={(TRAM_SPEED_KMH / TRAIN_SPEED_KMH) * 100} />
        <SpeedModeRow icon="bus" label="Autobus" speed={BUS_SPEED_KMH} color="blue" note={`${lineSpeed.busLineCount} linija, prosj. ${lineSpeed.avgBusCoverage} četvrti po liniji`} pct={(BUS_SPEED_KMH / TRAIN_SPEED_KMH) * 100} />
        {lineSpeed.trainLineCount > 0 && (
          <SpeedModeRow icon="train" label="HŽ vlak" speed={TRAIN_SPEED_KMH} color="teal" note={`${lineSpeed.trainLineCount} linija - ali doprinos dosegu 0% zbog rijetkog intervala`} pct={100} />
        )}
        <SpeedWalkBajs />
      </div>
    </div>
  )
}

function SpeedModeRow({ icon, label, speed, color, note, pct: barPct }: { icon: string; label: string; speed: number; color: string; note: string; pct: number }) {
  const iconPaths: Record<string, React.ReactNode> = {
    tram: <><rect x="4" y="3" width="16" height="14" rx="2" /><path d="M12 3v14" /><path d="M4 10h16" /><path d="M7 21l2-4" /><path d="M17 21l-2-4" /></>,
    bus: <><path d="M8 6v6" /><path d="M15 6v6" /><path d="M2 12h19.6" /><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3" /><circle cx="7" cy="18" r="2" /><path d="M9 18h5" /><circle cx="16" cy="18" r="2" /></>,
    train: <><rect x="4" y="3" width="16" height="14" rx="2" /><path d="M4 11h16" /><path d="M12 3v8" /><circle cx="8" cy="20" r="1" /><circle cx="16" cy="20" r="1" /></>,
  }
  const colorMap: Record<string, { icon: string; text: string; bg: string; bar: string }> = {
    rose: { icon: "text-rose-600 dark:text-rose-400", text: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-900/20", bar: "bg-rose-100 dark:bg-rose-900/30" },
    blue: { icon: "text-blue-600 dark:text-blue-400", text: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/20", bar: "bg-blue-100 dark:bg-blue-900/30" },
    teal: { icon: "text-teal-600 dark:text-teal-400", text: "text-teal-600 dark:text-teal-400", bg: "bg-teal-50 dark:bg-teal-900/20", bar: "bg-teal-100 dark:bg-teal-900/30" },
  }
  const c = colorMap[color]!
  const barColorFull = color === "rose" ? "bg-rose-500" : color === "blue" ? "bg-blue-500" : "bg-teal-500"
  return (
    <div className="flex items-center gap-4">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${c.bg}`}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c.icon}>
          {iconPaths[icon]}
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[14px] font-medium text-slate-900 dark:text-slate-100">{label}</span>
          <span className={`font-serif text-[18px] font-medium tabular-nums ${c.text}`}>{speed} km/h</span>
        </div>
        <div className={`relative h-2.5 w-full overflow-hidden rounded-full ${c.bar}`}>
          <div className={`absolute inset-y-0 left-0 rounded-full ${barColorFull}`} style={{ width: `${barPct}%` }} />
        </div>
        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{note}</div>
      </div>
    </div>
  )
}

function SpeedWalkBajs() {
  return (
    <div className="mt-2 border-t border-black/5 pt-4 dark:border-white/5">
      <div className="flex items-center justify-between text-[13px] text-slate-500 dark:text-slate-400">
        <span>Hodanje</span>
        <span className="font-serif tabular-nums">5 km/h</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-[13px] text-slate-500 dark:text-slate-400">
        <span>BAJS bicikl</span>
        <span className="font-serif tabular-nums">14 km/h</span>
      </div>
    </div>
  )
}

function LineSpeedInterpretation() {
  return (
    <div>
      <h3 className="font-serif text-[22px] text-orange-800 dark:text-orange-400">Brzina vs. frekvencija</h3>
      <div className="my-8 grid grid-cols-1 sm:grid-cols-2 gap-8 border-b border-t border-slate-200 py-6 dark:border-white/10">
        <div className="flex flex-col">
          <div className="font-serif text-[48px] leading-none text-orange-700 tabular-nums dark:text-orange-400">{TRAM_SPEED_KMH}</div>
          <div className="mt-2 text-[14px] leading-snug text-slate-500 dark:text-slate-400">km/h tramvaj<br />(komercijalna brzina)</div>
        </div>
        <div className="flex flex-col">
          <div className="font-serif text-[48px] leading-none text-slate-900 tabular-nums dark:text-slate-100">{Math.round(TRAM_SPEED_KMH * 0.5)} km</div>
          <div className="mt-2 text-[14px] leading-snug text-slate-500 dark:text-slate-400">doseg tramvajem<br />u 30 min</div>
        </div>
      </div>
      <LineSpeedInterpretationText />
    </div>
  )
}

function LineSpeedInterpretationText() {
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
      <p>
        Autobus je prosječno{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">
          {Math.round(((BUS_SPEED_KMH - TRAM_SPEED_KMH) / TRAM_SPEED_KMH) * 100)}% brži
        </strong>{" "}
        od tramvaja (uključuje predgradske linije), ali tramvaj
        dominira u dosegu zahvaljujući{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">frekvenciji</strong>.
        Tramvajska linija dolazi svakih 7-10 minuta, a na
        stanicama s više linija čekanje pada na 2-3 min.
        Autobus često vozi svakih 15-30 minuta.
      </p>
      <p>
        U 30-minutnom budžetu, putnik autobusom prosječno čeka{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">7-15 minuta</strong>{" "}
        na polazak - to je polovica budžeta izgubljena prije nego što se
        uopće počne kretati. Tramvajski putnik na frekventnoj stanici
        koristi 27-28 od 30 minuta na stvarno putovanje.
      </p>
      <p>
        HŽ vlak je nominalno najbrži ({TRAIN_SPEED_KMH} km/h), ali
        s intervalom od 30-60 minuta{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">cijeli budžet odlazi na čekanje</strong>.
        Brzina bez frekvencije ne donosi ništa.
      </p>
    </div>
  )
}

function RouteStatsSection({
  routeStats: stats,
}: {
  routeStats: RouteStats | null
}) {
  if (!stats) return null

  const sortedRoutes = sortRoutesByName(
    stats.routes.filter((r) => r.mode !== "RAIL"),
  )
  const trams = sortedRoutes.filter((r) => r.mode === "TRAM")
  const buses = sortedRoutes.filter((r) => r.mode === "BUS")

  const generatedLabel = (() => {
    const d = new Date(stats.generatedAt)
    return Number.isNaN(d.getTime())
      ? stats.generatedAt
      : d.toLocaleString("hr-HR", { dateStyle: "long", timeStyle: "short" })
  })()

  return (
    <section className="flex flex-col border-t border-slate-200 py-16 sm:py-24 dark:border-white/10">
      <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-serif text-[28px] tracking-tight text-slate-900 sm:text-[32px] dark:text-slate-100">
            Analiza linija
          </h2>
          <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
            Detaljna analiza performansi svih tramvajskih i autobusnih linija u zagrebačkom prometu.
            Podaci iz statičkog GTFS izračuna, generirano {generatedLabel}.
          </p>
        </div>
      </div>

      <RouteAnalysisTables trams={trams} buses={buses} />
    </section>
  )
}

function TravelMatrixSection({
  travelMatrix,
  matrix,
}: {
  travelMatrix: TravelMatrix | null
  matrix: ReturnType<typeof computeMatrixInsights>
}) {
  if (!travelMatrix) return null
  return (
    <section id="matrica" className="flex flex-col border-t border-slate-200 py-16 sm:py-24 dark:border-white/10">
      <TravelMatrixHeader travelMatrix={travelMatrix} />
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_380px] lg:gap-16">
        <div className="overflow-x-auto">
          <TravelMatrixTable travelMatrix={travelMatrix} />
        </div>
        <div>
          <TravelMatrixInsights matrix={matrix} />
        </div>
      </div>
    </section>
  )
}

function TravelMatrixHeader({ travelMatrix }: { travelMatrix: TravelMatrix }) {
  return (
    <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="font-serif text-[28px] tracking-tight text-slate-900 sm:text-[32px] dark:text-slate-100">
          Matrica putovanja
        </h2>
        <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
          Vrijeme putovanja javnim prijevozom između središta svake četvrti, polazak u {travelMatrix.departureTime ?? "08:00"}. Boja označava trajanje - od zelene (brzo) do crvene (sporo).
        </p>
      </div>
    </div>
  )
}

function TravelMatrixTable({ travelMatrix }: { travelMatrix: TravelMatrix }) {
  return (
    <div className="flex flex-col">
      <h3 className="mb-8 font-sans text-[11px] font-bold tracking-widest text-cyan-700 uppercase dark:text-cyan-400">Vrijeme putovanja u minutama</h3>
      <div className="overflow-x-auto">
        <table className="w-max border-collapse text-[11px]" role="grid" aria-label="Matrica putovanja između četvrti">
          <thead>
            <tr>
              <td className="sticky left-0 z-10 bg-white p-1 text-left font-medium text-slate-500 dark:bg-zinc-950 dark:text-slate-400">
                <span className="sr-only">Iz / U</span>
              </td>
              {travelMatrix.districts.map((name, ci) => (
                <th key={ci} className="min-w-[44px] p-1 text-center font-medium text-slate-500 dark:text-slate-400" title={name}>
                  {districtAbbrev[name] ?? name.slice(0, 4)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {travelMatrix.districts.map((rowName, ri) => (
              <MatrixRow key={ri} travelMatrix={travelMatrix} rowName={rowName} ri={ri} />
            ))}
          </tbody>
        </table>
      </div>
      <TravelMatrixLegend />
    </div>
  )
}

function MatrixRow({ travelMatrix, rowName, ri }: { travelMatrix: TravelMatrix; rowName: string; ri: number }) {
  return (
    <tr className="group/row">
      <th
        className="sticky left-0 z-10 whitespace-nowrap bg-white p-1 pr-2 text-left font-medium text-slate-700 group-hover/row:bg-cyan-50 dark:bg-zinc-950 dark:text-slate-300 dark:group-hover/row:bg-cyan-950/20"
        scope="row"
      >
        {districtAbbrev[rowName] ?? rowName.slice(0, 4)}
      </th>
      {travelMatrix.matrix[ri].map((time, ci) => (
        <MatrixCell key={ci} travelMatrix={travelMatrix} ri={ri} ci={ci} time={time} />
      ))}
    </tr>
  )
}

function MatrixCell({ travelMatrix, ri, ci, time }: { travelMatrix: TravelMatrix; ri: number; ci: number; time: number }) {
  const transfers = travelMatrix.transferMatrix[ri]?.[ci] ?? 0
  const isDiag = ri === ci
  let bg: string
  let textColor: string
  if (isDiag) { bg = "#f1f5f9"; textColor = "#94a3b8" }
  else if (time < 0) { bg = "#e2e8f0"; textColor = "#94a3b8" }
  else if (time < 20) { bg = "#bbf7d0"; textColor = "#166534" }
  else if (time < 40) { bg = "#fef08a"; textColor = "#854d0e" }
  else if (time < 60) { bg = "#fed7aa"; textColor = "#9a3412" }
  else { bg = "#fecaca"; textColor = "#991b1b" }
  const rowName = travelMatrix.districts[ri]
  return (
    <td
      className="min-w-[44px] p-0.5 text-center group-hover/row:brightness-95"
      title={`${rowName} → ${travelMatrix.districts[ci]}: ${isDiag ? "ista četvrt" : time < 0 ? "nema rute" : `${time} min, ${transfers} presjedanja`}`}
    >
      <div className="flex flex-col items-center justify-center rounded px-1 py-0.5" style={{ backgroundColor: bg, color: textColor }}>
        <span className="font-serif text-[12px] font-medium tabular-nums leading-tight">
          {isDiag ? "-" : time < 0 ? "×" : time}
        </span>
        {!isDiag && time > 0 && (
          <span className="text-[9px] leading-tight opacity-60">{transfers}p</span>
        )}
      </div>
    </td>
  )
}

function TravelMatrixLegend() {
  return (
    <div className="mt-8 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
      <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded" style={{ backgroundColor: "#bbf7d0" }} />&lt;20 min</span>
      <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded" style={{ backgroundColor: "#fef08a" }} />20-40 min</span>
      <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded" style={{ backgroundColor: "#fed7aa" }} />40-60 min</span>
      <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded" style={{ backgroundColor: "#fecaca" }} />&gt;60 min</span>
      <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded" style={{ backgroundColor: "#e2e8f0" }} />nema rute</span>
      <span className="text-[10px] italic">p = presjedanja</span>
    </div>
  )
}

function TravelMatrixInsights({ matrix }: { matrix: ReturnType<typeof computeMatrixInsights> }) {
  return (
    <div className="flex flex-col gap-6">
      <h3 className="mb-2 font-sans text-[13px] font-bold tracking-widest text-slate-500 dark:text-slate-400 uppercase">Zanimljivosti</h3>
      <div className="flex flex-col gap-6">
        {matrix.matrixWorstCorridor && matrix.matrixWorstCorridor.time > 0 && (
          <div className="border-l-2 border-rose-500 pl-4 py-1">
            <div className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">Najdulje putovanje</div>
            <div className="mt-2 font-serif text-[20px] text-slate-900 dark:text-slate-100">{districtAbbrev[matrix.matrixWorstCorridor.from] ?? matrix.matrixWorstCorridor.from} &rarr; {districtAbbrev[matrix.matrixWorstCorridor.to] ?? matrix.matrixWorstCorridor.to}</div>
            <div className="mt-1 text-[14px] text-slate-600 dark:text-slate-400">{matrix.matrixWorstCorridor.time} minuta</div>
          </div>
        )}
        {matrix.matrixBestPair && matrix.matrixBestPair.time < Infinity && (
          <div className="border-l-2 border-emerald-500 pl-4 py-1">
            <div className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">Najbrža veza</div>
            <div className="mt-2 font-serif text-[20px] text-slate-900 dark:text-slate-100">{districtAbbrev[matrix.matrixBestPair.from] ?? matrix.matrixBestPair.from} &harr; {districtAbbrev[matrix.matrixBestPair.to] ?? matrix.matrixBestPair.to}</div>
            <div className="mt-1 text-[14px] text-slate-600 dark:text-slate-400">{matrix.matrixBestPair.time} minuta</div>
          </div>
        )}
        <div className="border-l-2 border-violet-500 pl-4 py-1">
          <div className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">Prosjek svih putovanja</div>
          <div className="mt-2 font-serif text-[24px] text-slate-900 dark:text-slate-100">{matrix.avgTimeAll} min</div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Transfer Dependency Distribution (1.14)
// ---------------------------------------------------------------------------

function computeTransferData(travelMatrix: TravelMatrix) {
  const n = travelMatrix.districts.length
  const buckets: Record<string, { count: number; pairs: { from: string; to: string; time: number }[] }> = {
    "0": { count: 0, pairs: [] },
    "1": { count: 0, pairs: [] },
    "2+": { count: 0, pairs: [] },
  }
  let totalPairs = 0
  let totalTransfers = 0

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const time = travelMatrix.matrix[i]?.[j] ?? -1
      if (time <= 0) continue
      const transfers = travelMatrix.transferMatrix![i]?.[j] ?? 0
      totalPairs++
      totalTransfers += transfers
      if (transfers === 0) {
        buckets["0"].count++
      } else if (transfers === 1) {
        buckets["1"].count++
      } else {
        buckets["2+"].count++
        buckets["2+"].pairs.push({ from: travelMatrix.districts[i], to: travelMatrix.districts[j], time })
      }
    }
  }

  const directPct = totalPairs > 0 ? Math.round((buckets["0"].count / totalPairs) * 100) : 0
  const onePct = totalPairs > 0 ? Math.round((buckets["1"].count / totalPairs) * 100) : 0
  const twoPlusPct = totalPairs > 0 ? Math.round((buckets["2+"].count / totalPairs) * 100) : 0
  const worstPairs = [...buckets["2+"].pairs].sort((a, b) => b.time - a.time).slice(0, 6)

  return {
    totalPairs,
    avgTransfers: totalPairs > 0 ? (totalTransfers / totalPairs).toFixed(1).replace(".", ",") : "0",
    directPct, onePct, twoPlusPct, worstPairs,
    barData: [
      { label: "Izravno", count: buckets["0"].count, pct: directPct, color: "bg-emerald-400 dark:bg-emerald-500" },
      { label: "1 presjedanje", count: buckets["1"].count, pct: onePct, color: "bg-amber-400 dark:bg-amber-500" },
      { label: "2+ presjedanja", count: buckets["2+"].count, pct: twoPlusPct, color: "bg-red-400 dark:bg-red-500" },
    ],
  }
}

function TransferStackedBar({ barData, avgTransfers }: { barData: ReturnType<typeof computeTransferData>["barData"]; avgTransfers: string }) {
  return (
    <div className="flex flex-col">
      <div className="mb-8 flex h-4 w-full overflow-hidden rounded-full">
        {barData.map((d) => (
          d.pct > 0 && (
            <div key={d.label} className={`${d.color} flex items-center justify-center transition-all`} style={{ width: `${d.pct}%` }} />
          )
        ))}
      </div>
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
        {barData.map((d) => (
          <div key={d.label} className={`border-l-2 pl-4 py-1 ${d.color.split(' ')[0].replace('bg-', 'border-')}`}>
            <div className="text-[13px] font-medium tracking-widest uppercase text-slate-500 dark:text-slate-400">{d.label}</div>
            <div className="mt-2 font-serif text-[24px] font-medium tabular-nums text-slate-900 dark:text-slate-100">{d.count}</div>
            <div className="text-[14px] text-slate-600 dark:text-slate-400">parova četvrti ({d.pct}%)</div>
          </div>
        ))}
      </div>
      <div className="mt-8 border-t border-slate-200 pt-6 text-[14px] leading-relaxed text-slate-600 dark:border-white/10 dark:text-slate-400">
        Prosječno presjedanja po putovanju: <strong className="font-medium text-slate-900 dark:text-slate-100">{avgTransfers}</strong>
      </div>
    </div>
  )
}

function TransferWorstCorridors({ worstPairs }: { worstPairs: ReturnType<typeof computeTransferData>["worstPairs"] }) {
  if (worstPairs.length === 0) return null
  return (
    <div className="mt-12 flex flex-col">
      <h3 className="mb-6 font-sans text-[13px] font-bold tracking-widest text-slate-500 dark:text-slate-400 uppercase">Koridori s 2+ presjedanja</h3>
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {worstPairs.map((pair, i) => (
          <div key={i} className="flex items-baseline justify-between border-b border-slate-100 pb-2 dark:border-white/5">
            <span className="text-[14px] text-slate-800 dark:text-slate-200">
              {pair.from} <span className="text-slate-400">&rarr;</span> {pair.to}
            </span>
            <span className="ml-4 font-serif text-[15px] font-medium tabular-nums text-slate-900 dark:text-slate-100">{pair.time} min</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TransferDependencySection({ travelMatrix }: { travelMatrix: TravelMatrix | null }) {
  if (!travelMatrix?.transferMatrix) return null
  const td = computeTransferData(travelMatrix)
  if (td.totalPairs === 0) return null

  return (
    <section id="presjedanja" className="flex flex-col border-t border-slate-200 py-16 sm:py-24 dark:border-white/10">
      <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-serif text-[28px] tracking-tight text-slate-900 sm:text-[32px] dark:text-slate-100">
            Ovisnost o presjedanjima
          </h2>
          <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-600 dark:text-slate-400">
            Koliko presjedanja zahtijeva tipično putovanje između zagrebačkih četvrti?
            Svako presjedanje dodaje prosječno 8-12 minuta čekanja.
          </p>
        </div>
      </div>

      <TransferStackedBar barData={td.barData} avgTransfers={td.avgTransfers} />
      <TransferWorstCorridors worstPairs={td.worstPairs} />

      <div className="mt-8 text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
        <p>
          Od {td.totalPairs} mogućih parova četvrti, <strong className="font-medium text-slate-900 dark:text-slate-100">{td.directPct}%</strong> je dostupno izravno bez presjedanja,{" "}
          <strong className="font-medium text-slate-900 dark:text-slate-100">{td.onePct}%</strong> zahtijeva jedno presjedanje, a <strong className="font-medium text-slate-900 dark:text-slate-100">{td.twoPlusPct}%</strong> zahtijeva dva ili više.
          {td.worstPairs.length > 0 && (
            <> Najgori koridor (<strong className="font-medium text-slate-900 dark:text-slate-100">{td.worstPairs[0].from} &rarr; {td.worstPairs[0].to}</strong>) traje{" "}
              <strong className="font-medium text-slate-900 dark:text-slate-100">{td.worstPairs[0].time} minuta</strong> - svako presjedanje dodaje nepredvidivo čekanje.</>
          )}
        </p>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Centrality Analysis (1.16-1.19)
// ---------------------------------------------------------------------------

function loadCentralityStats(): import("@/lib/generated").CentralityStats | null {
  const statsPath = join(getDataDir(), "centrality-stats.json")
  if (!existsSync(statsPath)) return null
  try {
    return JSON.parse(readFileSync(statsPath, "utf-8"))
  } catch {
    return null
  }
}

function CentralityRanking({ stops, title, subtitle, color, scoreDecimals }: {
  stops: import("@/lib/generated").CentralityStop[]
  title: string
  subtitle: string
  color: "rose" | "emerald"
  scoreDecimals: number
}) {
  return (
    <div className="flex flex-col">
      <div className={`border-l-2 border-${color}-500 pl-4 py-1`}>
        <h3 className={`font-serif text-[20px] text-${color}-600 dark:text-${color}-400`}>{title}</h3>
        <p className="mt-2 text-[14px] leading-relaxed text-slate-600 dark:text-slate-400">{subtitle}</p>
      </div>
      <div className="mt-6 flex flex-col pl-4">
        {stops.slice(0, 10).map((stop, i) => {
          const barW = stops[0].score > 0 ? (stop.score / stops[0].score) * 100 : 0
          return (
            <div key={stop.key} className="flex flex-col border-b border-slate-100 py-3 last:border-0 dark:border-white/5">
              <div className="flex items-baseline justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className={`font-mono text-[11px] font-bold text-slate-400 dark:text-slate-500`}>{(i + 1).toString().padStart(2, "0")}</span>
                  <span className="text-[14px] font-medium text-slate-700 dark:text-slate-300">{stop.name}</span>
                </div>
                <span className="font-serif text-[15px] tabular-nums text-slate-900 dark:text-slate-100">{stop.score.toFixed(scoreDecimals)}</span>
              </div>
              <div className="ml-7 mt-3">
                <div className={`h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800`}>
                  <div className={`h-full bg-${color}-400 dark:bg-${color}-500`} style={{ width: `${barW}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {stop.routes.slice(0, 6).map((r) => (
                    <span key={r} className="inline-flex h-5 items-center rounded-sm bg-slate-100 px-1.5 font-mono text-[10px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">{r}</span>
                  ))}
                  {stop.routes.length > 6 && <span className="inline-flex h-5 items-center rounded-sm bg-slate-50 px-1.5 font-mono text-[10px] font-medium text-slate-400 dark:bg-white/5 dark:text-slate-500">+{stop.routes.length - 6}</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CentralityNumbers({ data }: { data: import("@/lib/generated").CentralityStats }) {
  const { networkDiameter, averagePathLength } = data
  return (
    <div className="my-12 grid grid-cols-2 gap-12 border-b border-t border-slate-200 py-12 sm:grid-cols-4 dark:border-white/10">
      <div className="flex flex-col border-l-2 border-rose-500 pl-4">
        <div className="font-serif text-[48px] font-medium leading-none tabular-nums text-slate-900 dark:text-slate-100">
          {networkDiameter.minutes}
        </div>
        <div className="mt-2 text-[14px] leading-snug text-slate-500 dark:text-slate-400">minuta - mrežni dijametar</div>
        <div className="mt-1 text-[12px] text-slate-400">
          {networkDiameter.fromStop} &rarr; {networkDiameter.toStop}
        </div>
      </div>
      <div className="flex flex-col border-l-2 border-emerald-500 pl-4">
        <div className="font-serif text-[48px] font-medium leading-none tabular-nums text-slate-900 dark:text-slate-100">
          {averagePathLength.minutes}
        </div>
        <div className="mt-2 text-[14px] leading-snug text-slate-500 dark:text-slate-400">min prosječno putovanje</div>
        <div className="mt-1 text-[12px] text-slate-400">
          srednja vrijednost svih najkraćih puteva
        </div>
      </div>
      <div className="flex flex-col border-l-2 border-violet-500 pl-4">
        <div className="font-serif text-[48px] font-medium leading-none tabular-nums text-slate-900 dark:text-slate-100">
          {averagePathLength.reachablePct}%
        </div>
        <div className="mt-2 text-[14px] leading-snug text-slate-500 dark:text-slate-400">parova povezano</div>
        <div className="mt-1 text-[12px] text-slate-400">
          {averagePathLength.reachablePairs.toLocaleString("hr")} od {averagePathLength.totalPairs.toLocaleString("hr")}
        </div>
      </div>
      <div className="flex flex-col border-l-2 border-slate-300 pl-4 dark:border-slate-700">
        <div className="font-serif text-[48px] font-medium leading-none tabular-nums text-slate-900 dark:text-slate-100">
          {data.stopCount.toLocaleString("hr")}
        </div>
        <div className="mt-2 text-[14px] leading-snug text-slate-500 dark:text-slate-400">analiziranih stanica</div>
      </div>
    </div>
  )
}

function CentralitySection() {
  const data = loadCentralityStats()
  if (!data) return null

  const { betweenness, closeness, networkDiameter } = data

  return (
    <section className="flex flex-col border-t border-slate-200 py-16 sm:py-24 dark:border-white/10">
      <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-serif text-[28px] tracking-tight text-slate-900 sm:text-[32px] dark:text-slate-100">
            Centralnost mreže
          </h2>
          <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-600 dark:text-slate-400">
            Analiza grafa otkriva kritične točke mreže - stanice čijim zatvaranjem bi se cijelom sustavu
            dramatično pogoršala povezanost, i stanice koje najbolje pokrivaju cijeli grad.
          </p>
        </div>
      </div>

      <CentralityNumbers data={data} />

      <div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
        <CentralityRanking stops={betweenness} title="Betweenness centralnost" subtitle="Kritične točke - stanice kroz koje prolazi najviše najkraćih puteva" color="rose" scoreDecimals={4} />
        <CentralityRanking stops={closeness} title="Closeness centralnost" subtitle="Najbolje povezane stanice - najbrži prosječni pristup cijeloj mreži" color="emerald" scoreDecimals={2} />
      </div>

      <div className="mt-12 text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
        <p>
          <strong className="font-medium text-slate-900 dark:text-slate-100">Betweenness centralnost</strong> otkriva kritične točke mreže.
          {betweenness[0] && (<>
            {" "}Stajalište <strong className="font-medium text-slate-900 dark:text-slate-100">{betweenness[0].name}</strong> je najvažnije čvorište -
            najveći udio svih najkraćih puteva prolazi upravo kroz njega.
            Ako se ta stanica zatvori, tisuće putnika mora tražiti alternativnu rutu.
          </>)}
        </p>
        <p className="mt-6">
          <strong className="font-medium text-slate-900 dark:text-slate-100">Closeness centralnost</strong> pokazuje odakle je najbrže doći svugdje.
          {closeness[0] && (<>
            {" "}<strong className="font-medium text-slate-900 dark:text-slate-100">{closeness[0].name}</strong> ima najpovoljniji prosječni pristup cijeloj mreži.
          </>)}
          {" "}Mrežni dijametar od <strong className="font-medium text-slate-900 dark:text-slate-100">{networkDiameter.minutes} minuta</strong>{" "}
          ({networkDiameter.fromStop} &rarr; {networkDiameter.toStop}) označava najdulje moguće putovanje unutar sustava.
        </p>
      </div>
    </section>
  )
}

function DistrictBandsSection({
  data,
  bands,
  districtEmblems,
  base,
}: {
  data: ScoreData
  bands: ReturnType<typeof computeBands>
  districtEmblems: DistrictEmblems
  base: ReturnType<typeof computeBaseInsights>
}) {
  return (
    <div className="flex flex-col gap-24 border-t border-slate-200 py-16 sm:py-24 dark:border-white/10">
      {bands.map((band) => (
        <section key={band.label}>
          <BandHeader band={band} />
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {band.districts.map((d) => (
              <DistrictCard
                key={d.osmId}
                district={d}
                emblemPath={districtEmblems[String(d.osmId)]}
                totalGridCells={data.totalGridCells}
                bandColor={band.color}
                cityAvg={base.cityAvg}
                bestDistrict={base.best.name}
                mapLink={`/?lat=${d.bestPoint.lat}&lon=${d.bestPoint.lon}&time=08:00${d.bajsStations > 0 ? "&bajs=1" : ""}`}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function BandHeader({ band }: { band: { label: string; color: string; districts: DistrictScore[] } }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4">
        <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: band.color }} />
        <h3 className="font-serif text-[28px] text-slate-900 sm:text-[32px] dark:text-slate-100">{band.label}</h3>
      </div>
      <span className="pl-7 text-[15px] font-medium text-slate-500 dark:text-slate-400">
        {band.districts.length} {band.districts.length === 1 ? "četvrt" : "četvrti"}
      </span>
    </div>
  )
}

function MethodologySection({
  data,
  base,
  bajs,
}: {
  data: ScoreData
  base: ReturnType<typeof computeBaseInsights>
  bajs: ReturnType<typeof computeBajsInsights>
}) {
  return (
    <section id="metodologija" className="flex flex-col border-t border-slate-200 py-16 sm:py-24 dark:border-white/10">
      <h2 className="mb-12 font-serif text-[28px] tracking-tight text-slate-900 sm:text-[32px] dark:text-slate-100">
        Metodologija izračuna
      </h2>
      <MethodologyGrid data={data} base={base} bajs={bajs} />
      <MethodologyFooter base={base} />
    </section>
  )
}

function MethodologyGrid({
  data,
  base,
  bajs,
}: {
  data: ScoreData
  base: ReturnType<typeof computeBaseInsights>
  bajs: ReturnType<typeof computeBajsInsights>
}) {
  return (
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-5 lg:gap-12">
      <MethodologyGridItems data={data} base={base} />
      {bajs.hasBajs && (
        <MethodologyItem color="amber" title="BAJS">
          Idealni scenarij:{" "}
          <strong className="font-medium text-slate-900 dark:text-slate-100">{bajs.bajsTotalStations}</strong>{" "}
          stanica, svaka s 1 biciklom. Brzina{" "}
          <strong className="font-medium text-slate-900 dark:text-slate-100">14 km/h</strong>.
        </MethodologyItem>
      )}
    </div>
  )
}

function MethodologyGridItems({ data, base }: { data: ScoreData; base: ReturnType<typeof computeBaseInsights> }) {
  return (
    <>
      <MethodologyItem color="emerald" title="Algoritam">
        Dijkstrina pretraga nad{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">ZET GTFS</strong>{" "}
        i pješačkom mrežom.
      </MethodologyItem>
      <MethodologyItem color="cyan" title="Raster">
        <strong className="font-medium text-slate-900 dark:text-slate-100">{data.gridSpacingM}m</strong>{" "}
        razmak ·{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">{data.totalSamplePoints.toLocaleString("hr-HR")}</strong>{" "}
        uzoraka u naseljima.
      </MethodologyItem>
      <MethodologyItem color="blue" title="Metrika">
        Udio dosežnih ćelija od ukupno{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">{data.totalGridCells.toLocaleString("hr-HR")}</strong>{" "}
        u gradu.
      </MethodologyItem>
      <MethodologyItem color="purple" title="Vozni red">
        Prosjek od{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">{data.departureCount ?? 1} polazaka</strong>{" "}
        u prozoru{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">{base.displayDepartureTime}</strong>{" "}
        (vršni sat). Čekanje na stanicu modelirano kao pola intervala
        dolaska linije. Bez kašnjenja u voznom redu.
      </MethodologyItem>
      <MethodologyItem color="slate" title="Zašto 30 minuta?">
        30 minuta je međunarodni standard za mjerenje dostupnosti javnog
        prijevoza (OECD, EU Sustainable Mobility). Obuhvaća jednu
        tramvajsku ili autobusnu dionicu s presjedanjem - tipično
        svakodnevno putovanje u Zagrebu.
      </MethodologyItem>
    </>
  )
}

function MethodologyItem({ color, title, children }: { color: string; title: string; children: React.ReactNode }) {
  const borderColors: Record<string, string> = {
    emerald: "border-emerald-500",
    cyan: "border-cyan-500",
    blue: "border-blue-500",
    purple: "border-purple-500",
    slate: "border-slate-400",
    amber: "border-amber-500",
  }
  return (
    <div className={`flex flex-col gap-3 border-l-2 ${borderColors[color] ?? ""} pl-5`}>
      <span className="font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">{title}</span>
      <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">{children}</p>
    </div>
  )
}

function MethodologyFooter({ base }: { base: ReturnType<typeof computeBaseInsights> }) {
  return (
    <div className="mt-12 flex flex-col gap-8 border-t border-slate-200 pt-8 sm:flex-row sm:items-start sm:justify-between dark:border-white/10">
      <div className="flex flex-col gap-2">
        <p className="font-sans text-[12px] tracking-wide text-slate-500 dark:text-slate-400">
          Zadnji izračun proveden:{" "}
          <span className="font-medium text-slate-900 dark:text-slate-100">{base.generatedLabel}</span>
        </p>
      </div>
      <MethodologyDownload />
    </div>
  )
}

function MethodologyDownload() {
  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
      <a
        href="/api/open-data"
        download="doseg-district-scores.json"
        className="inline-flex items-center gap-2.5 rounded-full bg-slate-900 px-5 py-3 text-[14px] font-medium text-white shadow-sm transition-[transform,colors] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-slate-800 active:scale-[0.98] dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Preuzmi podatke (JSON)
      </a>
      <span className="max-w-md text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
        Svi izračunati podaci po četvrtima - rezultati, populacija, pustinjski indeks,
        BAJS utjecaj, večernji pad - u strojno čitljivom JSON formatu. Slobodno za korištenje
        uz navođenje izvora.
      </span>
    </div>
  )
}

// --- Shared Components ---

function RankingListItem({
  d,
  i,
  maxVal,
  value,
  label,
  trailing,
  color,
}: {
  d: DistrictScore
  i: number
  maxVal: number
  value: (d: DistrictScore) => number
  label: (d: DistrictScore) => string
  trailing: (d: DistrictScore) => string
  color: { text: string; bg: string; bar: string }
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-5 shrink-0 text-right font-serif text-[13px] text-slate-400 tabular-nums">
        {i + 1}.
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="truncate text-[14px] font-medium text-slate-900 dark:text-slate-100">{d.name}</span>
          <span className={`shrink-0 font-serif text-[14px] font-medium tabular-nums ${color.text}`}>{label(d)}</span>
        </div>
        <div className={`relative h-1.5 w-full overflow-hidden rounded-full ${color.bg}`}>
          <div className={`absolute inset-y-0 left-0 rounded-full ${color.bar}`} style={{ width: `${(value(d) / maxVal) * 100}%` }} />
        </div>
      </div>
      <span className="shrink-0 text-[11px] text-slate-400 tabular-nums dark:text-slate-500">{trailing(d)}</span>
    </div>
  )
}

function RankingList({
  items,
  value,
  label,
  trailing,
  color,
}: {
  items: DistrictScore[]
  value: (d: DistrictScore) => number
  label: (d: DistrictScore) => string
  trailing: (d: DistrictScore) => string
  color: { text: string; bg: string; bar: string }
}) {
  const maxVal = items.length > 0 ? value(items[0]) : 1
  return (
    <div className="space-y-3">
      {items.slice(0, 8).map((d, i) => (
        <RankingListItem key={d.osmId} d={d} i={i} maxVal={maxVal} value={value} label={label} trailing={trailing} color={color} />
      ))}
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-[#F6F5F2] dark:bg-background">
      <main
        id="main-content"
        className="mx-auto max-w-[1400px] px-6 py-12 sm:py-20"
      >
        {children}
      </main>
    </div>
  )
}

function StatHero({
  best,
  bestPct,
  departureTime,
  maxMinutes,
  ratio,
  worst,
}: {
  best: DistrictScore
  bestPct: string
  departureTime: string
  maxMinutes: number
  ratio: number
  worst: DistrictScore
}) {
  return (
    <section className="mx-auto mt-12 w-full max-w-5xl sm:mt-20">
      <div className="flex flex-col gap-8 md:flex-row md:items-start">
        <div className="md:w-1/2">
          <div className="mb-6 inline-block rounded-full bg-orange-100 px-4 py-1 text-xs font-semibold uppercase tracking-wider text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
            Jutarnji presjek • {departureTime}
          </div>
          <h1 className="font-serif text-6xl tracking-tight text-slate-900 sm:text-7xl lg:text-[6rem] lg:leading-[0.9] dark:text-slate-50">
            Povezanost
            <br />
            <span className="italic text-orange-600 dark:text-orange-400">četvrti</span>
          </h1>
        </div>
        <div className="md:w-1/2">
          <p className="relative text-[18px] leading-[1.8] text-slate-600 sm:text-[20px] dark:text-slate-300">
            <span className="float-left pr-2 font-serif text-7xl leading-[0.8] text-slate-900 dark:text-slate-100">
              U
            </span>
            Zagrebu, prosječni stanovnik četvrti{" "}
            <strong className="font-semibold text-orange-600 dark:text-orange-400">{best.name}</strong> može doseći
            <strong className="font-semibold text-slate-900 dark:text-white"> {bestPct}% grada </strong>
            u {maxMinutes} minuta. S druge strane, oni u četvrti{" "}
            <strong className="font-semibold text-orange-600 dark:text-orange-400">{worst.name}</strong> imaju{" "}
            <strong className="font-semibold text-slate-900 dark:text-white">
              {ratio === Infinity ? "čak ∞" : `čak ${ratio}x`} slabiji
            </strong>{" "}
            doseg.
          </p>
        </div>
      </div>
    </section>
  )
}

function ScoreRing({ score, accent, size }: { score: number; accent: string; size: "sm" | "lg" }) {
  const radius = size === "sm" ? 16 : 24
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (score / 100) * circumference
  const viewBox = size === "sm" ? "0 0 40 40" : "0 0 64 64"
  const cx = size === "sm" ? 20 : 32
  const cy = size === "sm" ? 20 : 32
  const sw = size === "sm" ? 3 : 4
  const containerClass = size === "sm" ? "relative flex h-11 w-11 shrink-0 items-center justify-center" : "relative flex h-16 w-16 shrink-0 items-center justify-center"
  const textClass = size === "sm" ? "block font-serif text-[14px] leading-none text-slate-900 dark:text-white" : "block font-serif text-[20px] leading-none text-slate-900 dark:text-white"
  return (
    <div className={containerClass}>
      <svg aria-hidden="true" className="absolute inset-0 h-full w-full -rotate-90" viewBox={viewBox}>
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="currentColor" strokeWidth={sw} className="text-black/5 dark:text-white/10" />
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke={accent} strokeWidth={sw} strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" className="transition-[stroke-dashoffset] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]" />
      </svg>
      <div className="flex flex-col items-center text-center">
        <span className={textClass}>{score}</span>
      </div>
    </div>
  )
}

function BackLink() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 text-[13px] font-medium tracking-wide text-slate-600 transition-[transform,colors] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:text-slate-900 active:scale-[0.97] dark:text-slate-500 dark:hover:text-slate-300"
    >
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 12L6 8l4-4" />
      </svg>
      Natrag na kartu
    </Link>
  )
}

function DistrictEmblem({ pathData, rank, color }: { pathData?: string; rank: number; color: string }) {
  return (
    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
      {pathData ? (
        <DistrictEmblemSvg pathData={pathData} color={color} />
      ) : (
        <div className="absolute inset-0 rounded-2xl border" style={{ borderColor: color, backgroundColor: `${color}1a` }} />
      )}
      <span className="relative z-10 inline-flex min-w-7 items-center justify-center px-2 py-1 font-serif text-[15px] text-slate-900 tabular-nums dark:text-white">{rank}</span>
    </div>
  )
}

function DistrictEmblemSvg({ pathData, color }: { pathData: string; color: string }) {
  return (
    <>
      <div className="absolute inset-[11px] rounded-full blur-[10px]" style={{ backgroundColor: `${color}18` }} />
      <svg width="56" height="56" viewBox="0 0 56 56" className="absolute inset-0 overflow-visible" aria-hidden="true">
        <path d={pathData} fill={`${color}14`} fillRule="evenodd" stroke={color} strokeWidth="1.35" strokeLinejoin="round" />
      </svg>
    </>
  )
}

function DistrictCard({
  district: d,
  emblemPath,
  totalGridCells,
  bandColor,
  cityAvg,
  bestDistrict,
  mapLink,
}: {
  district: DistrictScore
  emblemPath?: string
  totalGridCells: number
  bandColor: string
  cityAvg: number
  bestDistrict: string
  mapLink: string
}) {
  return (
    <div className="relative flex flex-col overflow-hidden border-l-2 bg-transparent pl-6 py-2" style={{ borderLeftColor: bandColor }}>
      <DistrictCardHeader d={d} emblemPath={emblemPath} bandColor={bandColor} bestDistrict={bestDistrict} />
      <DistrictCardStats d={d} />
      <DistrictCardReach d={d} totalGridCells={totalGridCells} bandColor={bandColor} cityAvg={cityAvg} />
      <DistrictCardBoosts d={d} totalGridCells={totalGridCells} />
      <DistrictCardLines d={d} />
      <DistrictCardFooter mapLink={mapLink} />
    </div>
  )
}

function DistrictCardHeader({
  d,
  emblemPath,
  bandColor,
  bestDistrict,
}: {
  d: DistrictScore
  emblemPath?: string
  bandColor: string
  bestDistrict: string
}) {
  return (
    <div className="relative flex items-start justify-between gap-4">
      <div>
        <DistrictEmblem pathData={emblemPath} rank={d.rank} color={bandColor} />
        <h4 className="mt-5 font-serif text-[22px] leading-tight tracking-tight text-slate-900 dark:text-slate-100">{d.name}</h4>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <div role="img" aria-label={`Rezultat ${d.score} od 100`}>
          <ScoreRing score={d.score} accent={bandColor} size="lg" />
        </div>
        <div className="text-right">
          <span className="block font-sans text-[8px] font-bold tracking-widest text-slate-400 uppercase dark:text-slate-500">Indeks</span>
          <span className="mt-0.5 block font-sans text-[9px] text-slate-500 dark:text-slate-400">
            {d.score === 100 ? "Referentna točka" : `${d.score}% od ${bestDistrict}`}
          </span>
        </div>
      </div>
    </div>
  )
}

function DistrictCardStats({ d }: { d: DistrictScore }) {
  return (
    <div className="mt-8 flex flex-wrap gap-2">
      <StatBadge value={d.population ? fmtHR(d.population / 1000, 1) + "k" : "N/A"} label="stan." />
      <StatBadge value={String(d.stops)} label="stajališta" />
      <StatBadge value={`~${Math.round((d.medianHeadwayMin))} min`} label="interval" />
      <DistrictCardSpecialBadges d={d} />
    </div>
  )
}

function StatBadge({ value, label }: { value: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-sm bg-slate-100 px-2 py-1 dark:bg-white/5">
      <span className="font-serif text-[13px] font-medium text-slate-700 dark:text-slate-300">{value}</span>
      <span className="text-[10px] text-slate-500 uppercase tracking-widest dark:text-slate-400">{label}</span>
    </div>
  )
}

function DistrictCardSpecialBadges({ d }: { d: DistrictScore }) {
  return (
    <>
      {(d.trainLines?.length ?? 0) > 0 && (
        <div className="inline-flex items-center gap-1.5 rounded-sm bg-teal-50 px-2 py-1 dark:bg-teal-900/20">
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-teal-600 dark:text-teal-400">
            <rect x="4" y="3" width="16" height="14" rx="2" /><path d="M4 11h16" /><path d="M12 3v8" /><circle cx="8" cy="20" r="1" /><circle cx="16" cy="20" r="1" />
          </svg>
          <span className="font-serif text-[13px] font-medium text-teal-700 dark:text-teal-400">HŽ</span>
        </div>
      )}
      {d.bajsStations > 0 && (
        <div className="inline-flex items-center gap-1.5 rounded-sm bg-amber-50 px-2 py-1 dark:bg-amber-900/20">
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600 dark:text-amber-400">
            <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" />
          </svg>
          <span className="font-serif text-[13px] font-medium text-amber-700 dark:text-amber-400">{d.bajsStations} BAJS</span>
        </div>
      )}
      {(d.peakOffpeakDrop ?? 0) >= 30 && (
        <div className="inline-flex items-center gap-1.5 rounded-sm bg-indigo-50 px-2 py-1 dark:bg-indigo-900/20">
          <span className="font-serif text-[13px] font-medium text-indigo-600 dark:text-indigo-400">-{d.peakOffpeakDrop}%</span>
          <span className="text-[10px] uppercase tracking-widest text-indigo-500 dark:text-indigo-400">navečer</span>
        </div>
      )}
      {(d.desertPct ?? 0) >= 20 && (
        <div className="inline-flex items-center gap-1.5 rounded-sm bg-red-50 px-2 py-1 dark:bg-red-900/20">
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500 dark:text-red-400">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" />
          </svg>
          <span className="font-serif text-[13px] font-medium text-red-600 dark:text-red-400">{d.desertPct}%</span>
          <span className="text-[10px] uppercase tracking-widest text-red-500 dark:text-red-400">pustinja</span>
        </div>
      )}
    </>
  )
}

function DistrictCardReach({
  d,
  totalGridCells,
  bandColor,
  cityAvg,
}: {
  d: DistrictScore
  totalGridCells: number
  bandColor: string
  cityAvg: number
}) {
  const reachPctStr = pct(d.avgReachableCells, totalGridCells)
  const reachPctNum = (d.avgReachableCells / totalGridCells) * 100
  const cityReachPctNum = (cityAvg / totalGridCells) * 100
  const vsAvg = Math.round(((d.avgReachableCells - cityAvg) / cityAvg) * 100)
  return (
    <div className="mt-8 flex-1">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-sans text-[10px] tracking-[0.15em] text-slate-500 uppercase dark:text-slate-400">Doseg grada</span>
        <span className="font-serif text-[15px] font-medium tabular-nums text-slate-900 dark:text-slate-100">{reachPctStr}%</span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${reachPctNum}%`, backgroundColor: bandColor }} />
        <div className="absolute top-0 bottom-0 w-[2px] bg-slate-900 dark:bg-white" style={{ left: `${cityReachPctNum}%` }} title="Prosjek grada" />
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        {d.minReachableCells !== undefined && d.maxReachableCells !== undefined ? (
          <span className="font-sans text-[9px] text-slate-400 tabular-nums dark:text-slate-500">
            {pct(d.minReachableCells, totalGridCells)}-{pct(d.maxReachableCells, totalGridCells)}%
          </span>
        ) : <span />}
        <span className={`font-sans text-[9px] tracking-widest uppercase ${vsAvg > 0 ? "text-emerald-600 dark:text-emerald-500" : vsAvg < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400"}`}>
          {vsAvg > 0 ? `+${vsAvg}% iznad prosjeka` : vsAvg === 0 ? "Drži prosjek grada" : `${Math.abs(vsAvg)}% ispod prosjeka`}
        </span>
      </div>
    </div>
  )
}

function DistrictCardBoosts({ d, totalGridCells }: { d: DistrictScore; totalGridCells: number }) {
  const reachPctNum = (d.avgReachableCells / totalGridCells) * 100
  return (
    <>
      {(d.trainBoostPct ?? 0) > 0 && (
        <BoostBar label="S HŽ vlakovima" color="teal" pct={d.trainBoostPct!} barWidth={Math.min(((d.trainAvgReachableCells ?? d.avgReachableCells) / totalGridCells) * 100, 100)} baseWidth={reachPctNum} />
      )}
      {d.bajsBoostPct > 0 && (
        <BoostBar label="S BAJS biciklima" color="amber" pct={d.bajsBoostPct} barWidth={Math.min(((d.bajsAvgReachableCells ?? d.avgReachableCells) / totalGridCells) * 100, 100)} baseWidth={reachPctNum} />
      )}
    </>
  )
}

function BoostBar({ label, color, pct: boostPct, barWidth, baseWidth }: { label: string; color: "teal" | "amber"; pct: number; barWidth: number; baseWidth: number }) {
  const textColor = color === "teal" ? "text-teal-600 dark:text-teal-400" : "text-amber-600 dark:text-amber-400"
  const bgColor = color === "teal" ? "bg-teal-50 dark:bg-teal-900/10" : "bg-amber-50 dark:bg-amber-900/10"
  const barColor = color === "teal" ? "bg-teal-400 dark:bg-teal-500" : "bg-amber-400 dark:bg-amber-500"
  const overlayColor = color === "teal" ? "bg-teal-600/20 dark:bg-teal-300/20" : "bg-amber-600/20 dark:bg-amber-300/20"
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-end justify-between">
        <span className={`font-sans text-[10px] tracking-[0.15em] uppercase ${textColor}`}>{label}</span>
        <span className={`font-serif text-[13px] leading-none tabular-nums ${textColor}`}>+{boostPct}%</span>
      </div>
      <div className={`relative h-1.5 w-full overflow-hidden rounded-full ${bgColor}`}>
        <div className={`absolute inset-y-0 left-0 rounded-full ${barColor}`} style={{ width: `${barWidth}%` }} />
        <div className={`absolute inset-y-0 left-0 rounded-full ${overlayColor}`} style={{ width: `${baseWidth}%` }} />
      </div>
    </div>
  )
}

function DistrictCardLines({ d }: { d: DistrictScore }) {
  return (
    <div className="mt-8">
      <span className="mb-3 block font-sans text-[10px] tracking-[0.15em] text-slate-500 uppercase dark:text-slate-400">Linije</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {d.tramLines.length === 0 && d.busLines.length === 0 && (d.trainLines?.length ?? 0) === 0 ? (
          <span className="text-[12px] text-slate-500 italic">Nema linija</span>
        ) : (
          <DistrictCardLinesBadges d={d} />
        )}
      </div>
    </div>
  )
}

function DistrictCardLinesBadges({ d }: { d: DistrictScore }) {
  return (
    <>
      {d.tramLines.map((line) => (
        <span key={`t${line}`} className="inline-flex h-[24px] min-w-[24px] items-center justify-center rounded-sm bg-slate-100 px-1.5 font-mono text-[11px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
          {line}
        </span>
      ))}
      {d.busLines.length > 0 && (
        <span className="inline-flex h-[24px] items-center justify-center rounded-sm bg-slate-100 px-2 font-mono text-[11px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
          {d.busLines.length} {d.busLines.length === 1 ? "bus" : "buseva"}
        </span>
      )}
      {(d.trainLines?.length ?? 0) > 0 && (
        <span className="inline-flex h-[24px] items-center justify-center rounded-sm bg-teal-50 px-2 font-mono text-[11px] font-medium text-teal-700 dark:bg-teal-900/20 dark:text-teal-400">
          HŽ vlak
        </span>
      )}
    </>
  )
}

function DistrictCardFooter({ mapLink }: { mapLink: string }) {
  return (
    <div className="mt-6 pt-4">
      <Link
        href={mapLink}
        className="flex items-center gap-1.5 font-sans text-[11px] font-bold tracking-[0.2em] text-violet-600 uppercase transition-colors hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
      >
        Istraži područje
        <span aria-hidden="true">&rarr;</span>
      </Link>
    </div>
  )
}
