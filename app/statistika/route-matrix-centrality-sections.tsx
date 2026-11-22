import { join } from "node:path"
import { getDataDir } from "@/lib/data-dir"
import { readJsonCached } from "@/lib/page-data"
import type {
  CentralityStats,
  CentralityStop,
  RouteStatsOutput as RouteStats,
} from "@/lib/generated"
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
  if (!stats) {
    return null
  }

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
    <section className="flex flex-col border-t border-hairline py-16 sm:py-24">
      <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <StatModuleTitle>Analiza linija</StatModuleTitle>
          <p className="mt-4 max-w-xl text-body text-ink-2">
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
  if (!travelMatrix) {
    return null
  }
  return (
    <section
      id="matrica"
      className="flex flex-col border-t border-hairline py-16 sm:py-24"
    >
      <TravelMatrixHeader travelMatrix={travelMatrix} />
      <CollapsibleContent
        expandLabel="Prikaži matricu putovanja"
        collapseLabel="Suzi matricu putovanja"
      >
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
        <p className="mt-4 max-w-xl text-body text-ink-2">
          Vrijeme putovanja javnim prijevozom između središta svakog kvarta,
          polazak u {travelMatrix.departureTime}. Boja označava trajanje - od
          plave (brzo) do sive (sporo).
        </p>
      </div>
    </div>
  )
}

function TravelMatrixTable({ travelMatrix }: { travelMatrix: TravelMatrix }) {
  return (
    <div className="flex flex-col">
      <h3 className="mb-8 font-mono text-label font-bold text-zg-blue">
        Vrijeme putovanja u minutama
      </h3>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6" />
        <div className="overflow-x-auto">
          <table
            className="w-max border-collapse font-mono text-label"
            aria-label="Matrica putovanja između kvartova"
          >
            <thead>
              <tr>
                <td className="sticky left-0 z-10 bg-white p-1 text-left font-medium text-ink-muted">
                  <span className="sr-only">Iz / U</span>
                </td>
                {travelMatrix.districts.map((name) => (
                  <th
                    key={name}
                    className="min-w-[44px] p-1 text-center font-medium text-ink-muted"
                    title={name}
                  >
                    {districtAbbrev.get(name) ?? name.slice(0, 4)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {travelMatrix.districts.map((rowName, ri) => (
                <MatrixRow
                  key={rowName}
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
        className="sticky left-0 z-10 bg-white p-1 pr-2 text-left font-medium whitespace-nowrap text-ink-2 group-hover/row:bg-blue-wash"
        scope="row"
      >
        {districtAbbrev.get(rowName) ?? rowName.slice(0, 4)}
      </th>
      {travelMatrix.matrix[ri].map((time, ci) => (
        <MatrixCell
          key={travelMatrix.districts[ci]}
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
  const transfers = travelMatrix.transferMatrix[ri][ci]
  const isDiag = ri === ci
  let bg: string
  let textColor: string
  if (isDiag) {
    bg = "var(--track)"
    textColor = "var(--ink-faint)"
  } else if (time < 0) {
    bg = "var(--hairline-strong)"
    textColor = "var(--ink-faint)"
  } else if (time < 20) {
    bg = "var(--zg-blue)"
    textColor = "var(--ground)"
  } else if (time < 40) {
    bg = "var(--blue-pale)"
    textColor = "var(--navy)"
  } else if (time < 60) {
    bg = "var(--chip-blue)"
    textColor = "var(--zg-blue)"
  } else {
    bg = "var(--ink-ghost)"
    textColor = "var(--ink)"
  }
  const rowName = travelMatrix.districts[ri]
  return (
    <td
      className="min-w-[44px] p-0.5 text-center group-hover/row:brightness-95"
      title={`${rowName} → ${travelMatrix.districts[ci]}: ${isDiag ? "isti kvart" : time < 0 ? "nema rute" : `${time} min, ${transfers} presjedanja`}`}
    >
      <div
        className="flex flex-col items-center justify-center px-1 py-0.5"
        style={{ backgroundColor: bg, color: textColor }}
      >
        <span className="font-mono text-label tabular-nums">
          {isDiag ? "-" : time < 0 ? "×" : time}
        </span>
        {!isDiag && time > 0 && (
          <span className="font-mono text-label opacity-60">{transfers}p</span>
        )}
      </div>
    </td>
  )
}

function TravelMatrixLegend() {
  return (
    <div className="mt-8 flex flex-wrap gap-x-4 gap-y-1 font-mono text-label text-ink-muted">
      <span className="flex items-center gap-1">
        <span
          className="inline-block h-2.5 w-4"
          style={{ backgroundColor: "var(--zg-blue)" }}
        />
        &lt;20 min
      </span>
      <span className="flex items-center gap-1">
        <span
          className="inline-block h-2.5 w-4"
          style={{ backgroundColor: "var(--blue-pale)" }}
        />
        20-40 min
      </span>
      <span className="flex items-center gap-1">
        <span
          className="inline-block h-2.5 w-4"
          style={{ backgroundColor: "var(--chip-blue)" }}
        />
        40-60 min
      </span>
      <span className="flex items-center gap-1">
        <span
          className="inline-block h-2.5 w-4"
          style={{ backgroundColor: "var(--ink-ghost)" }}
        />
        &gt;60 min
      </span>
      <span className="flex items-center gap-1">
        <span
          className="inline-block h-2.5 w-4"
          style={{ backgroundColor: "var(--hairline-strong)" }}
        />
        nema rute
      </span>
      <span className="font-mono text-label italic">p = presjedanja</span>
    </div>
  )
}

function TravelMatrixInsights({ matrix }: { matrix: MatrixInsights }) {
  return (
    <div className="flex flex-col gap-6">
      <h3 className="mb-2 font-mono text-label font-bold text-ink-muted">
        Zanimljivosti
      </h3>
      <div className="flex flex-col gap-6">
        {matrix.matrixWorstCorridor && matrix.matrixWorstCorridor.time > 0 && (
          <div className="border-l-2 border-ink py-1 pl-4">
            <div className="font-mono text-label text-ink-muted">
              Najdulje putovanje
            </div>
            <div className="mt-2 font-sans text-head font-bold text-ink">
              {districtAbbrev.get(matrix.matrixWorstCorridor.from) ??
                matrix.matrixWorstCorridor.from}{" "}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="-mt-0.5 inline-block align-middle text-ink-faint"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>{" "}
              {districtAbbrev.get(matrix.matrixWorstCorridor.to) ??
                matrix.matrixWorstCorridor.to}
            </div>
            <div className="mt-1 text-body text-ink-2">
              {matrix.matrixWorstCorridor.time} minuta
            </div>
          </div>
        )}
        {matrix.matrixBestPair && matrix.matrixBestPair.time < Infinity && (
          <div className="border-l-2 border-zg-blue py-1 pl-4">
            <div className="font-mono text-label text-ink-muted">
              Najbrža veza
            </div>
            <div className="mt-2 font-sans text-head font-bold text-ink">
              {districtAbbrev.get(matrix.matrixBestPair.from) ??
                matrix.matrixBestPair.from}{" "}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="-mt-0.5 inline-block align-middle text-ink-faint"
              >
                <path d="M8 4 2 12l6 8" />
                <path d="M16 4l6 8-6 8" />
                <path d="M2 12h20" />
              </svg>{" "}
              {districtAbbrev.get(matrix.matrixBestPair.to) ??
                matrix.matrixBestPair.to}
            </div>
            <div className="mt-1 text-body text-ink-2">
              {matrix.matrixBestPair.time} minuta
            </div>
          </div>
        )}
        <div className="border-l-2 border-ink py-1 pl-4">
          <div className="font-mono text-label text-ink-muted">
            Prosjek svih putovanja
          </div>
          <div className="mt-2 font-sans text-head font-bold text-ink">
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
    "0" | "1" | "2+",
    { count: number; pairs: Array<{ from: string; to: string; time: number }> }
  > = {
    "0": { count: 0, pairs: [] },
    "1": { count: 0, pairs: [] },
    "2+": { count: 0, pairs: [] },
  }
  let totalPairs = 0
  let totalTransfers = 0

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        continue
      }
      const time = travelMatrix.matrix[i][j]
      if (time <= 0) {
        continue
      }
      const transfers = travelMatrix.transferMatrix[i][j]
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
  const worstPairs = buckets["2+"].pairs
    .toSorted((a, b) => b.time - a.time)
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
        color: "bg-zg-blue",
      },
      {
        label: "1 presjedanje",
        count: buckets["1"].count,
        pct: onePct,
        color: "bg-ink-ghost",
      },
      {
        label: "2+ presjedanja",
        count: buckets["2+"].count,
        pct: twoPlusPct,
        color: "bg-ink-2",
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
      <div className="mb-8 flex h-4 w-full overflow-hidden">
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-8">
        {barData.map((d) => (
          <div
            key={d.label}
            className={`border-l-2 py-1 pl-4 ${d.color.split(" ")[0].replace("bg-", "border-")}`}
          >
            <div className="font-mono text-label text-ink-muted">{d.label}</div>
            <div className="mt-2 font-sans text-head font-bold text-ink tabular-nums">
              {d.count}
            </div>
            <div className="text-body text-ink-2">
              parova kvartova ({d.pct}%)
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 border-t border-hairline pt-6 text-body text-ink-2">
        Prosječno presjedanja po putovanju:{" "}
        <strong className="font-medium text-ink">{avgTransfers}</strong>
      </div>
    </div>
  )
}

function TransferWorstCorridors({
  worstPairs,
}: {
  worstPairs: ReturnType<typeof computeTransferData>["worstPairs"]
}) {
  if (worstPairs.length === 0) {
    return null
  }
  return (
    <div className="mt-12 flex flex-col">
      <h3 className="mb-6 font-mono text-label font-bold text-ink-muted">
        Koridori s 2+ presjedanja
      </h3>
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {worstPairs.map((pair) => (
          <div
            key={`${pair.from}-${pair.to}`}
            className="flex items-baseline justify-between border-b border-hairline pb-2"
          >
            <span className="text-body text-ink">
              {pair.from}{" "}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="inline-block align-middle text-ink-faint"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>{" "}
              {pair.to}
            </span>
            <span className="ml-4 font-sans text-body text-ink tabular-nums">
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
  if (!travelMatrix?.transferMatrix) {
    return null
  }
  const td = computeTransferData(travelMatrix)
  if (td.totalPairs === 0) {
    return null
  }

  return (
    <section
      id="presjedanja"
      className="flex flex-col border-t border-hairline py-16 sm:py-24"
    >
      <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <StatModuleTitle>Ovisnost o presjedanjima</StatModuleTitle>
          <p className="mt-4 max-w-xl text-body text-ink-2">
            Koliko presjedanja zahtijeva tipično putovanje između zagrebačkih
            kvartova? Svako presjedanje dodaje prosječno 8-12 minuta čekanja.
          </p>
        </div>
      </div>

      <TransferStackedBar barData={td.barData} avgTransfers={td.avgTransfers} />
      <TransferWorstCorridors worstPairs={td.worstPairs} />

      <div className="mt-8 text-body text-ink-2">
        <p>
          Od {td.totalPairs} mogućih parova kvartova,{" "}
          <strong className="font-medium text-ink">{td.directPct}%</strong> je
          dostupno izravno bez presjedanja,{" "}
          <strong className="font-medium text-ink">{td.onePct}%</strong>{" "}
          zahtijeva jedno presjedanje, a{" "}
          <strong className="font-medium text-ink">{td.twoPlusPct}%</strong>{" "}
          zahtijeva dva ili više.
          {td.worstPairs.length > 0 && (
            <>
              {" "}
              Najgori koridor (
              <strong className="font-medium text-ink">
                {td.worstPairs[0].from}{" "}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="inline-block align-middle text-ink-faint"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>{" "}
                {td.worstPairs[0].to}
              </strong>
              ) traje{" "}
              <strong className="font-medium text-ink">
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

function CentralityRanking({
  stops,
  title,
  subtitle,
  color,
  scoreDecimals,
}: {
  stops: Array<CentralityStop>
  title: string
  subtitle: string
  color: "rose" | "emerald"
  scoreDecimals: number
}) {
  return (
    <div className="flex flex-col">
      <div className={`border-l-2 border-${color}-500 py-1 pl-4`}>
        <h3 className={`font-sans text-head font-bold text-${color}-600}-400`}>
          {title}
        </h3>
        <p className="mt-2 text-body text-ink-2">{subtitle}</p>
      </div>
      <div className="mt-6 flex flex-col pl-4">
        {stops.slice(0, 10).map((stop, i) => {
          const barW =
            stops[0].score > 0 ? (stop.score / stops[0].score) * 100 : 0
          return (
            <div
              key={stop.key}
              className="flex flex-col border-b border-hairline py-3 last:border-0"
            >
              <div className="flex items-baseline justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span
                    className={`font-mono text-label font-bold text-ink-faint`}
                  >
                    {(i + 1).toString().padStart(2, "0")}
                  </span>
                  <span className="text-body text-ink-2">{stop.name}</span>
                </div>
                <span className="font-sans text-body text-ink tabular-nums">
                  {stop.score.toFixed(scoreDecimals)}
                </span>
              </div>
              <div className="mt-3 ml-7">
                <div className={`h-1.5 w-full overflow-hidden bg-track`}>
                  <div
                    className={`h-full bg-${color}-400}-500`}
                    style={{ width: `${barW}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {stop.routes.slice(0, 6).map((r) => (
                    <span
                      key={r}
                      className="inline-flex h-5 items-center bg-track px-1.5 font-mono text-label text-ink-2"
                    >
                      {r}
                    </span>
                  ))}
                  {stop.routes.length > 6 && (
                    <span className="inline-flex h-5 items-center bg-surface px-1.5 font-mono text-label text-ink-faint">
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

function CentralityNumbers({ data }: { data: CentralityStats }) {
  const { networkDiameter, averagePathLength } = data
  return (
    <div className="my-12 grid grid-cols-2 gap-6 border-t border-b border-hairline py-12 sm:grid-cols-4 sm:gap-12">
      <div className="flex flex-col border-l-2 border-ink pl-4">
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          {networkDiameter.minutes}
        </div>
        <div className="mt-2 text-body text-ink-muted">
          minuta - mrežni dijametar
        </div>
        <div className="mt-1 text-body text-ink-faint">
          {networkDiameter.fromStop} &rarr; {networkDiameter.toStop}
        </div>
      </div>
      <div className="flex flex-col border-l-2 border-zg-blue pl-4">
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          {averagePathLength.minutes}
        </div>
        <div className="mt-2 text-body text-ink-muted">
          min prosječno putovanje
        </div>
        <div className="mt-1 text-body text-ink-faint">
          srednja vrijednost svih najkraćih puteva
        </div>
      </div>
      <div className="flex flex-col border-l-2 border-ink pl-4">
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          {averagePathLength.reachablePct}%
        </div>
        <div className="mt-2 text-body text-ink-muted">parova povezano</div>
        <div className="mt-1 text-body text-ink-faint">
          {averagePathLength.reachablePairs.toLocaleString("hr")} od{" "}
          {averagePathLength.totalPairs.toLocaleString("hr")}
        </div>
      </div>
      <div className="flex flex-col border-l-2 border-hairline-strong pl-4">
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          {data.stopCount.toLocaleString("hr")}
        </div>
        <div className="mt-2 text-body text-ink-muted">
          analiziranih stanica
        </div>
      </div>
    </div>
  )
}

export function CentralitySection() {
  const data = readJsonCached<CentralityStats>(
    join(getDataDir(), "centrality-stats.json")
  )
  if (!data) {
    return null
  }

  const { betweenness, closeness, networkDiameter } = data

  return (
    <section className="flex flex-col border-t border-hairline py-16 sm:py-24">
      <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <StatModuleTitle>Centralnost mreže</StatModuleTitle>
          <p className="mt-4 max-w-xl text-body text-ink-2">
            Analiza grafa otkriva kritične točke mreže - stanice čijim
            zatvaranjem bi se cijelom sustavu dramatično pogoršala povezanost, i
            stanice koje najbolje pokrivaju cijeli grad.
          </p>
        </div>
      </div>

      <CollapsibleContent
        expandLabel="Prikaži centralnost"
        collapseLabel="Suzi centralnost"
      >
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

        <div className="mt-12 text-body text-ink-2">
          <p>
            <strong className="font-medium text-ink">
              Betweenness centralnost
            </strong>{" "}
            otkriva kritične točke mreže.
            {betweenness.length > 0 && (
              <>
                {" "}
                Stajalište{" "}
                <strong className="font-medium text-ink">
                  {betweenness[0].name}
                </strong>{" "}
                je najvažnije čvorište - najveći udio svih najkraćih puteva
                prolazi upravo kroz njega. Ako se ta stanica zatvori, tisuće
                putnika mora tražiti alternativnu rutu.
              </>
            )}
          </p>
          <p className="mt-6">
            <strong className="font-medium text-ink">
              Closeness centralnost
            </strong>{" "}
            pokazuje odakle je najbrže doći svugdje.
            {closeness.length > 0 && (
              <>
                {" "}
                <strong className="font-medium text-ink">
                  {closeness[0].name}
                </strong>{" "}
                ima najpovoljniji prosječni pristup cijeloj mreži.
              </>
            )}{" "}
            Mrežni dijametar od{" "}
            <strong className="font-medium text-ink">
              {networkDiameter.minutes} minuta
            </strong>{" "}
            ({networkDiameter.fromStop} &rarr; {networkDiameter.toStop})
            označava najdulje moguće putovanje unutar sustava.
          </p>
        </div>
      </CollapsibleContent>
    </section>
  )
}
