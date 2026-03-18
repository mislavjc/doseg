import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Metadata } from "next"
import Link from "next/link"
import DistrictMap from "@/components/district-map"
import { getDataDir } from "@/lib/data-dir"
import { scaleLinear, scaleSqrt } from "@visx/scale"
import { Group } from "@visx/group"
import { LinePath } from "@visx/shape"
import { GridRows, GridColumns } from "@visx/grid"

export const metadata: Metadata = {
  title: "Statistika - Doseg",
  description:
    "Ranking zagrebačkih gradskih četvrti po dostupnosti javnim prijevozom i BAJS biciklima u 30 minuta.",
  openGraph: {
    title: "Statistika - Doseg",
    description:
      "Ranking zagrebačkih gradskih četvrti po dostupnosti javnim prijevozom i BAJS biciklima u 30 minuta.",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "Statistika - Doseg",
    description:
      "Ranking zagrebačkih gradskih četvrti po dostupnosti javnim prijevozom i BAJS biciklima u 30 minuta.",
  },
}

export const revalidate = 3600

interface DistrictScore {
  name: string
  osmId: number
  population?: number
  sampleCount: number
  avgReachableCells: number
  trainAvgReachableCells?: number
  trainBoostPct?: number
  bajsAvgReachableCells: number
  bajsBoostPct: number
  bajsStations: number
  minReachableCells?: number
  maxReachableCells?: number
  stddevReachableCells?: number
  eveningAvgReachableCells?: number
  peakOffpeakDrop?: number
  desertPct?: number
  avgNearestStopM?: number
  rank: number
  score: number
  bestPoint: { lat: number; lon: number }
  tramLines: string[]
  busLines: string[]
  trainLines?: string[]
  stops: number
  avgHeadwayMin: number
}

interface ScoreData {
  generatedAt: string
  departureTime: string
  gridSpacingM: number
  maxMinutes: number
  totalSamplePoints: number
  totalGridCells: number
  bajsTotalStations: number
  cityDesertPct?: number
  districts: DistrictScore[]
}

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

/** Compute Gini coefficient (inequality index) for a given metric across districts. */
function computeGini(
  districts: DistrictScore[],
  accessor: (d: DistrictScore) => number
): number {
  const sorted = [...districts].sort((a, b) => accessor(a) - accessor(b))
  const n = sorted.length
  if (n === 0) return 0
  const total = sorted.reduce((s, d) => s + accessor(d), 0)
  if (total === 0) return 0
  const wSum = sorted.reduce(
    (s, d, i) => s + (2 * (i + 1) - n - 1) * accessor(d),
    0
  )
  return wSum / (n * total)
}

/** Compute weighted percentage change between two district metrics. */
function weightedPctChange(
  districts: DistrictScore[],
  baseValue: (d: DistrictScore) => number,
  compValue: (d: DistrictScore) => number,
  totalSamplePoints: number
): number {
  let baseW = 0
  let compW = 0
  for (const d of districts) {
    baseW += baseValue(d) * d.sampleCount
    compW += compValue(d) * d.sampleCount
  }
  return baseW > 0 ? Math.round(((compW - baseW) / baseW) * 100) : 0
}

export default function StatistikaPage() {
  const data = loadScores()

  if (!data) {
    return (
      <Shell>
        <BackLink />
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
      </Shell>
    )
  }

  const districtEmblems = loadDistrictEmblems()

  // Derived insights
  const totalPop = data.districts.reduce((s, d) => s + (d.population ?? 0), 0)
  const poorDistricts = data.districts.filter((d) => d.score < 25)
  const goodDistricts = data.districts.filter((d) => d.score >= 50)
  const poorPop = poorDistricts.reduce((s, d) => s + (d.population ?? 0), 0)
  const goodPop = goodDistricts.reduce((s, d) => s + (d.population ?? 0), 0)
  const best = data.districts[0]
  const worst = data.districts[data.districts.length - 1]
  const bestPct = pct(best.avgReachableCells, data.totalGridCells)
  const worstPct = pct(worst.avgReachableCells, data.totalGridCells)
  const ratio = Math.round(best.avgReachableCells / worst.avgReachableCells)
  const generatedLabel = new Date(data.generatedAt).toLocaleDateString(
    "hr-HR",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
    }
  )

  // Weighted city average
  const weightedSum = data.districts.reduce(
    (s, d) => s + d.avgReachableCells * d.sampleCount,
    0
  )
  const cityAvg = weightedSum / data.totalSamplePoints

  // Population-weighted city score
  const cityWeightedScore = Math.round(
    totalPop > 0
      ? data.districts.reduce((s, d) => s + d.score * (d.population ?? 0), 0) / totalPop
      : 0
  )

  // BAJS insights
  const hasBajs = (data.bajsTotalStations ?? 0) > 0
  const bajsTotalStations = data.bajsTotalStations ?? 0
  const cityBajsBoost = hasBajs
    ? weightedPctChange(
        data.districts,
        (d) => d.avgReachableCells,
        (d) => d.bajsAvgReachableCells ?? d.avgReachableCells,
        data.totalSamplePoints
      )
    : 0
  const bajsRankedByBoost = hasBajs
    ? [...data.districts].sort(
        (a, b) => (b.bajsBoostPct ?? 0) - (a.bajsBoostPct ?? 0)
      )
    : []
  const topBajsBeneficiary = bajsRankedByBoost[0]

  // Transit desert insights
  const hasDesertData = data.districts.some((d) => d.desertPct !== undefined)
  const desertDistricts = hasDesertData
    ? [...data.districts]
        .filter((d) => (d.desertPct ?? 0) > 0)
        .sort((a, b) => (b.desertPct ?? 0) - (a.desertPct ?? 0))
    : []
  const lowFreqDistricts = data.districts.filter((d) => d.avgHeadwayMin >= 30)

  // Tram dependency insight
  const tramlessDistricts = data.districts.filter((d) => d.tramLines.length === 0)
  const bestTramless = tramlessDistricts.length > 0
    ? Math.max(...tramlessDistricts.map((d) => d.score))
    : 0

  // Peak vs off-peak insights
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
        (d) => d.eveningAvgReachableCells ?? d.avgReachableCells,
        data.totalSamplePoints
      )
    : 0

  // Internal inequality
  const hasVarianceData = data.districts.some((d) => d.stddevReachableCells !== undefined)
  const varianceRanked = hasVarianceData
    ? [...data.districts]
        .filter((d) => (d.stddevReachableCells ?? 0) > 0)
        .sort((a, b) => (b.stddevReachableCells ?? 0) - (a.stddevReachableCells ?? 0))
    : []

  // Frequency data — districts sorted by headway
  const freqRanked = [...data.districts].sort((a, b) => a.avgHeadwayMin - b.avgHeadwayMin)
  const allTramLines = new Set(data.districts.flatMap((d) => d.tramLines))
  const allBusLines = new Set(data.districts.flatMap((d) => d.busLines))
  const totalLines = allTramLines.size + allBusLines.size
  const maxHeadway = Math.max(...freqRanked.map((d) => d.avgHeadwayMin))

  // Score vs density scatterplot data
  const densityData = data.districts.map((d) => ({
    name: d.name,
    score: d.score,
    density: (d.population ?? 0) / Math.max(d.sampleCount, 1),
    population: d.population ?? 0,
    hasTram: d.tramLines.length > 0,
    tramLineCount: d.tramLines.length,
    sampleCount: d.sampleCount,
  }))
  const maxDensity = Math.max(...densityData.map((d) => d.density))

  // Scatterplot scales (computed here, used in the SVG below)
  const scatterMargin = { top: 20, right: 16, bottom: 50, left: 40 }
  const scatterW = 340
  const scatterH = 280
  const scatterInnerW = scatterW - scatterMargin.left - scatterMargin.right
  const scatterInnerH = scatterH - scatterMargin.top - scatterMargin.bottom
  const scatterCeilDensity = Math.ceil(maxDensity / 100) * 100 || maxDensity + 10
  const scatterXScale = scaleLinear<number>({
    domain: [0, scatterCeilDensity],
    range: [0, scatterInnerW],
  })
  const scatterYScale = scaleLinear<number>({
    domain: [0, 100],
    range: [scatterInnerH, 0],
  })
  const scatterMaxPop = Math.max(...densityData.map((d) => d.population))
  const scatterRScale = scaleSqrt<number>({
    domain: [0, scatterMaxPop],
    range: [4, 14],
  })

  // Notable outliers for scatterplot labels
  const scatterSesvete = densityData.find((d) => d.name === "Sesvete")
  const scatterDonjiGrad = densityData.find((d) => d.name === "Donji grad")
  const scatterNovizg = densityData.find(
    (d) => d.name === "Novi Zagreb - istok" || d.name === "Novi Zagreb - zapad"
  )

  // Gini coefficients
  const gini = computeGini(data.districts, (d) => d.avgReachableCells)
  const bajsGini = computeGini(data.districts, (d) => d.bajsAvgReachableCells ?? d.avgReachableCells)
  const eveningGini = computeGini(data.districts, (d) => d.eveningAvgReachableCells ?? d.avgReachableCells)
  const giniDiff = bajsGini - gini

  // Population-weighted Lorenz curve data points
  const popSorted = [...data.districts].sort(
    (a, b) => a.avgReachableCells - b.avgReachableCells
  )
  const lorenzPoints: { x: number; y: number }[] = [{ x: 0, y: 0 }]
  {
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
  }

  // Group by quality band
  const bands = [
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

  return (
    <Shell>
      <BackLink />
      <StatHero
        best={best}
        bestPct={bestPct}
        departureTime={data.departureTime}
        generatedLabel={generatedLabel}
        maxMinutes={data.maxMinutes}
        ratio={ratio}
        worst={worst}
      />

      {/* Choropleth map */}
      <section id="karta" className="mt-20 sm:mt-32">
        <div className="mb-10 flex flex-col items-center text-center">
          <h2 className="font-serif text-3xl tracking-tight text-slate-900 sm:text-4xl dark:text-slate-100">
            Karta područja
          </h2>
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
        </div>
        <div className="mx-auto max-w-5xl">
          <DistrictMap />
        </div>
      </section>

      {/* Headline insights */}
      <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="flex flex-col justify-between rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
          <div className="mb-4 font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
            Gradski prosjek
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-serif text-[40px] leading-none text-slate-900 tabular-nums dark:text-slate-100">
              {cityWeightedScore}
            </span>
            <span className="text-[14px] text-slate-500 dark:text-slate-400">
              od 100 bodova
            </span>
          </div>
          <div className="mt-2 text-[12px] leading-snug text-slate-500 dark:text-slate-400">
            populacijski ponderiran prosječni rezultat.
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
          <div className="mb-4 font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
            Dobra povezanost
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-serif text-[40px] leading-none text-slate-900 tabular-nums dark:text-slate-100">
              {goodDistricts.length}
            </span>
            <span className="text-[14px] text-slate-500 dark:text-slate-400">
              od {data.districts.length} četvrti
            </span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
          <div className="mb-4 font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
            Jaz u dostupnosti
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-serif text-[40px] leading-none text-slate-900 tabular-nums dark:text-slate-100">
              {totalPop > 0 ? Math.round((poorPop / totalPop) * 100) : 0}%
            </span>
            <span className="text-[14px] text-slate-500 dark:text-slate-400">
              stanovnika
            </span>
          </div>
          <div className="mt-2 text-[12px] leading-snug text-slate-500 dark:text-slate-400">
            živi u četvrtima s rezultatom manjim od 25.
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
          <div className="mb-4 font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
            Maksimalni doseg
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-serif text-[40px] leading-none text-slate-900 tabular-nums dark:text-slate-100">
              {bestPct}%
            </span>
            <span className="text-[14px] text-slate-500 dark:text-slate-400">
              grada
            </span>
          </div>
          <div className="mt-2 text-[12px] leading-snug text-slate-500 dark:text-slate-400">
            može se doseći iz najbolje četvrti ({best.name}).
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
          <div className="mb-4 font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
            Mreža u brojkama
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-serif text-[40px] leading-none text-slate-900 tabular-nums dark:text-slate-100">
              {totalLines}
            </span>
            <span className="text-[14px] text-slate-500 dark:text-slate-400">
              linija
            </span>
          </div>
          <div className="mt-2 text-[12px] leading-snug text-slate-500 dark:text-slate-400">
            {data.districts
              .reduce((s, d) => s + d.stops, 0)
              .toLocaleString("hr-HR")}{" "}
            stajališta ukupno.
          </div>
        </div>

        {(() => {
          const districtsWithTrains = data.districts.filter(
            (d) => (d.trainLines?.length ?? 0) > 0
          ).length
          return districtsWithTrains > 0 ? (
            <div className="flex flex-col justify-between rounded-2xl bg-teal-50 p-6 shadow-sm ring-1 ring-teal-200/50 dark:bg-teal-950/20 dark:ring-teal-500/20">
              <div className="mb-4 font-sans text-[11px] font-bold tracking-widest text-teal-700 uppercase dark:text-teal-400">
                HŽ vlakovi
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-serif text-[40px] leading-none text-slate-900 tabular-nums dark:text-slate-100">
                  {districtsWithTrains}
                </span>
                <span className="text-[14px] text-teal-700 dark:text-teal-400">
                  / {data.districts.length} četvrti
                </span>
              </div>
              <div className="mt-2 text-[12px] leading-snug text-teal-700/80 dark:text-teal-400/80">
                Rijedak interval (30–60 min) ograničava utjecaj na kratkim
                putovanjima.
              </div>
            </div>
          ) : null
        })()}

        {hasBajs && (
          <div className="flex flex-col justify-between rounded-2xl bg-amber-50 p-6 shadow-sm ring-1 ring-amber-200/50 dark:bg-amber-950/20 dark:ring-amber-500/20">
            <div className="mb-4 font-sans text-[11px] font-bold tracking-widest text-amber-700 uppercase dark:text-amber-400">
              BAJS bike-sharing
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-serif text-[40px] leading-none text-slate-900 tabular-nums dark:text-slate-100">
                {bajsTotalStations}
              </span>
              <span className="text-[14px] text-amber-700 dark:text-amber-400">
                stanica
              </span>
            </div>
            <div className="mt-2 text-[12px] leading-snug text-amber-700/80 dark:text-amber-400/80">
              Prosječno +{cityBajsBoost}% dosega za cijeli grad.
            </div>
          </div>
        )}
      </div>

      <div className="mt-16 grid grid-cols-1 gap-12 sm:mt-20">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* What the score means */}
          <section id="metodika" className="flex flex-col rounded-3xl bg-slate-100 p-8 dark:bg-white/5">
            <div className="mb-6 flex items-center gap-3 text-slate-800 dark:text-slate-200">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-white/10">
                <svg
                  aria-hidden="true"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
              </span>
              <h2 className="font-serif text-[22px] text-slate-900 dark:text-slate-100">
                Što znači rezultat
              </h2>
            </div>
            <div className="space-y-4 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
              <p>
                Grad je podijeljen u ćelije od ~200m. Rezultat mjeri koliki udio
                tih ćelija ({data.totalGridCells.toLocaleString("hr-HR")}{" "}
                ukupno) možeš doseći za{" "}
                <strong className="font-medium text-slate-900 dark:text-slate-100">
                  {data.maxMinutes} minuta
                </strong>{" "}
                koristeći tramvaj, bus i hodanje. Uzorkovane su samo naseljene
                točke (blizu zgrada).
              </p>
              <p>
                <strong className="font-medium text-slate-900 dark:text-slate-100">
                  {best.name}
                </strong>{" "}
                ima rezultat 100 - njeni stanovnici prosječno mogu doseći{" "}
                {bestPct}% grada.{" "}
                <strong className="font-medium text-slate-900 dark:text-slate-100">
                  {worst.name}
                </strong>{" "}
                ima rezultat {worst.score} - samo {worstPct}%.
              </p>
              {hasBajs && (
                <p>
                  Dodatno mjerimo utjecaj{" "}
                  <strong className="font-medium text-amber-700 dark:text-amber-400">
                    BAJS bike-sharinga
                  </strong>{" "}
                  — u idealnom scenariju (svaka stanica ima bicikl) prosječni
                  stanovnik grada dobiva{" "}
                  <strong className="font-medium text-slate-900 dark:text-slate-100">
                    +{cityBajsBoost}%
                  </strong>{" "}
                  veći doseg.
                </p>
              )}
            </div>
          </section>

          {/* Accessibility gap */}
          <section id="jaz" className="flex flex-col rounded-3xl bg-rose-50/50 p-8 dark:bg-rose-950/10">
            <div className="mb-6 flex items-center gap-3 text-rose-800 dark:text-rose-200">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-rose-500/20">
                <svg
                  aria-hidden="true"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
              </span>
              <h2 className="font-serif text-[22px] text-slate-900 dark:text-slate-100">
                Jaz u dostupnosti
              </h2>
            </div>
            <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
              Samo{" "}
              <strong className="font-medium text-slate-900 dark:text-slate-100">
                {totalPop > 0 ? Math.round((goodPop / totalPop) * 100) : 0}%
              </strong>{" "}
              Zagrepčana ({goodPop.toLocaleString("hr-HR")} stan.) živi u
              četvrtima s rezultatom ≥50. Istovremeno,{" "}
              <strong className="font-medium text-slate-900 dark:text-slate-100">
                {totalPop > 0 ? Math.round((poorPop / totalPop) * 100) : 0}%
              </strong>{" "}
              ({poorPop.toLocaleString("hr-HR")} stan.) živi u četvrtima gdje je
              rezultat ispod 25 - to uključuje{" "}
              <span className="text-slate-600 dark:text-slate-400">
                {poorDistricts.map((d) => d.name).join(", ")}
              </span>
              .
            </p>
          </section>
        </div>

        {/* Gini coefficient + Lorenz curve */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left panel — Lorenz curve SVG */}
          <section id="lorenz" className="flex flex-col rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
            <div className="mb-4 font-sans text-[11px] font-bold tracking-widest text-emerald-700 uppercase dark:text-emerald-400">
              Lorenzova krivulja dostupnosti
            </div>
            {(() => {
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
                      {/* Grid lines at 25%, 50%, 75% */}
                      <GridRows
                        scale={lyScale}
                        width={liw}
                        tickValues={[0.25, 0.5, 0.75]}
                        stroke="#94a3b8"
                        strokeOpacity={0.15}
                        strokeWidth={1}
                      />
                      <GridColumns
                        scale={lxScale}
                        height={lih}
                        tickValues={[0.25, 0.5, 0.75]}
                        stroke="#94a3b8"
                        strokeOpacity={0.15}
                        strokeWidth={1}
                      />

                      {/* Shaded area between equality line and Lorenz curve */}
                      <polygon
                        points={[
                          // Walk along equality line from (0,0) to (1,1)
                          ...lorenzPoints.map(
                            (p) => `${lxScale(p.x)},${lyScale(p.x)}`
                          ),
                          // Walk back along Lorenz curve from (1,1) to (0,0)
                          ...[...lorenzPoints].reverse().map(
                            (p) => `${lxScale(p.x)},${lyScale(p.y)}`
                          ),
                        ].join(" ")}
                        fill="#6ee7b7"
                        fillOpacity={0.3}
                      />

                      {/* Diagonal — perfect equality */}
                      <line
                        x1={0}
                        y1={lih}
                        x2={liw}
                        y2={0}
                        stroke="#94a3b8"
                        strokeWidth={1}
                        strokeDasharray="4 3"
                      />

                      {/* Lorenz curve */}
                      <LinePath<{ x: number; y: number }>
                        data={lorenzPoints}
                        x={(d) => lxScale(d.x)}
                        y={(d) => lyScale(d.y)}
                        stroke="#059669"
                        strokeWidth={2.5}
                        strokeLinejoin="round"
                      />

                      {/* Tick labels — X axis */}
                      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
                        <text
                          key={`xt-${v}`}
                          x={lxScale(v)}
                          y={lih + 16}
                          textAnchor="middle"
                          className="fill-slate-400 text-[8px] dark:fill-slate-500"
                        >
                          {Math.round(v * 100)}%
                        </text>
                      ))}

                      {/* Tick labels — Y axis */}
                      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
                        <text
                          key={`yt-${v}`}
                          x={-8}
                          y={lyScale(v) + 1}
                          textAnchor="end"
                          dominantBaseline="middle"
                          className="fill-slate-400 text-[8px] dark:fill-slate-500"
                        >
                          {Math.round(v * 100)}%
                        </text>
                      ))}

                      {/* X axis label */}
                      <text
                        x={liw / 2}
                        y={lih + 28}
                        textAnchor="middle"
                        className="fill-slate-500 text-[9px] dark:fill-slate-400"
                      >
                        Udio stanovništva (%)
                      </text>

                      {/* Y axis label */}
                      <text
                        x={-22}
                        y={lih / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        transform={`rotate(-90, -22, ${lih / 2})`}
                        className="fill-slate-500 text-[9px] dark:fill-slate-400"
                      >
                        Udio dostupnosti (%)
                      </text>
                    </Group>
                  </svg>
                </div>
              )
            })()}
            <p className="mt-4 text-center text-[13px] leading-snug text-slate-500 dark:text-slate-400">
              Što je krivulja dalje od dijagonale, to je nejednakost veća.
            </p>
            <div className="sr-only">
              <table>
                <caption>Lorenzova krivulja — podaci po četvrtima sortirani po dostupnosti</caption>
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
          </section>

          {/* Right panel — Gini interpretation */}
          <section id="gini" className="flex flex-col rounded-3xl bg-emerald-50/50 p-8 dark:bg-emerald-950/10">
            <div className="mb-6 flex items-center gap-3 text-emerald-800 dark:text-emerald-200">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-emerald-500/20">
                <svg
                  aria-hidden="true"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 3v18h18" />
                  <path d="m19 9-5 5-4-4-3 3" />
                </svg>
              </span>
              <h2 className="font-serif text-[22px] text-slate-900 dark:text-slate-100">
                Gini koeficijent
              </h2>
            </div>
            <div className="mb-2 flex items-baseline gap-2">
              <span className="font-serif text-[48px] leading-none text-emerald-700 tabular-nums dark:text-emerald-400">
                {fmtHR(gini, 2)}
              </span>
            </div>
            <p className="mb-6 text-[13px] text-slate-500 dark:text-slate-400">
              (0 = savršena jednakost, 1 = potpuna nejednakost)
            </p>

            <div className="mb-6 grid grid-cols-3 gap-4">
              <div className="rounded-xl bg-white/80 p-3 text-center dark:bg-white/5">
                <div className="mb-1 text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
                  Jutro
                </div>
                <div className="font-serif text-[24px] leading-none text-slate-900 tabular-nums dark:text-slate-100">
                  {fmtHR(gini, 3)}
                </div>
              </div>
              <div className="rounded-xl bg-white/80 p-3 text-center dark:bg-white/5">
                <div className="mb-1 text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
                  S BAJS-om
                </div>
                <div className={`font-serif text-[24px] leading-none tabular-nums ${bajsGini > gini ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {fmtHR(bajsGini, 3)}
                </div>
              </div>
              <div className="rounded-xl bg-white/80 p-3 text-center dark:bg-white/5">
                <div className="mb-1 text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
                  Večer
                </div>
                <div className="font-serif text-[24px] leading-none text-slate-900 tabular-nums dark:text-slate-100">
                  {fmtHR(eveningGini, 3)}
                </div>
              </div>
            </div>

            <p className="text-[14px] leading-relaxed text-emerald-700/80 dark:text-emerald-300/80">
              BAJS bike-sharing blago{" "}
              {giniDiff > 0 ? "pogor\u0161ava" : "pobolj\u0161ava"} jednakost
              (Gini {giniDiff > 0 ? "+" : ""}
              {fmtHR(giniDiff, 3)}) jer su stanice
              koncentrirane u već dobro povezanim četvrtima. Proširenje mreže
              prema rubnim četvrtima moglo bi smanjiti nejednakost.
            </p>
          </section>
        </div>

        {/* Tram is king */}
        {tramlessDistricts.length > 0 && (
          <section id="tramvaj" className="rounded-3xl bg-rose-50/50 p-8 dark:bg-rose-950/10">
            <div className="mb-6 flex items-center gap-3 text-rose-800 dark:text-rose-200">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-rose-500/20">
                <svg
                  aria-hidden="true"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="4" y="3" width="16" height="14" rx="2" />
                  <path d="M12 3v14" />
                  <path d="M4 10h16" />
                  <path d="M7 21l2-4" />
                  <path d="M17 21l-2-4" />
                </svg>
              </span>
              <h2 className="font-serif text-[22px] text-slate-900 dark:text-slate-100">
                Tramvaj je kralj
              </h2>
            </div>
            <div className="space-y-4 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
              <p>
                Nijedna četvrt bez tramvaja ne prelazi rezultat{" "}
                <strong className="font-medium text-slate-900 dark:text-slate-100">
                  {bestTramless}
                </strong>
                . {tramlessDistricts.length} četvrti nema tramvajski pristup:{" "}
                <span className="text-slate-600 dark:text-slate-400">
                  {tramlessDistricts.map((d) => d.name).join(", ")}
                </span>
                .
              </p>
              <p>
                Broj tramvajskih linija je najjači prediktor rezultata — četvrti
                s više od 10 linija prosječno imaju rezultat iznad 50.
              </p>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[14px] text-rose-700/80 dark:text-rose-300/80">
                {[...tramlessDistricts]
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
            </div>
          </section>
        )}
      </div>

      {/* Density vs connectivity scatterplot */}
      <section id="gustoca" className="mt-16 sm:mt-20">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-4 flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-violet-500" />
            <h2 className="font-serif text-3xl tracking-tight text-slate-900 sm:text-4xl dark:text-slate-100">
              Gustoća vs. povezanost
            </h2>
          </div>
          <p className="max-w-2xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
            Svaka točka je jedna gradska četvrt. Idealno bi gušće naseljene
            četvrti trebale imati bolji javni prijevoz — ali to u Zagrebu često
            nije slučaj.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Scatterplot */}
          <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
            <svg
              viewBox={`0 0 ${scatterW} ${scatterH}`}
              className="w-full"
              role="img"
              aria-label="Raspršeni dijagram gustoće stanovništva i rezultata povezanosti po četvrtima"
            >
              <Group top={scatterMargin.top} left={scatterMargin.left}>
                {/* Horizontal grid lines */}
                <GridRows
                  scale={scatterYScale}
                  width={scatterInnerW}
                  tickValues={[25, 50, 75]}
                  stroke="#94a3b8"
                  strokeOpacity={0.15}
                  strokeWidth={1}
                  strokeDasharray="3,3"
                />

                {/* Y axis tick labels */}
                {[0, 25, 50, 75, 100].map((v) => (
                  <text
                    key={v}
                    x={-6}
                    y={scatterYScale(v) + 1}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="fill-slate-400 text-[8px] dark:fill-slate-500"
                  >
                    {v}
                  </text>
                ))}

                {/* X axis tick labels */}
                {[0, Math.round(scatterCeilDensity / 2), scatterCeilDensity].map((v) => (
                  <text
                    key={v}
                    x={scatterXScale(v)}
                    y={scatterInnerH + 16}
                    textAnchor="middle"
                    className="fill-slate-400 text-[8px] dark:fill-slate-500"
                  >
                    {v}
                  </text>
                ))}

                {/* Y axis line */}
                <line
                  x1={0}
                  y1={0}
                  x2={0}
                  y2={scatterInnerH}
                  stroke="#cbd5e1"
                  strokeWidth={0.5}
                />
                {/* X axis line */}
                <line
                  x1={0}
                  y1={scatterInnerH}
                  x2={scatterInnerW}
                  y2={scatterInnerH}
                  stroke="#cbd5e1"
                  strokeWidth={0.5}
                />

                {/* X axis label */}
                <text
                  x={scatterInnerW / 2}
                  y={scatterInnerH + 32}
                  textAnchor="middle"
                  className="fill-slate-500 text-[9px] dark:fill-slate-400"
                >
                  Gustoća (stan. / uzorak)
                </text>
                {/* Y axis label */}
                <text
                  x={-28}
                  y={scatterInnerH / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(-90, -28, ${scatterInnerH / 2})`}
                  className="fill-slate-500 text-[9px] dark:fill-slate-400"
                >
                  Rezultat
                </text>

                {/* Data points */}
                {densityData.map((d) => {
                  const cx = scatterXScale(d.density)
                  const cy = scatterYScale(d.score)
                  const r = scatterRScale(d.population)
                  const title = `${d.name}: rezultat ${d.score}, gustoća ${Math.round(d.density)}, ${d.population} stan.`
                  if (d.hasTram) {
                    return (
                      <circle
                        key={d.name}
                        cx={cx}
                        cy={cy}
                        r={r}
                        fill="#16a34a"
                        fillOpacity={0.6}
                        stroke="#15803d"
                        strokeWidth={0.5}
                      >
                        <title>{title}</title>
                      </circle>
                    )
                  }
                  // Diamond shape for no-tram districts
                  const s = r * 1.2
                  return (
                    <polygon
                      key={d.name}
                      points={`${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`}
                      fill="#8b5cf6"
                      fillOpacity={0.6}
                      stroke="#7c3aed"
                      strokeWidth={0.5}
                    >
                      <title>{title}</title>
                    </polygon>
                  )
                })}

                {/* Outlier labels */}
                {scatterDonjiGrad && (
                  <text
                    x={
                      scatterXScale(scatterDonjiGrad.density) -
                      scatterRScale(scatterDonjiGrad.population) -
                      3
                    }
                    y={scatterYScale(scatterDonjiGrad.score) + 1}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="fill-slate-700 text-[8px] font-medium dark:fill-slate-300"
                  >
                    Donji grad
                  </text>
                )}
                {scatterSesvete && (
                  <text
                    x={
                      scatterXScale(scatterSesvete.density) +
                      scatterRScale(scatterSesvete.population) +
                      3
                    }
                    y={scatterYScale(scatterSesvete.score) + 1}
                    textAnchor="start"
                    dominantBaseline="middle"
                    className="fill-slate-700 text-[8px] font-medium dark:fill-slate-300"
                  >
                    Sesvete
                  </text>
                )}
                {scatterNovizg && (
                  <text
                    x={
                      scatterXScale(scatterNovizg.density) +
                      scatterRScale(scatterNovizg.population) +
                      3
                    }
                    y={scatterYScale(scatterNovizg.score) + 1}
                    textAnchor="start"
                    dominantBaseline="middle"
                    className="fill-slate-700 text-[8px] font-medium dark:fill-slate-300"
                  >
                    {scatterNovizg.name}
                  </text>
                )}
              </Group>
            </svg>
            {/* Legend below SVG */}
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
            <div className="sr-only">
              <table>
                <caption>Gustoća vs. povezanost — podaci po četvrtima</caption>
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
          </div>

          {/* Interpretation */}
          <div className="flex flex-col rounded-3xl bg-violet-50/50 p-8 dark:bg-violet-950/10">
            <div className="mb-6 flex items-center gap-3 text-violet-800 dark:text-violet-200">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-violet-500/20">
                <svg
                  aria-hidden="true"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="7.5" cy="7.5" r="5.5" />
                  <circle cx="16.5" cy="16.5" r="5.5" />
                </svg>
              </span>
              <h3 className="font-serif text-[22px] text-slate-900 dark:text-slate-100">
                Što graf otkriva?
              </h3>
            </div>
            <div className="space-y-4 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
              <p>
                Četvrti s tramvajem (zelene) grupiraju se iznad rezultata 30,
                dok četvrti bez tramvaja (ljubičaste) konzistentno zaostaju.
              </p>
              <p>
                <strong className="font-medium text-slate-900 dark:text-slate-100">
                  Sesvete
                </strong>{" "}
                s{" "}
                <strong className="font-medium text-slate-900 dark:text-slate-100">
                  {(
                    densityData.find((d) => d.name === "Sesvete")
                      ?.population ?? 0
                  ).toLocaleString("hr-HR")}
                </strong>{" "}
                stanovnika i rezultatom 15 je najveći primjer lošeg omjera
                gustoće i povezanosti u gradu.
              </p>
              <p>
                <strong className="font-medium text-slate-900 dark:text-slate-100">
                  Donji grad
                </strong>{" "}
                (rezultat 100) ima samo{" "}
                <strong className="font-medium text-slate-900 dark:text-slate-100">
                  {(scatterDonjiGrad?.population ?? 0).toLocaleString("hr-HR")}
                </strong>{" "}
                stanovnika ali najgušću mrežu —{" "}
                <strong className="font-medium text-slate-900 dark:text-slate-100">
                  {scatterDonjiGrad?.tramLineCount ?? 0}
                </strong>{" "}
                tramvajskih linija na samo{" "}
                <strong className="font-medium text-slate-900 dark:text-slate-100">
                  {fmtHR((scatterDonjiGrad?.sampleCount ?? 0) * 0.04, 1)}
                </strong>{" "}
                km².
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Transit desert section */}
      {(hasDesertData || lowFreqDistricts.length > 0) && (
        <section id="pustinje" className="mt-16 sm:mt-20">
          <div className="mb-10 flex flex-col items-center text-center">
            <div className="mb-4 flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-red-500" />
              <h2 className="font-serif text-3xl tracking-tight text-slate-900 sm:text-4xl dark:text-slate-100">
                Prometne pustinje
              </h2>
            </div>
            <p className="max-w-2xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
              Područja gdje je najbliža stanica udaljena više od 500 metara
              zračne linije (realna pješačka udaljenost je 20-40% veća) ili gdje
              prijevoz dolazi rjeđe od 2 puta na sat.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Desert ranking */}
            {hasDesertData && desertDistricts.length > 0 && (
              <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="font-sans text-[11px] font-bold tracking-widest text-red-700 uppercase dark:text-red-400">
                    Daleko od stanice (&gt;500m)
                  </h3>
                  {data.cityDesertPct !== undefined && (
                    <span className="font-serif text-[14px] text-slate-500 dark:text-slate-400">
                      {data.cityDesertPct}% grada
                    </span>
                  )}
                </div>
                <p className="mb-6 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                  Udio stanovnika u svakoj četvrti koji žive više od 500m od
                  najbliže stanice javnog prijevoza.
                </p>
                <RankingList
                  items={desertDistricts}
                  value={(d) => d.desertPct ?? 0}
                  label={(d) => `${d.desertPct}%`}
                  trailing={(d) => `~${d.avgNearestStopM}m`}
                  color={{
                    text: "text-red-600 dark:text-red-400",
                    bg: "bg-red-100 dark:bg-red-900/30",
                    bar: "bg-red-500",
                  }}
                />
              </div>
            )}

            {/* Summary + interpretation */}
            {hasDesertData && (
              <div className="flex flex-col rounded-3xl bg-red-50/50 p-8 dark:bg-red-950/10">
                <div className="mb-6 flex items-center gap-3 text-red-800 dark:text-red-200">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-red-500/20">
                    <svg
                      aria-hidden="true"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                      <path d="M12 9v4" />
                      <path d="M12 17h.01" />
                    </svg>
                  </span>
                  <h3 className="font-serif text-[22px] text-slate-900 dark:text-slate-100">
                    Koliko je to loše?
                  </h3>
                </div>
                <div className="mb-8 grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="font-serif text-[36px] leading-none text-red-600 tabular-nums dark:text-red-400">
                      {data.cityDesertPct ?? 0}%
                    </div>
                    <div className="mt-2 text-[12px] text-slate-600 dark:text-slate-400">
                      uzorkovanih točaka grada je
                      <br />
                      &gt;500m od stanice
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="font-serif text-[36px] leading-none text-slate-900 tabular-nums dark:text-slate-100">
                      {desertDistricts.length}
                    </div>
                    <div className="mt-2 text-[12px] text-slate-600 dark:text-slate-400">
                      od {data.districts.length} četvrti
                      <br />
                      ima barem jednu pustinjsku zonu
                    </div>
                  </div>
                </div>
                <div className="space-y-4 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                  <p>
                    Najudaljenija četvrt je{" "}
                    <strong className="font-medium text-slate-900 dark:text-slate-100">
                      {desertDistricts[0]?.name}
                    </strong>{" "}
                    — {desertDistricts[0]?.desertPct}% uzorkovanih točaka je
                    više od 500m zračne linije od najbliže stanice, s prosječnom
                    udaljenošću od{" "}
                    <strong className="font-medium text-slate-900 dark:text-slate-100">
                      ~{desertDistricts[0]?.avgNearestStopM}m
                    </strong>
                    .
                  </p>
                  {lowFreqDistricts.length > 0 && (
                    <p>
                      Dodatno,{" "}
                      <strong className="font-medium text-slate-900 dark:text-slate-100">
                        {lowFreqDistricts.length}
                      </strong>{" "}
                      {lowFreqDistricts.length === 1
                        ? "četvrt ima"
                        : "četvrti imaju"}{" "}
                      medijan intervala ≥30 min — manje od 2 polaska na sat (
                      {lowFreqDistricts.map((d) => d.name).join(", ")}).
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Peak vs off-peak section */}
      {hasEveningData && eveningRankedByDrop.length > 0 && (
        <section id="vrsni-sat" className="mt-16 sm:mt-20">
          <div className="mb-10 flex flex-col items-center text-center">
            <div className="mb-4 flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-indigo-500" />
              <h2 className="font-serif text-3xl tracking-tight text-slate-900 sm:text-4xl dark:text-slate-100">
                Jutro vs. večer
              </h2>
            </div>
            <p className="max-w-2xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
              Koliko dostupnosti svaka četvrt gubi navečer (21:00) u usporedbi s
              jutarnjim vršnim satom ({data.departureTime}). Ista mreža, manji
              broj polazaka.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Drop ranking */}
            <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="font-sans text-[11px] font-bold tracking-widest text-indigo-700 uppercase dark:text-indigo-400">
                  Najveći pad navečer
                </h3>
                <span className="font-serif text-[14px] text-slate-500 dark:text-slate-400">
                  -{cityEveningDrop}% prosjek
                </span>
              </div>
              <p className="mb-6 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                Postotak smanjenja dosežnih ćelija u 30 minuta navečer u
                usporedbi s jutarnjim vršnim satom.
              </p>
              <div className="space-y-3">
                <RankingList
                  items={eveningRankedByDrop}
                  value={(d) => d.peakOffpeakDrop ?? 0}
                  label={(d) => `-${d.peakOffpeakDrop}%`}
                  trailing={(d) =>
                    `${pct(d.eveningAvgReachableCells ?? d.avgReachableCells, data.totalGridCells)}%`
                  }
                  color={{
                    text: "text-indigo-600 dark:text-indigo-400",
                    bg: "bg-indigo-100 dark:bg-indigo-900/30",
                    bar: "bg-indigo-500",
                  }}
                />
              </div>
            </div>

            {/* Interpretation */}
            <div className="flex flex-col rounded-3xl bg-indigo-50/50 p-8 dark:bg-indigo-950/10">
              <div className="mb-6 flex items-center gap-3 text-indigo-800 dark:text-indigo-200">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-indigo-500/20">
                  <svg
                    aria-hidden="true"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                  </svg>
                </span>
                <h3 className="font-serif text-[22px] text-slate-900 dark:text-slate-100">
                  Što se događa navečer?
                </h3>
              </div>
              <div className="mb-8 grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="font-serif text-[36px] leading-none text-indigo-600 tabular-nums dark:text-indigo-400">
                    -{cityEveningDrop}%
                  </div>
                  <div className="mt-2 text-[12px] text-slate-600 dark:text-slate-400">
                    prosječni pad dosega
                    <br />u cijelom gradu
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-serif text-[36px] leading-none text-slate-900 tabular-nums dark:text-slate-100">
                    -{eveningRankedByDrop[0]?.peakOffpeakDrop ?? 0}%
                  </div>
                  <div className="mt-2 text-[12px] text-slate-600 dark:text-slate-400">
                    najgori pad
                    <br />({eveningRankedByDrop[0]?.name ?? "—"})
                  </div>
                </div>
              </div>
              <div className="space-y-4 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                <p>
                  Gradski prosjek pada za{" "}
                  <strong className="font-medium text-slate-900 dark:text-slate-100">
                    {cityEveningDrop}%
                  </strong>{" "}
                  navečer. Najviše gube rubne četvrti koje ovise o rijetkim
                  autobusnim linijama, dok centar s gustom tramvajskom mrežom
                  zadržava većinu povezanosti.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* BAJS Impact section */}
      {hasBajs && (
        <section id="bajs" className="mt-16 sm:mt-20">
          <div className="mb-10 flex flex-col items-center text-center">
            <div className="mb-4 flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-amber-500" />
              <h2 className="font-serif text-3xl tracking-tight text-slate-900 sm:text-4xl dark:text-slate-100">
                Utjecaj BAJS bicikala
              </h2>
            </div>
            <p className="max-w-2xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
              Koliko se dostupnost svake četvrti poboljšava kada se uz javni
              prijevoz koriste i BAJS bicikli. Mjereno u idealnom scenariju gdje
              je svaka stanica operativna s barem jednim biciklom.
            </p>
          </div>

          {/* BAJS choropleth map */}
          <div className="mb-10">
            <div className="mb-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[13px] text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-[#d97706]" />
                Tamnije = veći dobitak
              </span>
              <span className="hidden opacity-50 sm:inline-block">•</span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-[#94a3b8]" />
                Sivo = bez utjecaja
              </span>
            </div>
            <div className="mx-auto max-w-5xl">
              <div
                className="w-full overflow-hidden"
                style={{ aspectRatio: "960/620" }}
              >
                <img
                  src="/district-bajs-map.svg"
                  alt="Karta utjecaja BAJS bicikala po četvrtima. Tamniji amber označava veći dobitak u dostupnosti."
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Boost ranking */}
            <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
              <h3 className="mb-6 font-sans text-[11px] font-bold tracking-widest text-amber-700 uppercase dark:text-amber-400">
                Tko najviše profitira
              </h3>
              <RankingList
                items={bajsRankedByBoost}
                value={(d) => d.bajsBoostPct ?? 0}
                label={(d) => `+${d.bajsBoostPct}%`}
                trailing={(d) => `${d.bajsStations} st.`}
                color={{
                  text: "text-amber-600 dark:text-amber-400",
                  bg: "bg-amber-100 dark:bg-amber-900/30",
                  bar: "bg-amber-500",
                }}
              />
            </div>

            {/* BAJS equity analysis */}
            <div className="flex flex-col gap-6">
              <div className="flex-1 rounded-3xl bg-amber-50/50 p-8 dark:bg-amber-950/10">
                <div className="mb-6 flex items-center gap-3 text-amber-800 dark:text-amber-200">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-amber-500/20">
                    <svg
                      aria-hidden="true"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="m16 10-4 4-4-4" />
                    </svg>
                  </span>
                  <h3 className="font-serif text-[22px] text-slate-900 dark:text-slate-100">
                    Smanjuje li BAJS jaz?
                  </h3>
                </div>
                <div className="space-y-4 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                  <p>
                    {(() => {
                      const topHalf = data.districts.slice(
                        0,
                        Math.floor(data.districts.length / 2)
                      )
                      const bottomHalf = data.districts.slice(
                        Math.floor(data.districts.length / 2)
                      )
                      const topBoost =
                        topHalf.reduce((s, d) => s + (d.bajsBoostPct ?? 0), 0) /
                        topHalf.length
                      const bottomBoost =
                        bottomHalf.reduce(
                          (s, d) => s + (d.bajsBoostPct ?? 0),
                          0
                        ) / bottomHalf.length
                      const narrows = bottomBoost > topBoost
                      return narrows ? (
                        <>
                          Da. Slabije povezane četvrti prosječno dobivaju{" "}
                          <strong className="font-medium text-slate-900 dark:text-slate-100">
                            +{Math.round(bottomBoost)}%
                          </strong>{" "}
                          poboljšanja, dok bolje povezane dobivaju{" "}
                          <strong className="font-medium text-slate-900 dark:text-slate-100">
                            +{Math.round(topBoost)}%
                          </strong>
                          . BAJS bicikli sužavaju jaz u dostupnosti.
                        </>
                      ) : (
                        <>
                          Ne u dovoljnoj mjeri. Bolje povezane četvrti dobivaju{" "}
                          <strong className="font-medium text-slate-900 dark:text-slate-100">
                            +{Math.round(topBoost)}%
                          </strong>{" "}
                          poboljšanja, dok slabije povezane dobivaju{" "}
                          <strong className="font-medium text-slate-900 dark:text-slate-100">
                            +{Math.round(bottomBoost)}%
                          </strong>
                          . BAJS stanice su koncentrirane u centru — proširenje
                          mreže prema rubnim četvrtima moglo bi smanjiti
                          nejednakost.
                        </>
                      )
                    })()}
                  </p>
                </div>
              </div>
              <div className="flex-1 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
                <h3 className="mb-4 font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
                  Ukupni utjecaj
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="font-serif text-[28px] leading-none text-amber-600 tabular-nums dark:text-amber-400">
                      +{cityBajsBoost}%
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                      prosječni dobitak
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="font-serif text-[28px] leading-none text-slate-900 tabular-nums dark:text-slate-100">
                      {bajsTotalStations}
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                      stanica u gradu
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="font-serif text-[28px] leading-none text-slate-900 tabular-nums dark:text-slate-100">
                      {topBajsBeneficiary
                        ? `+${topBajsBeneficiary.bajsBoostPct}%`
                        : "—"}
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                      max. dobitak ({topBajsBeneficiary?.name ?? "—"})
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Internal inequality section */}
      {hasVarianceData && varianceRanked.length > 0 && (
        <section id="varijacija" className="mt-16 sm:mt-20">
          <div className="mb-10 flex flex-col items-center text-center">
            <div className="mb-4 flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-sky-500" />
              <h2 className="font-serif text-3xl tracking-tight text-slate-900 sm:text-4xl dark:text-slate-100">
                Nejednakost unutar četvrti
              </h2>
            </div>
            <p className="max-w-2xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
              Neke četvrti imaju odlične dijelove i prometne pustinje unutar
              istog područja. Standardna devijacija mjeri koliko se rezultati
              razlikuju unutar jedne četvrti.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Variance ranking */}
            <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
              <h3 className="mb-6 font-sans text-[11px] font-bold tracking-widest text-sky-700 uppercase dark:text-sky-400">
                Najveća varijacija u dostupnosti
              </h3>
              <div className="space-y-3">
                {varianceRanked.slice(0, 8).map((d, i) => {
                  const minPct =
                    ((d.minReachableCells ?? 0) / data.totalGridCells) * 100
                  const maxPct =
                    ((d.maxReachableCells ?? 0) / data.totalGridCells) * 100
                  return (
                    <div key={d.osmId} className="flex items-center gap-3">
                      <span className="w-5 shrink-0 text-right font-serif text-[13px] text-slate-400 tabular-nums">
                        {i + 1}.
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-baseline justify-between gap-2">
                          <span className="truncate text-[14px] font-medium text-slate-900 dark:text-slate-100">
                            {d.name}
                          </span>
                          <span className="shrink-0 font-serif text-[14px] font-medium text-sky-600 tabular-nums dark:text-sky-400">
                            σ {Math.round(d.stddevReachableCells ?? 0)}
                          </span>
                        </div>
                        {/* Range bar: min to max as % of grid */}
                        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-sky-100 dark:bg-sky-900/30">
                          <div
                            className="absolute inset-y-0 rounded-full bg-sky-500"
                            style={{
                              left: `${minPct}%`,
                              width: `${Math.max(maxPct - minPct, 1)}%`,
                            }}
                          />
                        </div>
                      </div>
                      <span className="shrink-0 text-[11px] text-slate-400 tabular-nums dark:text-slate-500">
                        {pct(d.minReachableCells ?? 0, data.totalGridCells)}–
                        {pct(d.maxReachableCells ?? 0, data.totalGridCells)}%
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Interpretation card */}
            <div className="flex flex-col rounded-3xl bg-sky-50/50 p-8 dark:bg-sky-950/10">
              <div className="mb-6 flex items-center gap-3 text-sky-800 dark:text-sky-200">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-sky-500/20">
                  <svg
                    aria-hidden="true"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2 20h.01" />
                    <path d="M7 20v-4" />
                    <path d="M12 20v-8" />
                    <path d="M17 20V8" />
                    <path d="M22 4v16" />
                  </svg>
                </span>
                <h3 className="font-serif text-[22px] text-slate-900 dark:text-slate-100">
                  Što to znači?
                </h3>
              </div>
              <div className="mb-8 grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="font-serif text-[36px] leading-none text-sky-600 tabular-nums dark:text-sky-400">
                    σ {Math.round(varianceRanked[0]?.stddevReachableCells ?? 0)}
                  </div>
                  <div className="mt-2 text-[12px] text-slate-600 dark:text-slate-400">
                    najveća std. devijacija
                    <br />({varianceRanked[0]?.name})
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-serif text-[36px] leading-none text-slate-900 tabular-nums dark:text-slate-100">
                    {(() => {
                      const d = varianceRanked[0]
                      if (!d) return "—"
                      const range =
                        (d.maxReachableCells ?? 0) - (d.minReachableCells ?? 0)
                      return range.toLocaleString("hr-HR")
                    })()}
                  </div>
                  <div className="mt-2 text-[12px] text-slate-600 dark:text-slate-400">
                    max raspon ćelija
                    <br />
                    (min → max unutar četvrti)
                  </div>
                </div>
              </div>
              <div className="space-y-4 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                <p>
                  Najnejednakija četvrt je{" "}
                  <strong className="font-medium text-slate-900 dark:text-slate-100">
                    {varianceRanked[0]?.name}
                  </strong>{" "}
                  — neki stanovnici imaju odličnu povezanost javnim prijevozom,
                  dok susjedi 500 metara uzbrdo nemaju gotovo ništa.
                </p>
                <p>
                  Gornji grad-Medveščak i Črnomerec protežu se uz padinu
                  Medvednice — donji dijelovi blizu centra imaju odličan
                  tramvajski pristup, dok su gornji dijelovi prometne pustinje.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Frequency spectrum section */}
      {freqRanked.length > 0 && (
        <section id="frekvencija" className="mt-16 sm:mt-20">
          <div className="mb-10 flex flex-col items-center text-center">
            <div className="mb-4 flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-blue-500" />
              <h2 className="font-serif text-3xl tracking-tight text-slate-900 sm:text-4xl dark:text-slate-100">
                Frekvencija prijevoza
              </h2>
            </div>
            <p className="max-w-2xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
              Prosječni interval dolaska vozila po četvrti. Četvrti s intervalom
              od 1 minute imaju tramvajsku mrežu; 3+ minute znači oslanjanje na
              autobuse s rjeđim polaskom.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Headway bar chart */}
            <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
              <h3 className="mb-6 font-sans text-[11px] font-bold tracking-widest text-blue-700 uppercase dark:text-blue-400">
                Interval po četvrti (minuta)
              </h3>
              <div className="space-y-2">
                {freqRanked.map((d, i) => {
                  const barPct = maxHeadway > 0 ? (d.avgHeadwayMin / maxHeadway) * 100 : 0
                  const barColor =
                    d.avgHeadwayMin <= 1
                      ? "bg-emerald-500"
                      : d.avgHeadwayMin <= 2
                        ? "bg-cyan-500"
                        : d.avgHeadwayMin <= 3
                          ? "bg-blue-500"
                          : "bg-purple-500"
                  return (
                    <div key={d.osmId} className="flex items-center gap-3">
                      <span className="w-5 shrink-0 text-right font-mono text-[11px] text-slate-400 dark:text-slate-500">
                        {i + 1}
                      </span>
                      <span className="w-[7.5rem] shrink-0 truncate text-[13px] text-slate-700 dark:text-slate-300">
                        {d.name}
                      </span>
                      <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800">
                        <div
                          className={`absolute inset-y-0 left-0 rounded-full ${barColor}`}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right font-mono text-[13px] font-medium tabular-nums text-slate-900 dark:text-slate-100">
                        {d.avgHeadwayMin.toFixed(1)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Interpretation */}
            <div className="flex flex-col rounded-3xl bg-blue-50/50 p-8 dark:bg-blue-950/10">
              <div className="mb-6 flex items-center gap-3 text-blue-800 dark:text-blue-200">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-blue-500/20">
                  <svg
                    aria-hidden="true"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </span>
                <h3 className="font-serif text-[22px] text-slate-900 dark:text-slate-100">
                  Zašto je interval važan?
                </h3>
              </div>
              <div className="mb-8 grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="font-serif text-[36px] leading-none text-blue-600 tabular-nums dark:text-blue-400">
                    {totalLines}
                  </div>
                  <div className="mt-2 text-[12px] text-slate-600 dark:text-slate-400">
                    linija
                    <br />opslužuje Zagreb
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-serif text-[20px] leading-none text-slate-900 tabular-nums dark:text-slate-100">
                    {allTramLines.size} tram + {allBusLines.size} bus
                  </div>
                  <div className="mt-2 text-[12px] text-slate-600 dark:text-slate-400">
                    tramvajskih +<br />autobusnih
                  </div>
                </div>
              </div>
              <div className="space-y-4 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                <p>
                  Četvrti s intervalom od{" "}
                  <strong className="font-medium text-slate-900 dark:text-slate-100">
                    1 minute
                  </strong>{" "}
                  imaju gustu tramvajsku mrežu koja prolazi svakih 4-5 minuta po
                  liniji. Rubne četvrti s intervalom od 3-4 minute ovise o
                  rijetkim autobusnim linijama — čekanje od 15-30 minuta
                  značajno umanjuje praktičnu dostupnost.
                </p>
                <p className="text-[13px] text-slate-500 dark:text-slate-400">
                  Noćne tramvajske linije (31-34) održavaju promet do ~05:30,
                  dajući četvrtima s tramvajem praktično 24-satnu pokrivenost.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* District ranking by band */}
      <div className="mt-20 space-y-20 lg:space-y-24">
        {bands.map((band) => (
          <section key={band.label}>
            <div className="mb-10 flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-4 dark:border-white/10">
              <div className="flex items-center gap-4">
                <span
                  className="inline-block h-4 w-4 rounded-full shadow-[inset_0_1px_1px_rgba(0,0,0,0.1)]"
                  style={{ backgroundColor: band.color }}
                />
                <h3 className="font-serif text-3xl tracking-tight text-slate-900 dark:text-slate-100">
                  {band.label}
                </h3>
              </div>
              <span className="text-[14px] font-medium text-slate-500 dark:text-slate-400">
                {band.districts.length}{" "}
                {band.districts.length === 1 ? "četvrt" : "četvrti"}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {band.districts.map((d) => (
                <DistrictCard
                  key={d.osmId}
                  district={d}
                  emblemPath={districtEmblems[String(d.osmId)]}
                  totalGridCells={data.totalGridCells}
                  bandColor={band.color}
                  cityAvg={cityAvg}
                  bestDistrict={best.name}
                  mapLink={`/?lat=${d.bestPoint.lat}&lon=${d.bestPoint.lon}&time=${data.departureTime}${d.bajsStations > 0 ? "&bajs=1" : ""}`}
                  index={d.rank - 1}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Methodology */}
      <section id="metodologija" className="mt-24 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5 sm:p-12 dark:bg-zinc-900/40 dark:ring-white/10">
        <h2 className="mb-8 font-serif text-[24px] text-slate-900 dark:text-slate-100">
          Metodologija izračuna
        </h2>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-5 lg:gap-12">
          <div className="flex flex-col gap-2 border-l-2 border-emerald-500 pl-4">
            <span className="font-sans text-[10px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
              Algoritam
            </span>
            <p className="text-[14px] leading-relaxed text-slate-700 dark:text-slate-300">
              Dijkstrina pretraga nad{" "}
              <strong className="font-medium text-slate-900 dark:text-slate-200">
                ZET GTFS
              </strong>{" "}
              i pješačkom mrežom.
            </p>
          </div>
          <div className="flex flex-col gap-2 border-l-2 border-cyan-500 pl-4">
            <span className="font-sans text-[10px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
              Raster
            </span>
            <p className="text-[14px] leading-relaxed text-slate-700 dark:text-slate-300">
              <strong className="font-medium text-slate-900 dark:text-slate-200">
                {data.gridSpacingM}m
              </strong>{" "}
              razmak ·{" "}
              <strong className="font-medium text-slate-900 dark:text-slate-200">
                {data.totalSamplePoints.toLocaleString("hr-HR")}
              </strong>{" "}
              uzoraka u naseljima.
            </p>
          </div>
          <div className="flex flex-col gap-2 border-l-2 border-blue-500 pl-4">
            <span className="font-sans text-[10px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
              Metrika
            </span>
            <p className="text-[14px] leading-relaxed text-slate-700 dark:text-slate-300">
              Udio dosežnih ćelija od ukupno{" "}
              <strong className="font-medium text-slate-900 dark:text-slate-200">
                {data.totalGridCells.toLocaleString("hr-HR")}
              </strong>{" "}
              u gradu.
            </p>
          </div>
          <div className="flex flex-col gap-2 border-l-2 border-purple-500 pl-4">
            <span className="font-sans text-[10px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
              Vozni red
            </span>
            <p className="text-[14px] leading-relaxed text-slate-700 dark:text-slate-300">
              Jutarnji vršni sat (polazak:{" "}
              <strong className="font-medium text-slate-900 dark:text-slate-200">
                {data.departureTime}
              </strong>
              ). Bez kašnjenja.
            </p>
          </div>
          {hasBajs && (
            <div className="flex flex-col gap-2 border-l-2 border-amber-500 pl-4">
              <span className="font-sans text-[10px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
                BAJS
              </span>
              <p className="text-[14px] leading-relaxed text-slate-700 dark:text-slate-300">
                Idealni scenarij:{" "}
                <strong className="font-medium text-slate-900 dark:text-slate-200">
                  {bajsTotalStations}
                </strong>{" "}
                stanica, svaka s 1 biciklom. Brzina{" "}
                <strong className="font-medium text-slate-900 dark:text-slate-200">
                  14 km/h
                </strong>
                .
              </p>
            </div>
          )}
        </div>
        <div className="mt-8 border-t border-black/5 pt-6 dark:border-white/5">
          <p className="font-sans text-[11px] font-medium tracking-wide text-slate-500 dark:text-slate-400">
            Zadnji izračun proveden:{" "}
            <span className="text-slate-700 dark:text-slate-300">
              {generatedLabel}
            </span>
          </p>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-black/5 pt-6 dark:border-white/5">
          <a
            href="/api/open-data"
            download="doseg-district-scores.json"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-medium text-white shadow-sm transition-[transform,colors] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-slate-800 active:scale-[0.97] dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Preuzmi podatke (JSON)
          </a>
          <span className="text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
            Svi izračunati podaci po četvrtima — rezultati, populacija, pustinjski indeks,
            BAJS utjecaj, večernji pad — u strojno čitljivom JSON formatu. Slobodno za korištenje
            uz navođenje izvora.
          </span>
        </div>
      </section>
    </Shell>
  )
}

// --- Components ---

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
        <div key={d.osmId} className="flex items-center gap-3">
          <span className="w-5 shrink-0 text-right font-serif text-[13px] text-slate-400 tabular-nums">
            {i + 1}.
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="truncate text-[14px] font-medium text-slate-900 dark:text-slate-100">
                {d.name}
              </span>
              <span
                className={`shrink-0 font-serif text-[14px] font-medium tabular-nums ${color.text}`}
              >
                {label(d)}
              </span>
            </div>
            <div
              className={`relative h-1.5 w-full overflow-hidden rounded-full ${color.bg}`}
            >
              <div
                className={`absolute inset-y-0 left-0 rounded-full ${color.bar}`}
                style={{
                  width: `${(value(d) / maxVal) * 100}%`,
                }}
              />
            </div>
          </div>
          <span className="shrink-0 text-[11px] text-slate-400 tabular-nums dark:text-slate-500">
            {trailing(d)}
          </span>
        </div>
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
  generatedLabel,
  maxMinutes,
  ratio,
  worst,
}: {
  best: DistrictScore
  bestPct: string
  departureTime: string
  generatedLabel: string
  maxMinutes: number
  ratio: number
  worst: DistrictScore
}) {
  return (
    <section className="mt-8 sm:mt-12">
      <div className="flex flex-col gap-12 lg:flex-row lg:items-center lg:gap-16">
        <div className="flex-1">
          <div className="inline-flex flex-wrap items-center gap-2 px-1 text-[11px] font-medium tracking-[0.18em] text-slate-500 uppercase dark:text-slate-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </span>
            Zagreb
            <span className="opacity-40">•</span>
            {maxMinutes} min dosega
            <span className="opacity-40">•</span>
            Polazak u {departureTime}
          </div>
          <h1 className="mt-5 max-w-4xl font-serif text-5xl tracking-tight text-slate-900 sm:text-6xl lg:text-[5.5rem] lg:leading-[0.95] dark:text-slate-50">
            Povezanost četvrti
          </h1>
          <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-slate-600 sm:text-[19px] dark:text-slate-400">
            Koliki dio grada prosječni stanovnik svake četvrti može doseći za{" "}
            <strong className="font-medium text-slate-900 dark:text-slate-100">
              {maxMinutes} minuta
            </strong>{" "}
            javnim prijevozom, hodanjem i BAJS bike-sharingom. U jednom
            jutarnjem vršnom satu vidi se vrlo jasan urbani jaz između središta
            i rubova grada — ali i koliko bicikli mogu pomoći.
          </p>
          <div className="mt-10 flex flex-wrap gap-x-12 gap-y-8 border-t border-black/5 pt-8 dark:border-white/5">
            <HeroStat
              color="#16a34a"
              label="Najbolji doseg"
              value={`${best.name} · ${bestPct}%`}
            />
            <HeroStat
              color="#0891b2"
              label="Zadnji izračun"
              value={generatedLabel}
            />
            <HeroStat
              color="#f59e0b"
              label="Raspon rezultata"
              value={`${ratio}× između vrha i dna`}
            />
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 lg:w-[360px] dark:bg-zinc-900/40 dark:ring-white/10">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
              Jutarnji presjek
            </h2>
            <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 dark:bg-white/5">
              <svg
                aria-hidden="true"
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-slate-500"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span className="font-serif text-[12px] font-medium text-slate-700 dark:text-slate-300">
                {departureTime}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <HeroDistrictSummary
              accent="#16a34a"
              district={best}
              label="Najbolja četvrt"
            />
            <HeroDistrictSummary
              accent="#9333ea"
              district={worst}
              label="Najslabija četvrt"
            />
          </div>
          <div className="mt-6 flex flex-col gap-3 pt-2">
            <span className="font-sans text-[9px] font-bold tracking-widest text-slate-400 uppercase dark:text-slate-500">
              Ocjene dostupnosti
            </span>
            <div className="flex flex-col gap-2">
              {[
                { color: "#16a34a", label: "70+", desc: "Odlična povezanost" },
                { color: "#0891b2", label: "50-69", desc: "Dobra povezanost" },
                { color: "#2563eb", label: "25-49", desc: "Slaba povezanost" },
                { color: "#9333ea", label: "<25", desc: "Loša povezanost" },
              ].map((band) => (
                <div key={band.label} className="flex items-center gap-3">
                  <div className="relative flex items-center justify-center">
                    <span
                      className="absolute h-3 w-3 rounded-full opacity-20"
                      style={{ backgroundColor: band.color }}
                    />
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: band.color }}
                    />
                  </div>
                  <div className="flex flex-1 items-center justify-between border-b border-black/5 pb-1 last:border-0 dark:border-white/5">
                    <span className="font-sans text-[11px] font-medium text-slate-700 dark:text-slate-300">
                      {band.desc}
                    </span>
                    <span className="font-serif text-[13px] text-slate-400">
                      {band.label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function HeroStat({
  color,
  label,
  value,
}: {
  color: string
  label: string
  value: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-2 font-sans text-[10px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
        <span
          className="h-2 w-2 rounded-full shadow-[inset_0_1px_1px_rgba(0,0,0,0.1)]"
          style={{ backgroundColor: color }}
        />
        {label}
      </span>
      <span className="font-serif text-[17px] text-slate-900 dark:text-slate-200">
        {value}
      </span>
    </div>
  )
}

function HeroDistrictSummary({
  accent,
  district,
  label,
}: {
  accent: string
  district: DistrictScore
  label: string
}) {
  const radius = 16
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset =
    circumference - (district.score / 100) * circumference

  return (
    <div className="group relative flex items-center justify-between gap-4 rounded-2xl border border-black/5 p-3 transition-colors hover:bg-slate-50/50 dark:border-white/5 dark:hover:bg-white/2" aria-label={`${label}: ${district.name}, rezultat ${district.score} od 100`}>
      <div className="min-w-0 flex-1 pl-1">
        <div className="font-sans text-[9px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
          {label}
        </div>
        <div className="mt-1 truncate font-serif text-[18px] leading-tight text-slate-900 dark:text-slate-100">
          {district.name}
        </div>
      </div>
      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full -rotate-90"
          viewBox="0 0 40 40"
        >
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-black/5 dark:text-white/10"
          />
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke={accent}
            strokeWidth="3"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-[stroke-dashoffset] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]"
          />
        </svg>
        <div className="flex flex-col items-center text-center">
          <span className="block font-serif text-[14px] leading-none text-slate-900 dark:text-white">
            {district.score}
          </span>
        </div>
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
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 12L6 8l4-4" />
      </svg>
      Natrag na kartu
    </Link>
  )
}

function DistrictEmblem({
  pathData,
  rank,
  color,
}: {
  pathData?: string
  rank: number
  color: string
}) {
  return (
    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
      {pathData ? (
        <>
          <div
            className="absolute inset-[11px] rounded-full blur-[10px]"
            style={{ backgroundColor: `${color}18` }}
          />
          <svg
            width="56"
            height="56"
            viewBox="0 0 56 56"
            className="absolute inset-0 overflow-visible"
            aria-hidden="true"
          >
            <path
              d={pathData}
              fill={`${color}14`}
              fillRule="evenodd"
              stroke={color}
              strokeWidth="1.35"
              strokeLinejoin="round"
            />
          </svg>
        </>
      ) : (
        <div
          className="absolute inset-0 rounded-2xl border"
          style={{
            borderColor: color,
            backgroundColor: `${color}1a`,
          }}
        />
      )}
      <span className="relative z-10 inline-flex min-w-7 items-center justify-center px-2 py-1 font-serif text-[15px] text-slate-900 tabular-nums dark:text-white">
        {rank}
      </span>
    </div>
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
  index,
}: {
  district: DistrictScore
  emblemPath?: string
  totalGridCells: number
  bandColor: string
  cityAvg: number
  bestDistrict: string
  mapLink: string
  index: number
}) {
  const reachPctStr = pct(d.avgReachableCells, totalGridCells)
  const reachPctNum = (d.avgReachableCells / totalGridCells) * 100
  const cityReachPctNum = (cityAvg / totalGridCells) * 100
  const vsAvg = Math.round(((d.avgReachableCells - cityAvg) / cityAvg) * 100)

  const radius = 24
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (d.score / 100) * circumference

  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10"
    >
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <DistrictEmblem
            pathData={emblemPath}
            rank={d.rank}
            color={bandColor}
          />
          <h4 className="mt-5 font-serif text-[22px] leading-tight tracking-tight text-slate-900 dark:text-slate-100">
            {d.name}
          </h4>
        </div>

        {/* Circular Score */}
        <div className="flex flex-col items-end gap-1.5">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center" role="img" aria-label={`Rezultat ${d.score} od 100`}>
            <svg
              aria-hidden="true"
              className="absolute inset-0 h-full w-full -rotate-90"
              viewBox="0 0 64 64"
            >
              <circle
                cx="32"
                cy="32"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                className="text-black/5 dark:text-white/10"
              />
              <circle
                cx="32"
                cy="32"
                r={radius}
                fill="none"
                stroke={bandColor}
                strokeWidth="4"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="transition-[stroke-dashoffset] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]"
              />
            </svg>
            <div className="flex flex-col items-center text-center">
              <span className="block font-serif text-[20px] leading-none text-slate-900 dark:text-white">
                {d.score}
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="block font-sans text-[8px] font-bold tracking-widest text-slate-400 uppercase dark:text-slate-500">
              Indeks
            </span>
            <span className="mt-0.5 block font-sans text-[9px] text-slate-500 dark:text-slate-400">
              {d.score === 100
                ? "Referentna točka"
                : `${d.score}% od ${bestDistrict}`}
            </span>
          </div>
        </div>
      </div>

      {/* Stats cluster */}
      <div className="mt-8 flex flex-wrap gap-2">
        <div className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 dark:bg-white/5">
          <span className="font-serif text-[13px] font-medium text-slate-700 dark:text-slate-300">
            {d.population
              ? fmtHR(d.population / 1000, 1) + "k"
              : "N/A"}
          </span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">
            stan.
          </span>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 dark:bg-white/5">
          <span className="font-serif text-[13px] font-medium text-slate-700 dark:text-slate-300">
            {d.stops}
          </span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">
            stajališta
          </span>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 dark:bg-white/5">
          <span className="font-serif text-[13px] font-medium text-slate-700 dark:text-slate-300">
            ~{Math.round(d.avgHeadwayMin)} min
          </span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">
            interval
          </span>
        </div>
        {(d.trainLines?.length ?? 0) > 0 && (
          <div className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-2.5 py-1.5 dark:bg-teal-900/20">
            <svg
              aria-hidden="true"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-teal-600 dark:text-teal-400"
            >
              <rect x="4" y="3" width="16" height="14" rx="2" />
              <path d="M4 11h16" />
              <path d="M12 3v8" />
              <circle cx="8" cy="20" r="1" />
              <circle cx="16" cy="20" r="1" />
            </svg>
            <span className="font-serif text-[13px] font-medium text-teal-700 dark:text-teal-400">
              HŽ
            </span>
          </div>
        )}
        {d.bajsStations > 0 && (
          <div className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 dark:bg-amber-900/20">
            <svg
              aria-hidden="true"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-amber-600 dark:text-amber-400"
            >
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span className="font-serif text-[13px] font-medium text-amber-700 dark:text-amber-400">
              {d.bajsStations} BAJS
            </span>
          </div>
        )}
        {(d.peakOffpeakDrop ?? 0) >= 30 && (
          <div className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1.5 dark:bg-indigo-900/20">
            <span className="font-serif text-[13px] font-medium text-indigo-600 dark:text-indigo-400">
              -{d.peakOffpeakDrop}%
            </span>
            <span className="text-[10px] text-indigo-500 dark:text-indigo-400">
              navečer
            </span>
          </div>
        )}
        {(d.desertPct ?? 0) >= 20 && (
          <div className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 dark:bg-red-900/20">
            <svg
              aria-hidden="true"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-red-500 dark:text-red-400"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
            <span className="font-serif text-[13px] font-medium text-red-600 dark:text-red-400">
              {d.desertPct}% pustinja
            </span>
          </div>
        )}
      </div>

      <div className="mt-8 flex-1">
        <div className="mb-2 flex items-end justify-between">
          <span className="font-sans text-[10px] tracking-[0.15em] text-slate-500 uppercase dark:text-slate-400">
            Doseg grada
          </span>
          <span className="font-serif text-[15px] leading-none text-slate-900 dark:text-slate-200">
            {reachPctStr}%
          </span>
        </div>
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${reachPctNum}%`, backgroundColor: bandColor }}
          />
          <div
            className="absolute top-0 bottom-0 w-[2px] bg-slate-900 dark:bg-white"
            style={{ left: `${cityReachPctNum}%` }}
            title="Prosjek grada"
          />
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          {d.minReachableCells !== undefined &&
          d.maxReachableCells !== undefined ? (
            <span className="font-sans text-[9px] text-slate-400 tabular-nums dark:text-slate-500">
              {pct(d.minReachableCells, totalGridCells)}–
              {pct(d.maxReachableCells, totalGridCells)}%
            </span>
          ) : (
            <span />
          )}
          <span
            className={`font-sans text-[9px] tracking-widest uppercase ${vsAvg > 0 ? "text-emerald-600 dark:text-emerald-500" : vsAvg < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400"}`}
          >
            {vsAvg > 0
              ? `+${vsAvg}% iznad prosjeka`
              : vsAvg === 0
                ? "Drži prosjek grada"
                : `${Math.abs(vsAvg)}% ispod prosjeka`}
          </span>
        </div>

        {/* Train boost bar */}
        {(d.trainBoostPct ?? 0) > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-end justify-between">
              <span className="font-sans text-[10px] tracking-[0.15em] text-teal-600 uppercase dark:text-teal-400">
                S HŽ vlakovima
              </span>
              <span className="font-serif text-[13px] leading-none text-teal-600 tabular-nums dark:text-teal-400">
                +{d.trainBoostPct}%
              </span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-teal-100 dark:bg-teal-900/30">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-teal-500"
                style={{
                  width: `${Math.min(((d.trainAvgReachableCells ?? d.avgReachableCells) / totalGridCells) * 100, 100)}%`,
                }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-teal-800/20 dark:bg-teal-300/20"
                style={{ width: `${reachPctNum}%` }}
              />
            </div>
          </div>
        )}

        {/* BAJS boost bar */}
        {d.bajsBoostPct > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-end justify-between">
              <span className="font-sans text-[10px] tracking-[0.15em] text-amber-600 uppercase dark:text-amber-400">
                S BAJS biciklima
              </span>
              <span className="font-serif text-[13px] leading-none text-amber-600 tabular-nums dark:text-amber-400">
                +{d.bajsBoostPct}%
              </span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-amber-100 dark:bg-amber-900/30">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-amber-500"
                style={{
                  width: `${Math.min(((d.bajsAvgReachableCells ?? d.avgReachableCells) / totalGridCells) * 100, 100)}%`,
                }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-amber-800/20 dark:bg-amber-300/20"
                style={{ width: `${reachPctNum}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 border-t border-black/5 pt-6 dark:border-white/5">
        <span className="mb-3 block font-sans text-[10px] tracking-[0.15em] text-slate-500 uppercase dark:text-slate-400">
          Linije
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {d.tramLines.length === 0 &&
          d.busLines.length === 0 &&
          (d.trainLines?.length ?? 0) === 0 ? (
            <span className="text-[12px] text-slate-500 italic">
              Nema linija
            </span>
          ) : (
            <>
              {d.tramLines.map((line) => (
                <span
                  key={`t${line}`}
                  className="inline-flex h-[24px] min-w-[24px] items-center justify-center rounded-md border border-blue-600/20 bg-blue-50 px-1.5 text-[11px] font-semibold text-blue-700 tabular-nums dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-400"
                >
                  {line}
                </span>
              ))}
              {d.busLines.length > 0 && (
                <span className="inline-flex h-[24px] items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600 tabular-nums shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:shadow-none">
                  {d.busLines.length}{" "}
                  {d.busLines.length === 1 ? "bus" : "buseva"}
                </span>
              )}
              {(d.trainLines?.length ?? 0) > 0 && (
                <span className="inline-flex h-[24px] items-center justify-center rounded-md border border-teal-600/20 bg-teal-50 px-2 text-[11px] font-medium text-teal-700 dark:border-teal-400/20 dark:bg-teal-500/10 dark:text-teal-400">
                  HŽ vlak
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <Link
        href={mapLink}
        className="mt-8 flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-50 py-3.5 font-sans text-[10px] font-bold tracking-[0.2em] text-slate-600 uppercase transition-[transform,colors] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-slate-100 active:scale-[0.97] dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
      >
        Istraži područje
        <span aria-hidden="true">&rarr;</span>
      </Link>
    </div>
  )
}
