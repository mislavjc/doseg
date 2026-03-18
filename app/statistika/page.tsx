import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Metadata } from "next"
import Link from "next/link"
import DistrictMap from "@/components/district-map"

export const metadata: Metadata = {
  title: "Statistika - Doseg",
  description:
    "Ranking zagrebačkih gradskih četvrti po dostupnosti javnim prijevozom i BAJS biciklima u 30 minuta.",
}

export const dynamic = "force-dynamic"

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
  districts: DistrictScore[]
}

type DistrictEmblems = Record<string, string>

function getDataDir(): string {
  return process.env.DATA_DIR || join(process.cwd(), "data")
}

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

function pct(cells: number, total: number): string {
  const p = (cells / total) * 100
  if (p < 0.1) return "<0,1"
  if (p < 1) return p.toFixed(1).replace(".", ",")
  return Math.round(p).toString()
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

  // BAJS insights
  const hasBajs = (data.bajsTotalStations ?? 0) > 0
  const bajsTotalStations = data.bajsTotalStations ?? 0
  const cityBajsBoost = hasBajs
    ? (() => {
        const baseW = data.districts.reduce(
          (s, d) => s + d.avgReachableCells * d.sampleCount,
          0
        )
        const bajsW = data.districts.reduce(
          (s, d) => s + (d.bajsAvgReachableCells ?? d.avgReachableCells) * d.sampleCount,
          0
        )
        return Math.round(((bajsW - baseW) / baseW) * 100)
      })()
    : 0
  const bajsRankedByBoost = hasBajs
    ? [...data.districts].sort((a, b) => (b.bajsBoostPct ?? 0) - (a.bajsBoostPct ?? 0))
    : []
  const topBajsBeneficiary = bajsRankedByBoost[0]

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
      <section className="mt-20 sm:mt-32">
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
      <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
              {Math.round((poorPop / totalPop) * 100)}%
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
              {(() => {
                const allTram = new Set(data.districts.flatMap((d) => d.tramLines))
                const allBus = new Set(data.districts.flatMap((d) => d.busLines))
                return allTram.size + allBus.size
              })()}
            </span>
            <span className="text-[14px] text-slate-500 dark:text-slate-400">
              linija
            </span>
          </div>
          <div className="mt-2 text-[12px] leading-snug text-slate-500 dark:text-slate-400">
            {data.districts.reduce((s, d) => s + d.stops, 0).toLocaleString("hr-HR")} stajališta ukupno.
          </div>
        </div>

        {(() => {
          const districtsWithTrains = data.districts.filter((d) => (d.trainLines?.length ?? 0) > 0).length
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
                Rijedak interval (30–60 min) ograničava utjecaj na kratkim putovanjima.
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
          <section className="flex flex-col rounded-3xl bg-slate-100 p-8 dark:bg-white/5">
            <div className="mb-6 flex items-center gap-3 text-slate-800 dark:text-slate-200">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-white/10">
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 16v-4"/>
                  <path d="M12 8h.01"/>
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
          <section className="flex flex-col rounded-3xl bg-rose-50/50 p-8 dark:bg-rose-950/10">
            <div className="mb-6 flex items-center gap-3 text-rose-800 dark:text-rose-200">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-rose-500/20">
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                  <path d="M12 9v4"/>
                  <path d="M12 17h.01"/>
                </svg>
              </span>
              <h2 className="font-serif text-[22px] text-slate-900 dark:text-slate-100">
                Jaz u dostupnosti
              </h2>
            </div>
            <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
              Samo{" "}
              <strong className="font-medium text-slate-900 dark:text-slate-100">
                {Math.round((goodPop / totalPop) * 100)}%
              </strong>{" "}
              Zagrepčana ({goodPop.toLocaleString("hr-HR")} stan.) živi u
              četvrtima s rezultatom ≥50. Istovremeno,{" "}
              <strong className="font-medium text-slate-900 dark:text-slate-100">
                {Math.round((poorPop / totalPop) * 100)}%
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
      </div>

      {/* BAJS Impact section */}
      {hasBajs && (
        <section className="mt-16 sm:mt-20">
          <div className="mb-10 flex flex-col items-center text-center">
            <div className="mb-4 flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-amber-500" />
              <h2 className="font-serif text-3xl tracking-tight text-slate-900 sm:text-4xl dark:text-slate-100">
                Utjecaj BAJS bicikala
              </h2>
            </div>
            <p className="max-w-2xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
              Koliko se dostupnost svake četvrti poboljšava kada se uz javni prijevoz
              koriste i BAJS bicikli. Mjereno u idealnom scenariju gdje je svaka
              stanica operativna s barem jednim biciklom.
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
              <div className="w-full overflow-hidden" style={{ aspectRatio: "960/620" }}>
                <img
                  src="/district-bajs-map.svg"
                  alt="Karta utjecaja BAJS bicikala po četvrtima. Tamniji amber označava veći dobitak u dostupnosti."
                  className="h-full w-full object-contain"
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
              <div className="space-y-3">
                {bajsRankedByBoost.slice(0, 8).map((d, i) => {
                  const maxBoost = bajsRankedByBoost[0]?.bajsBoostPct ?? 1
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
                          <span className="shrink-0 font-serif text-[14px] font-medium text-amber-600 tabular-nums dark:text-amber-400">
                            +{d.bajsBoostPct}%
                          </span>
                        </div>
                        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-amber-100 dark:bg-amber-900/30">
                          <div
                            className="absolute inset-y-0 left-0 rounded-full bg-amber-500"
                            style={{ width: `${(d.bajsBoostPct / maxBoost) * 100}%` }}
                          />
                        </div>
                      </div>
                      <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">
                        {d.bajsStations} st.
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* BAJS equity analysis */}
            <div className="flex flex-col gap-6">
              <div className="flex-1 rounded-3xl bg-amber-50/50 p-8 dark:bg-amber-950/10">
                <div className="mb-6 flex items-center gap-3 text-amber-800 dark:text-amber-200">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-amber-500/20">
                    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="m16 10-4 4-4-4"/>
                    </svg>
                  </span>
                  <h3 className="font-serif text-[22px] text-slate-900 dark:text-slate-100">
                    Smanjuje li BAJS jaz?
                  </h3>
                </div>
                <div className="space-y-4 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                  <p>
                    {(() => {
                      const topHalf = data.districts.slice(0, Math.floor(data.districts.length / 2))
                      const bottomHalf = data.districts.slice(Math.floor(data.districts.length / 2))
                      const topBoost = topHalf.reduce((s, d) => s + (d.bajsBoostPct ?? 0), 0) / topHalf.length
                      const bottomBoost = bottomHalf.reduce((s, d) => s + (d.bajsBoostPct ?? 0), 0) / bottomHalf.length
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
                          . BAJS stanice su koncentrirane u centru — proširenje mreže
                          prema rubnim četvrtima moglo bi smanjiti nejednakost.
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
                      {topBajsBeneficiary ? `+${topBajsBeneficiary.bajsBoostPct}%` : "—"}
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
      <section className="mt-24 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5 sm:p-12 dark:bg-zinc-900/40 dark:ring-white/10">
        <h2 className="mb-8 font-serif text-[24px] text-slate-900 dark:text-slate-100">
          Metodologija izračuna
        </h2>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-5 lg:gap-12">
          <div className="flex flex-col gap-2 border-l-2 border-emerald-500 pl-4">
            <span className="font-sans text-[10px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
              Algoritam
            </span>
            <p className="text-[14px] leading-relaxed text-slate-700 dark:text-slate-300">
              Dijkstrina pretraga nad <strong className="font-medium text-slate-900 dark:text-slate-200">ZET GTFS</strong> i pješačkom mrežom.
            </p>
          </div>
          <div className="flex flex-col gap-2 border-l-2 border-cyan-500 pl-4">
            <span className="font-sans text-[10px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
              Raster
            </span>
            <p className="text-[14px] leading-relaxed text-slate-700 dark:text-slate-300">
              <strong className="font-medium text-slate-900 dark:text-slate-200">{data.gridSpacingM}m</strong> razmak ·{" "}
              <strong className="font-medium text-slate-900 dark:text-slate-200">{data.totalSamplePoints.toLocaleString("hr-HR")}</strong> uzoraka u naseljima.
            </p>
          </div>
          <div className="flex flex-col gap-2 border-l-2 border-blue-500 pl-4">
            <span className="font-sans text-[10px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
              Metrika
            </span>
            <p className="text-[14px] leading-relaxed text-slate-700 dark:text-slate-300">
              Udio dosežnih ćelija od ukupno <strong className="font-medium text-slate-900 dark:text-slate-200">{data.totalGridCells.toLocaleString("hr-HR")}</strong> u gradu.
            </p>
          </div>
          <div className="flex flex-col gap-2 border-l-2 border-purple-500 pl-4">
            <span className="font-sans text-[10px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
              Vozni red
            </span>
            <p className="text-[14px] leading-relaxed text-slate-700 dark:text-slate-300">
              Jutarnji vršni sat (polazak: <strong className="font-medium text-slate-900 dark:text-slate-200">{data.departureTime}</strong>). Bez kašnjenja.
            </p>
          </div>
          {hasBajs && (
            <div className="flex flex-col gap-2 border-l-2 border-amber-500 pl-4">
              <span className="font-sans text-[10px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
                BAJS
              </span>
              <p className="text-[14px] leading-relaxed text-slate-700 dark:text-slate-300">
                Idealni scenarij: <strong className="font-medium text-slate-900 dark:text-slate-200">{bajsTotalStations}</strong> stanica, svaka s 1 biciklom. Brzina <strong className="font-medium text-slate-900 dark:text-slate-200">14 km/h</strong>.
              </p>
            </div>
          )}
        </div>
        <div className="mt-8 border-t border-black/5 pt-6 dark:border-white/5">
          <p className="font-sans text-[11px] font-medium tracking-wide text-slate-500 dark:text-slate-400">
            Zadnji izračun proveden: <span className="text-slate-700 dark:text-slate-300">{generatedLabel}</span>
          </p>
        </div>
      </section>
    </Shell>
  )
}

// --- Components ---

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
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
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
            javnim prijevozom, hodanjem i BAJS bike-sharingom. U jednom jutarnjem
            vršnom satu vidi se vrlo jasan urbani jaz između središta i rubova
            grada — ali i koliko bicikli mogu pomoći.
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
              <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
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
  const strokeDashoffset = circumference - (district.score / 100) * circumference

  return (
    <div className="group relative flex items-center justify-between gap-4 rounded-2xl border border-black/5 p-3 transition-colors hover:bg-slate-50/50 dark:border-white/5 dark:hover:bg-white/2">
      <div className="min-w-0 flex-1 pl-1">
        <div className="font-sans text-[9px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
          {label}
        </div>
        <div className="mt-1 truncate font-serif text-[18px] leading-tight text-slate-900 dark:text-slate-100">
          {district.name}
        </div>
      </div>
      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
        <svg aria-hidden="true" className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 40 40">
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
            className="transition-all duration-1000 ease-out"
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
      className="inline-flex items-center gap-2 text-[13px] font-medium tracking-wide text-slate-600 transition-colors hover:text-slate-900 active:scale-[0.97] dark:text-slate-500 dark:hover:text-slate-300"
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
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <DistrictEmblem pathData={emblemPath} rank={d.rank} color={bandColor} />
          <h4 className="mt-5 font-serif text-[22px] leading-tight tracking-tight text-slate-900 dark:text-slate-100">
            {d.name}
          </h4>
        </div>

        {/* Circular Score */}
        <div className="flex flex-col items-end gap-1.5">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
            <svg aria-hidden="true" className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 64 64">
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
                className="transition-all duration-1000 ease-out"
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
              {d.score === 100 ? "Referentna točka" : `${d.score}% od ${bestDistrict}`}
            </span>
          </div>
        </div>
      </div>

      {/* Stats cluster */}
      <div className="mt-8 flex flex-wrap gap-2">
        <div className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 dark:bg-white/5">
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span className="font-serif text-[13px] font-medium text-slate-700 dark:text-slate-300">
            {d.population ? (d.population / 1000).toFixed(1).replace(".", ",") + "k" : "N/A"}
          </span>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 dark:bg-white/5">
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span className="font-serif text-[13px] font-medium text-slate-700 dark:text-slate-300">
            {d.stops}
          </span>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 dark:bg-white/5">
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span className="font-serif text-[13px] font-medium text-slate-700 dark:text-slate-300">
            ~{Math.round(d.avgHeadwayMin)}m
          </span>
        </div>
        {(d.trainLines?.length ?? 0) > 0 && (
          <div className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-2.5 py-1.5 dark:bg-teal-900/20">
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-teal-600 dark:text-teal-400">
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
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600 dark:text-amber-400">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <span className="font-serif text-[13px] font-medium text-amber-700 dark:text-amber-400">
              {d.bajsStations} BAJS
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
            className="absolute bottom-0 top-0 w-[2px] bg-slate-900 dark:bg-white"
            style={{ left: `${cityReachPctNum}%` }}
            title="Prosjek grada"
          />
        </div>
        <div className="mt-2 flex justify-end">
          <span
            className={`font-sans text-[9px] tracking-widest uppercase ${vsAvg > 0 ? "text-emerald-600 dark:text-emerald-500" : vsAvg < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400"}`}
          >
            {vsAvg > 0 ? `+${vsAvg}% iznad prosjeka` : vsAvg === 0 ? "Drži prosjek grada" : `${Math.abs(vsAvg)}% ispod prosjeka`}
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
                style={{ width: `${Math.min(((d.trainAvgReachableCells ?? d.avgReachableCells) / totalGridCells) * 100, 100)}%` }}
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
                style={{ width: `${Math.min(((d.bajsAvgReachableCells ?? d.avgReachableCells) / totalGridCells) * 100, 100)}%` }}
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
          {d.tramLines.length === 0 && d.busLines.length === 0 && (d.trainLines?.length ?? 0) === 0 ? (
            <span className="text-[12px] italic text-slate-500">
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
                  {d.busLines.length} {d.busLines.length === 1 ? "bus" : "buseva"}
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
        className="mt-8 flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-50 py-3.5 font-sans text-[10px] font-bold tracking-[0.2em] text-slate-600 uppercase transition-colors hover:bg-slate-100 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
      >
        Istraži područje
        <span aria-hidden="true">&rarr;</span>
      </Link>
    </div>
  )
}
