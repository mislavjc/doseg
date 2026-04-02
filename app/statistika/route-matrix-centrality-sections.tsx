import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { getDataDir } from "@/lib/data-dir"
import type { RouteStatsOutput as RouteStats, RouteStatsRoute as RouteInfo } from "@/lib/generated"
import type { TravelMatrix, computeMatrixInsights } from "./stat-data"
import { districtAbbrev, sortRoutesByName } from "./stat-data"
import RouteAnalysisTables from "./route-analysis-tables"
import { CollapsibleContent } from "./stat-expandable"
import { StatModuleTitle } from "./stat-typography"

type MatrixInsights = ReturnType<typeof computeMatrixInsights>

export function RouteStatsSection({
  routeStats: stats,
}: {
  routeStats: RouteStats | null
}) {
  if (!stats) return null

  const sortedRoutes = sortRoutesByName(
    stats.routes.filter((r) => r.mode !== "RAIL")
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
    <section className="flex flex-col border-t border-slate-100 py-16 sm:py-24 dark:border-white/10">
      <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <StatModuleTitle>Analiza linija</StatModuleTitle>
          <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
            Detaljna analiza performansi svih tramvajskih i autobusnih linija u
            zagrebačkom prometu. Podaci iz statičkog GTFS izračuna, generirano{" "}
            {generatedLabel}.
          </p>
        </div>
      </div>

      <RouteAnalysisTables trams={trams} buses={buses} />
    </section>
  )
}

export function TravelMatrixSection({
  travelMatrix,
  matrix,
}: {
  travelMatrix: TravelMatrix | null
  matrix: MatrixInsights
}) {
  if (!travelMatrix) return null
  return (
    <section
      id="matrica"
      className="flex flex-col border-t border-slate-100 py-16 sm:py-24 dark:border-white/10"
    >
      <TravelMatrixHeader travelMatrix={travelMatrix} />
      <CollapsibleContent expandLabel="Prikaži matricu putovanja" collapseLabel="Suzi matricu putovanja">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_280px] lg:gap-16 xl:grid-cols-[1fr_320px]">
          <div className="overflow-x-auto">
            <TravelMatrixTable travelMatrix={travelMatrix} />
          </div>
          <div>
            <TravelMatrixInsights matrix={matrix} />
          </div>
        </div>
      </CollapsibleContent>
    </section>
  )
}

function TravelMatrixHeader({ travelMatrix }: { travelMatrix: TravelMatrix }) {
  return (
    <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <StatModuleTitle>Matrica putovanja</StatModuleTitle>
        <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
          Vrijeme putovanja javnim prijevozom između središta svake četvrti,
          polazak u {travelMatrix.departureTime ?? "08:00"}. Boja označava
          trajanje - od zelene (brzo) do crvene (sporo).
        </p>
      </div>
    </div>
  )
}

function TravelMatrixTable({ travelMatrix }: { travelMatrix: TravelMatrix }) {
  return (
    <div className="flex flex-col">
      <h3 className="mb-8 font-sans text-[11px] font-bold tracking-widest text-cyan-700 uppercase dark:text-cyan-400">
        Vrijeme putovanja u minutama
      </h3>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-white to-transparent dark:from-zinc-950" />
        <div className="overflow-x-auto">
          <table
          className="w-max border-collapse text-[11px]"
          role="grid"
          aria-label="Matrica putovanja između četvrti"
        >
          <thead>
            <tr>
              <td className="sticky left-0 z-10 bg-white p-1 text-left font-medium text-slate-500 dark:bg-zinc-950 dark:text-slate-400">
                <span className="sr-only">Iz / U</span>
              </td>
              {travelMatrix.districts.map((name, ci) => (
                <th
                  key={ci}
                  className="min-w-[44px] p-1 text-center font-medium text-slate-500 dark:text-slate-400"
                  title={name}
                >
                  {districtAbbrev[name] ?? name.slice(0, 4)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {travelMatrix.districts.map((rowName, ri) => (
              <MatrixRow
                key={ri}
                travelMatrix={travelMatrix}
                rowName={rowName}
                ri={ri}
              />
            ))}
          </tbody>
        </table>
        </div>
      </div>
      <TravelMatrixLegend />
    </div>
  )
}

function MatrixRow({
  travelMatrix,
  rowName,
  ri,
}: {
  travelMatrix: TravelMatrix
  rowName: string
  ri: number
}) {
  return (
    <tr className="group/row">
      <th
        className="sticky left-0 z-10 bg-white p-1 pr-2 text-left font-medium whitespace-nowrap text-slate-700 group-hover/row:bg-cyan-50 dark:bg-zinc-950 dark:text-slate-300 dark:group-hover/row:bg-cyan-950/20"
        scope="row"
      >
        {districtAbbrev[rowName] ?? rowName.slice(0, 4)}
      </th>
      {travelMatrix.matrix[ri].map((time, ci) => (
        <MatrixCell
          key={ci}
          travelMatrix={travelMatrix}
          ri={ri}
          ci={ci}
          time={time}
        />
      ))}
    </tr>
  )
}

function MatrixCell({
  travelMatrix,
  ri,
  ci,
  time,
}: {
  travelMatrix: TravelMatrix
  ri: number
  ci: number
  time: number
}) {
  const transfers = travelMatrix.transferMatrix[ri]?.[ci] ?? 0
  const isDiag = ri === ci
  let bg: string
  let textColor: string
  if (isDiag) {
    bg = "#f1f5f9"
    textColor = "#94a3b8"
  } else if (time < 0) {
    bg = "#e2e8f0"
    textColor = "#94a3b8"
  } else if (time < 20) {
    bg = "#bbf7d0"
    textColor = "#166534"
  } else if (time < 40) {
    bg = "#fef08a"
    textColor = "#854d0e"
  } else if (time < 60) {
    bg = "#fed7aa"
    textColor = "#9a3412"
  } else {
    bg = "#fecaca"
    textColor = "#991b1b"
  }
  const rowName = travelMatrix.districts[ri]
  return (
    <td
      className="min-w-[44px] p-0.5 text-center group-hover/row:brightness-95"
      title={`${rowName} → ${travelMatrix.districts[ci]}: ${isDiag ? "ista četvrt" : time < 0 ? "nema rute" : `${time} min, ${transfers} presjedanja`}`}
    >
      <div
        className="flex flex-col items-center justify-center rounded px-1 py-0.5"
        style={{ backgroundColor: bg, color: textColor }}
      >
        <span className="font-sans text-[13px] leading-tight font-medium tracking-tight tabular-nums">
          {isDiag ? "-" : time < 0 ? "×" : time}
        </span>
        {!isDiag && time > 0 && (
          <span className="text-[9px] leading-tight opacity-60">
            {transfers}p
          </span>
        )}
      </div>
    </td>
  )
}

function TravelMatrixLegend() {
  return (
    <div className="mt-8 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
      <span className="flex items-center gap-1">
        <span
          className="inline-block h-2.5 w-4 rounded"
          style={{ backgroundColor: "#bbf7d0" }}
        />
        &lt;20 min
      </span>
      <span className="flex items-center gap-1">
        <span
          className="inline-block h-2.5 w-4 rounded"
          style={{ backgroundColor: "#fef08a" }}
        />
        20-40 min
      </span>
      <span className="flex items-center gap-1">
        <span
          className="inline-block h-2.5 w-4 rounded"
          style={{ backgroundColor: "#fed7aa" }}
        />
        40-60 min
      </span>
      <span className="flex items-center gap-1">
        <span
          className="inline-block h-2.5 w-4 rounded"
          style={{ backgroundColor: "#fecaca" }}
        />
        &gt;60 min
      </span>
      <span className="flex items-center gap-1">
        <span
          className="inline-block h-2.5 w-4 rounded"
          style={{ backgroundColor: "#e2e8f0" }}
        />
        nema rute
      </span>
      <span className="text-[11px] italic">p = presjedanja</span>
    </div>
  )
}

function TravelMatrixInsights({
  matrix,
}: {
  matrix: MatrixInsights
}) {
  return (
    <div className="flex flex-col gap-6">
      <h3 className="mb-2 font-sans text-[13px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
        Zanimljivosti
      </h3>
      <div className="flex flex-col gap-6">
        {matrix.matrixWorstCorridor && matrix.matrixWorstCorridor.time > 0 && (
          <div className="border-l-2 border-rose-500 py-1 pl-4">
            <div className="text-[13px] font-medium tracking-widest text-slate-500 uppercase dark:text-slate-400">
              Najdulje putovanje
            </div>
            <div className="mt-2 font-sans text-[20px] tracking-tight text-slate-900 dark:text-slate-100">
              {districtAbbrev[matrix.matrixWorstCorridor.from] ??
                matrix.matrixWorstCorridor.from}{" "}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block -mt-0.5 align-middle text-slate-400"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>{" "}
              {districtAbbrev[matrix.matrixWorstCorridor.to] ??
                matrix.matrixWorstCorridor.to}
            </div>
            <div className="mt-1 text-[15px] text-slate-600 dark:text-slate-400">
              {matrix.matrixWorstCorridor.time} minuta
            </div>
          </div>
        )}
        {matrix.matrixBestPair && matrix.matrixBestPair.time < Infinity && (
          <div className="border-l-2 border-emerald-500 py-1 pl-4">
            <div className="text-[13px] font-medium tracking-widest text-slate-500 uppercase dark:text-slate-400">
              Najbrža veza
            </div>
            <div className="mt-2 font-sans text-[20px] tracking-tight text-slate-900 dark:text-slate-100">
              {districtAbbrev[matrix.matrixBestPair.from] ??
                matrix.matrixBestPair.from}{" "}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block -mt-0.5 align-middle text-slate-400"><path d="M8 4 2 12l6 8" /><path d="M16 4l6 8-6 8" /><path d="M2 12h20" /></svg>{" "}
              {districtAbbrev[matrix.matrixBestPair.to] ??
                matrix.matrixBestPair.to}
            </div>
            <div className="mt-1 text-[15px] text-slate-600 dark:text-slate-400">
              {matrix.matrixBestPair.time} minuta
            </div>
          </div>
        )}
        <div className="border-l-2 border-violet-500 py-1 pl-4">
          <div className="text-[13px] font-medium tracking-widest text-slate-500 uppercase dark:text-slate-400">
            Prosjek svih putovanja
          </div>
          <div className="mt-2 font-sans text-[24px] tracking-tight text-slate-900 dark:text-slate-100">
            {matrix.avgTimeAll} min
          </div>
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
  const buckets: Record<
    string,
    { count: number; pairs: { from: string; to: string; time: number }[] }
  > = {
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
        buckets["2+"].pairs.push({
          from: travelMatrix.districts[i],
          to: travelMatrix.districts[j],
          time,
        })
      }
    }
  }

  const directPct =
    totalPairs > 0 ? Math.round((buckets["0"].count / totalPairs) * 100) : 0
  const onePct =
    totalPairs > 0 ? Math.round((buckets["1"].count / totalPairs) * 100) : 0
  const twoPlusPct =
    totalPairs > 0 ? Math.round((buckets["2+"].count / totalPairs) * 100) : 0
  const worstPairs = [...buckets["2+"].pairs]
    .sort((a, b) => b.time - a.time)
    .slice(0, 6)

  return {
    totalPairs,
    avgTransfers:
      totalPairs > 0
        ? (totalTransfers / totalPairs).toFixed(1).replace(".", ",")
        : "0",
    directPct,
    onePct,
    twoPlusPct,
    worstPairs,
    barData: [
      {
        label: "Izravno",
        count: buckets["0"].count,
        pct: directPct,
        color: "bg-emerald-400 dark:bg-emerald-500",
      },
      {
        label: "1 presjedanje",
        count: buckets["1"].count,
        pct: onePct,
        color: "bg-amber-400 dark:bg-amber-500",
      },
      {
        label: "2+ presjedanja",
        count: buckets["2+"].count,
        pct: twoPlusPct,
        color: "bg-red-400 dark:bg-red-500",
      },
    ],
  }
}

function TransferStackedBar({
  barData,
  avgTransfers,
}: {
  barData: ReturnType<typeof computeTransferData>["barData"]
  avgTransfers: string
}) {
  return (
    <div className="flex flex-col">
      <div className="mb-8 flex h-4 w-full overflow-hidden rounded-full">
        {barData.map(
          (d) =>
            d.pct > 0 && (
              <div
                key={d.label}
                className={`${d.color} flex items-center justify-center transition-all`}
                style={{ width: `${d.pct}%` }}
              />
            )
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:gap-8 sm:grid-cols-3">
        {barData.map((d) => (
          <div
            key={d.label}
            className={`border-l-2 py-1 pl-4 ${d.color.split(" ")[0].replace("bg-", "border-")}`}
          >
            <div className="text-[13px] font-medium tracking-widest text-slate-500 uppercase dark:text-slate-400">
              {d.label}
            </div>
            <div className="mt-2 font-sans text-[24px] font-medium tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
              {d.count}
            </div>
            <div className="text-[15px] text-slate-600 dark:text-slate-400">
              parova četvrti ({d.pct}%)
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 border-t border-slate-100 pt-6 text-[15px] leading-relaxed text-slate-600 dark:border-white/10 dark:text-slate-400">
        Prosječno presjedanja po putovanju:{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">
          {avgTransfers}
        </strong>
      </div>
    </div>
  )
}

function TransferWorstCorridors({
  worstPairs,
}: {
  worstPairs: ReturnType<typeof computeTransferData>["worstPairs"]
}) {
  if (worstPairs.length === 0) return null
  return (
    <div className="mt-12 flex flex-col">
      <h3 className="mb-6 font-sans text-[13px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
        Koridori s 2+ presjedanja
      </h3>
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {worstPairs.map((pair, i) => (
          <div
            key={i}
            className="flex items-baseline justify-between border-b border-slate-100 pb-2 dark:border-white/5"
          >
            <span className="text-[15px] text-slate-800">
              {pair.from}{" "}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block align-middle text-slate-400"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>{" "}
              {pair.to}
            </span>
            <span className="ml-4 font-sans text-[15px] font-medium tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
              {pair.time} min
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TransferDependencySection({
  travelMatrix,
}: {
  travelMatrix: TravelMatrix | null
}) {
  if (!travelMatrix?.transferMatrix) return null
  const td = computeTransferData(travelMatrix)
  if (td.totalPairs === 0) return null

  return (
    <section
      id="presjedanja"
      className="flex flex-col border-t border-slate-100 py-16 sm:py-24 dark:border-white/10"
    >
      <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <StatModuleTitle>Ovisnost o presjedanjima</StatModuleTitle>
          <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-600 dark:text-slate-400">
            Koliko presjedanja zahtijeva tipično putovanje između zagrebačkih
            četvrti? Svako presjedanje dodaje prosječno 8-12 minuta čekanja.
          </p>
        </div>
      </div>

      <TransferStackedBar barData={td.barData} avgTransfers={td.avgTransfers} />
        <TransferWorstCorridors worstPairs={td.worstPairs} />

        <div className="mt-8 text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
          <p>
            Od {td.totalPairs} mogućih parova četvrti,{" "}
            <strong className="font-medium text-slate-900 dark:text-slate-100">
              {td.directPct}%
            </strong>{" "}
            je dostupno izravno bez presjedanja,{" "}
            <strong className="font-medium text-slate-900 dark:text-slate-100">
              {td.onePct}%
            </strong>{" "}
            zahtijeva jedno presjedanje, a{" "}
            <strong className="font-medium text-slate-900 dark:text-slate-100">
              {td.twoPlusPct}%
            </strong>{" "}
            zahtijeva dva ili više.
            {td.worstPairs.length > 0 && (
              <>
                {" "}
                Najgori koridor (
                <strong className="font-medium text-slate-900 dark:text-slate-100">
                  {td.worstPairs[0].from}{" "}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block align-middle text-slate-400"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>{" "}
                  {td.worstPairs[0].to}
                </strong>
                ) traje{" "}
                <strong className="font-medium text-slate-900 dark:text-slate-100">
                  {td.worstPairs[0].time} minuta
                </strong>{" "}
                - svako presjedanje dodaje nepredvidivo čekanje.
              </>
            )}
          </p>
        </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Centrality Analysis (1.16-1.19)
// ---------------------------------------------------------------------------

function loadCentralityStats():
  | import("@/lib/generated").CentralityStats
  | null {
  const statsPath = join(getDataDir(), "centrality-stats.json")
  if (!existsSync(statsPath)) return null
  try {
    return JSON.parse(readFileSync(statsPath, "utf-8"))
  } catch {
    return null
  }
}

function CentralityRanking({
  stops,
  title,
  subtitle,
  color,
  scoreDecimals,
}: {
  stops: import("@/lib/generated").CentralityStop[]
  title: string
  subtitle: string
  color: "rose" | "emerald"
  scoreDecimals: number
}) {
  return (
    <div className="flex flex-col">
      <div className={`border-l-2 border-${color}-500 py-1 pl-4`}>
        <h3
          className={`font-sans text-[20px] tracking-tight text-${color}-600 dark:text-${color}-400`}
        >
          {title}
        </h3>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
          {subtitle}
        </p>
      </div>
      <div className="mt-6 flex flex-col pl-4">
        {stops.slice(0, 10).map((stop, i) => {
          const barW =
            stops[0].score > 0 ? (stop.score / stops[0].score) * 100 : 0
          return (
            <div
              key={stop.key}
              className="flex flex-col border-b border-slate-100 py-3 last:border-0 dark:border-white/5"
            >
              <div className="flex items-baseline justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span
                    className={`font-mono text-[11px] font-bold text-slate-400 dark:text-slate-500`}
                  >
                    {(i + 1).toString().padStart(2, "0")}
                  </span>
                  <span className="text-[15px] font-medium text-slate-700 dark:text-slate-300">
                    {stop.name}
                  </span>
                </div>
                <span className="font-sans text-[15px] tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
                  {stop.score.toFixed(scoreDecimals)}
                </span>
              </div>
              <div className="mt-3 ml-7">
                <div
                  className={`h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800`}
                >
                  <div
                    className={`h-full bg-${color}-400 dark:bg-${color}-500`}
                    style={{ width: `${barW}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {stop.routes.slice(0, 6).map((r) => (
                    <span
                      key={r}
                      className="inline-flex h-5 items-center rounded-sm bg-slate-100 px-1.5 font-mono text-[11px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300"
                    >
                      {r}
                    </span>
                  ))}
                  {stop.routes.length > 6 && (
                    <span className="inline-flex h-5 items-center rounded-sm bg-slate-50 px-1.5 font-mono text-[11px] font-medium text-slate-400 dark:bg-white/5 dark:text-slate-500">
                      +{stop.routes.length - 6}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CentralityNumbers({
  data,
}: {
  data: import("@/lib/generated").CentralityStats
}) {
  const { networkDiameter, averagePathLength } = data
  return (
    <div className="my-12 grid grid-cols-2 gap-6 sm:gap-12 border-t border-b border-slate-100 py-12 sm:grid-cols-4 dark:border-white/10">
      <div className="flex flex-col border-l-2 border-rose-500 pl-4">
        <div className="font-sans text-[48px] leading-none font-medium tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
          {networkDiameter.minutes}
        </div>
        <div className="mt-2 text-[15px] leading-snug text-slate-500 dark:text-slate-400">
          minuta - mrežni dijametar
        </div>
        <div className="mt-1 text-[13px] text-slate-400">
          {networkDiameter.fromStop} &rarr; {networkDiameter.toStop}
        </div>
      </div>
      <div className="flex flex-col border-l-2 border-emerald-500 pl-4">
        <div className="font-sans text-[48px] leading-none font-medium tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
          {averagePathLength.minutes}
        </div>
        <div className="mt-2 text-[15px] leading-snug text-slate-500 dark:text-slate-400">
          min prosječno putovanje
        </div>
        <div className="mt-1 text-[13px] text-slate-400">
          srednja vrijednost svih najkraćih puteva
        </div>
      </div>
      <div className="flex flex-col border-l-2 border-violet-500 pl-4">
        <div className="font-sans text-[48px] leading-none font-medium tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
          {averagePathLength.reachablePct}%
        </div>
        <div className="mt-2 text-[15px] leading-snug text-slate-500 dark:text-slate-400">
          parova povezano
        </div>
        <div className="mt-1 text-[13px] text-slate-400">
          {averagePathLength.reachablePairs.toLocaleString("hr")} od{" "}
          {averagePathLength.totalPairs.toLocaleString("hr")}
        </div>
      </div>
      <div className="flex flex-col border-l-2 border-slate-300 pl-4 dark:border-slate-700">
        <div className="font-sans text-[48px] leading-none font-medium tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
          {data.stopCount.toLocaleString("hr")}
        </div>
        <div className="mt-2 text-[15px] leading-snug text-slate-500 dark:text-slate-400">
          analiziranih stanica
        </div>
      </div>
    </div>
  )
}

export function CentralitySection() {
  const data = loadCentralityStats()
  if (!data) return null

  const { betweenness, closeness, networkDiameter } = data

  return (
    <section className="flex flex-col border-t border-slate-100 py-16 sm:py-24 dark:border-white/10">
      <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <StatModuleTitle>Centralnost mreže</StatModuleTitle>
          <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-600 dark:text-slate-400">
            Analiza grafa otkriva kritične točke mreže - stanice čijim
            zatvaranjem bi se cijelom sustavu dramatično pogoršala povezanost, i
            stanice koje najbolje pokrivaju cijeli grad.
          </p>
        </div>
      </div>

      <CollapsibleContent expandLabel="Prikaži centralnost" collapseLabel="Suzi centralnost">
        <CentralityNumbers data={data} />

        <div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
          <CentralityRanking
            stops={betweenness}
            title="Betweenness centralnost"
            subtitle="Kritične točke - stanice kroz koje prolazi najviše najkraćih puteva"
            color="rose"
            scoreDecimals={4}
          />
          <CentralityRanking
            stops={closeness}
            title="Closeness centralnost"
            subtitle="Najbolje povezane stanice - najbrži prosječni pristup cijeloj mreži"
            color="emerald"
            scoreDecimals={2}
          />
        </div>

        <div className="mt-12 text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
          <p>
            <strong className="font-medium text-slate-900 dark:text-slate-100">
              Betweenness centralnost
            </strong>{" "}
            otkriva kritične točke mreže.
            {betweenness[0] && (
              <>
                {" "}
                Stajalište{" "}
                <strong className="font-medium text-slate-900 dark:text-slate-100">
                  {betweenness[0].name}
                </strong>{" "}
                je najvažnije čvorište - najveći udio svih najkraćih puteva
                prolazi upravo kroz njega. Ako se ta stanica zatvori, tisuće
                putnika mora tražiti alternativnu rutu.
              </>
            )}
          </p>
          <p className="mt-6">
            <strong className="font-medium text-slate-900 dark:text-slate-100">
              Closeness centralnost
            </strong>{" "}
            pokazuje odakle je najbrže doći svugdje.
            {closeness[0] && (
              <>
                {" "}
                <strong className="font-medium text-slate-900 dark:text-slate-100">
                  {closeness[0].name}
                </strong>{" "}
                ima najpovoljniji prosječni pristup cijeloj mreži.
              </>
            )}{" "}
            Mrežni dijametar od{" "}
            <strong className="font-medium text-slate-900 dark:text-slate-100">
              {networkDiameter.minutes} minuta
            </strong>{" "}
            ({networkDiameter.fromStop} &rarr; {networkDiameter.toStop}) označava
            najdulje moguće putovanje unutar sustava.
          </p>
        </div>
      </CollapsibleContent>
    </section>
  )
}
