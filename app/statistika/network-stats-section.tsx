import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { getDataDir } from "@/lib/data-dir"
import { scaleLinear } from "@visx/scale"
import type {
  NetworkStatsOutput,
  NetworkRoute,
  Fleet,
  WeekendService,
  DirectionalAsymmetryEntry,
  RouteStatsOutput,
  ServiceSpan,
  PulseHub,
} from "@/lib/generated"
import {
  StatInsight,
  StatInsightBody,
  StatModuleLead,
  StatModuleTitle,
} from "./stat-typography"

function loadNetworkStats(): NetworkStatsOutput | null {
  const statsPath = join(getDataDir(), "network-stats.json")
  if (!existsSync(statsPath)) return null
  try {
    return JSON.parse(readFileSync(statsPath, "utf-8"))
  } catch {
    return null
  }
}

function loadRouteStatsForInsights(): RouteStatsOutput | null {
  const statsPath = join(getDataDir(), "route-stats.json")
  if (!existsSync(statsPath)) return null
  try {
    return JSON.parse(readFileSync(statsPath, "utf-8"))
  } catch {
    return null
  }
}

function fmtDots(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")
}

function fmtDec(n: number, decimals = 2): string {
  return n.toFixed(decimals).replace(".", ",")
}

function tramSort(a: string, b: string): number {
  return parseInt(a, 10) - parseInt(b, 10)
}

function Insight({ children }: { children: React.ReactNode }) {
  return (
    <StatInsight>
      <StatInsightBody>{children}</StatInsightBody>
    </StatInsight>
  )
}

// ---------------------------------------------------------------------------
// Compute insights from combined data
// ---------------------------------------------------------------------------
function computeHeatmapInsights(
  trams: NetworkRoute[],
  dayTrams: NetworkRoute[],
  nightTrams: NetworkRoute[]
) {
  const hourlySystem = Array(24).fill(0)
  for (const r of trams) {
    r.hourlyDepartures.forEach((d, h) => {
      hourlySystem[h] += d
    })
  }
  const peakHour = hourlySystem.indexOf(Math.max(...hourlySystem))
  const peakDeps = hourlySystem[peakHour]
  const busiestTram = [...dayTrams].sort(
    (a, b) =>
      b.hourlyDepartures.reduce((s, v) => s + v, 0) -
      a.hourlyDepartures.reduce((s, v) => s + v, 0)
  )[0]
  const busiestPeakDep = busiestTram?.hourlyDepartures[peakHour] ?? 0
  const busiestInterval =
    busiestPeakDep > 0 ? Math.round((60 / busiestPeakDep) * 10) / 10 : 0
  const dayTotal = dayTrams.reduce(
    (s, r) => s + r.hourlyDepartures.reduce((a, b) => a + b, 0),
    0
  )
  const nightTotal = nightTrams.reduce(
    (s, r) => s + r.hourlyDepartures.reduce((a, b) => a + b, 0),
    0
  )
  return {
    peakHour,
    peakDeps,
    busiestTram,
    busiestPeakDep,
    busiestInterval,
    dayTotal,
    nightTotal,
  }
}

function computeQualityInsights(
  dayTrams: NetworkRoute[],
  routeStats: RouteStatsOutput | null
) {
  const withTort = dayTrams.filter(
    (r) => r.tortuosity !== null && r.tortuosity < 4
  )
  const mostDirect =
    withTort.length > 0
      ? [...withTort].sort(
          (a, b) => (a.tortuosity ?? 99) - (b.tortuosity ?? 99)
        )[0]
      : null
  const mostWinding =
    withTort.length > 0
      ? [...withTort].sort(
          (a, b) => (b.tortuosity ?? 0) - (a.tortuosity ?? 0)
        )[0]
      : null
  const mostRegular =
    dayTrams
      .filter((r) => r.headwayCv !== null && r.headwayCv > 0)
      .sort((a, b) => (a.headwayCv ?? 99) - (b.headwayCv ?? 99))[0] ?? null

  const speedData: { name: string; spacing: number; speed: number }[] = []
  if (routeStats) {
    for (const t of dayTrams) {
      const rm = routeStats.routes.find(
        (r) => r.name === t.name && r.mode === "TRAM"
      )
      if (rm && t.stopSpacing) {
        speedData.push({
          name: t.name,
          spacing: t.stopSpacing.avgM,
          speed: rm.commercialSpeedKmh,
        })
      }
    }
  }
  const slowest =
    speedData.length > 0
      ? [...speedData].sort((a, b) => a.speed - b.speed)[0]
      : null
  const fastest =
    speedData.length > 0
      ? [...speedData].sort((a, b) => b.speed - a.speed)[0]
      : null
  return { mostDirect, mostWinding, mostRegular, slowest, fastest, speedData }
}

function computeFleetInsights(fleet: Fleet | null) {
  const interlinePct = fleet
    ? Math.round(
        (fleet.interlinedBlocks / Math.max(fleet.totalBlocks, 1)) * 100
      )
    : 0
  const busInterlinePct =
    fleet && fleet.busBlocks > 0
      ? Math.round((fleet.interlinedBlocks / fleet.busBlocks) * 100)
      : 0
  const biggestBlock = fleet
    ? ([...fleet.interlinedExamples].sort(
        (a, b) => b.routes.length - a.routes.length
      )[0] ?? null)
    : null
  return { interlinePct, busInterlinePct, biggestBlock }
}

function computeInsights(
  data: NetworkStatsOutput,
  routeStats: RouteStatsOutput | null
) {
  const trams = data.routes.filter((r) => r.mode === "TRAM")
  const dayTrams = trams.filter(
    (r) => !["31", "32", "33", "34"].includes(r.name)
  )
  const nightTrams = trams.filter((r) =>
    ["31", "32", "33", "34"].includes(r.name)
  )
  return {
    ...computeHeatmapInsights(trams, dayTrams, nightTrams),
    ...computeQualityInsights(dayTrams, routeStats),
    ...computeFleetInsights(data.fleet),
  }
}

// ---------------------------------------------------------------------------
// 1. Network Overview
// ---------------------------------------------------------------------------
function NetworkOverviewCards({ data }: { data: NetworkStatsOutput }) {
  const { vehicleKm, deadEndStops, fleet } = data
  return (
    <div className="grid grid-cols-1 gap-10 rounded-[12px] bg-[#f9f9f9] p-6 sm:grid-cols-3 sm:gap-10 sm:p-8 dark:bg-[#1a1a1a]">
      <div className="flex flex-col">
        <div className="font-sans text-5xl leading-none font-semibold tracking-tighter text-slate-900 tabular-nums sm:text-[40px] dark:text-slate-100">
          {fmtDots(vehicleKm.total)}
        </div>
        <div className="mt-3 text-[15px] leading-snug text-slate-600 sm:mt-2 sm:text-[14px] dark:text-slate-400">
          vozilo-km/dan
        </div>
        <div className="mt-2 text-[14px] leading-snug text-slate-500 sm:mt-1 sm:text-[13px] dark:text-slate-400">
          Tramvaj {fmtDots(vehicleKm.tram)} · Autobus {fmtDots(vehicleKm.bus)}
        </div>
      </div>
      <div className="flex flex-col">
        <div className="font-sans text-5xl leading-none font-semibold tracking-tighter text-slate-900 tabular-nums sm:text-[40px] dark:text-slate-100">
          {fleet ? fmtDots(fleet.totalBlocks) : "-"}
        </div>
        <div className="mt-3 text-[15px] leading-snug text-slate-600 sm:mt-2 sm:text-[14px] dark:text-slate-400">
          vozila
        </div>
        {fleet && (
          <div className="mt-2 text-[14px] leading-snug text-slate-500 sm:mt-1 sm:text-[13px] dark:text-slate-400">
            Tramvaj {fleet.tramBlocks} · Autobus {fleet.busBlocks}
          </div>
        )}
      </div>
      <div className="flex flex-col">
        <div className="font-sans text-5xl leading-none font-semibold tracking-tighter text-slate-900 tabular-nums sm:text-[40px] dark:text-slate-100">
          {fmtDots(deadEndStops.total)}
        </div>
        <div className="mt-3 text-[15px] leading-snug text-slate-600 sm:mt-2 sm:text-[14px] dark:text-slate-400">
          slijepih stanica
        </div>
        <div className="mt-2 text-[14px] leading-snug text-slate-500 sm:mt-1 sm:text-[13px] dark:text-slate-400">
          Autobus {fmtDots(deadEndStops.byMode["BUS"] ?? 0)} · Tramvaj{" "}
          {deadEndStops.byMode["TRAM"] ?? 0} · Vlak{" "}
          {deadEndStops.byMode["RAIL"] ?? 0}
        </div>
      </div>
    </div>
  )
}

function NetworkOverview({ data }: { data: NetworkStatsOutput }) {
  const { vehicleKm, deadEndStops } = data
  const tramPct = Math.round(
    (vehicleKm.tram / Math.max(vehicleKm.total, 1)) * 100
  )
  const deadEndBusPct = Math.round(
    ((deadEndStops.byMode["BUS"] ?? 0) / Math.max(deadEndStops.total, 1)) * 100
  )

  return (
    <div className="flex flex-col">
      <div className="mb-10 flex flex-col gap-4 sm:mb-12 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <StatModuleTitle>Mrežna statistika</StatModuleTitle>
          <StatModuleLead>
            Dnevni pregled ZET mreže: prijeđeni kilometri, potrebna vozila i
            slijepe stanice.
          </StatModuleLead>
        </div>
      </div>

      <NetworkOverviewCards data={data} />
      <Insight>
        Tramvaji čine samo {tramPct}% prijeđenih kilometara, ali su srce mreže -
        četvrti s tramvajskim linijama postižu u prosjeku{" "}
        <strong>18 bodova više</strong> od onih bez. Od slijepih stanica,{" "}
        {deadEndBusPct}% su autobusne - poremećaj na jednoj liniji ostavlja te
        putnike bez alternative.
      </Insight>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 2. Hourly Frequency Heatmap
// ---------------------------------------------------------------------------
const HEATMAP_CELL_W = 28
const HEATMAP_CELL_H = 28
const HEATMAP_GAP = 2
const HEATMAP_LABEL_W = 48
const HEATMAP_BOTTOM_LABEL_H = 24
const HEATMAP_HOUR_LABELS = [0, 3, 6, 9, 12, 15, 18, 21]

function HeatmapSvg({
  tramRoutes,
  colorScale,
  maxDep,
}: {
  tramRoutes: NetworkRoute[]
  colorScale: (v: number) => string
  maxDep: number
}) {
  const rows = tramRoutes.length
  const svgW = HEATMAP_LABEL_W + 24 * (HEATMAP_CELL_W + HEATMAP_GAP)
  const svgH = rows * (HEATMAP_CELL_H + HEATMAP_GAP) + HEATMAP_BOTTOM_LABEL_H

  return (
    <div className="-mx-1 w-full overflow-x-auto overscroll-x-contain px-1 [-webkit-overflow-scrolling:touch] sm:mx-0 sm:px-0">
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="mx-auto block w-full max-w-none shrink-0 max-sm:min-w-[768px] sm:w-auto sm:max-w-full"
        role="img"
        aria-label="Heatmap satnih polazaka tramvaja"
      >
        {tramRoutes.map((r, ri) => (
          <text
            key={`lbl-${r.name}`}
            x={HEATMAP_LABEL_W - 8}
            y={ri * (HEATMAP_CELL_H + HEATMAP_GAP) + HEATMAP_CELL_H / 2 + 1}
            textAnchor="end"
            dominantBaseline="central"
            className="fill-slate-600 font-sans text-[11px] dark:fill-slate-400"
          >
            {r.name}
          </text>
        ))}
        <HeatmapCells
          tramRoutes={tramRoutes}
          colorScale={colorScale}
          maxDep={maxDep}
        />
        {HEATMAP_HOUR_LABELS.map((h) => (
          <text
            key={`hr-${h}`}
            x={
              HEATMAP_LABEL_W +
              h * (HEATMAP_CELL_W + HEATMAP_GAP) +
              HEATMAP_CELL_W / 2
            }
            y={rows * (HEATMAP_CELL_H + HEATMAP_GAP) + 16}
            textAnchor="middle"
            className="fill-slate-500 font-sans text-[10px] dark:fill-slate-400"
          >
            {h}h
          </text>
        ))}
      </svg>
    </div>
  )
}

function HeatmapCells({
  tramRoutes,
  colorScale,
  maxDep,
}: {
  tramRoutes: NetworkRoute[]
  colorScale: (v: number) => string
  maxDep: number
}) {
  return (
    <>
      {tramRoutes.map((r, ri) =>
        r.hourlyDepartures.map((dep, ci) => (
          <rect
            key={`cell-${r.name}-${ci}`}
            x={HEATMAP_LABEL_W + ci * (HEATMAP_CELL_W + HEATMAP_GAP)}
            y={ri * (HEATMAP_CELL_H + HEATMAP_GAP)}
            width={HEATMAP_CELL_W}
            height={HEATMAP_CELL_H}
            rx={4}
            fill={dep === 0 ? "transparent" : colorScale(dep)}
            stroke={dep === 0 ? "currentColor" : "none"}
            strokeWidth={dep === 0 ? 0.5 : 0}
            className={dep === 0 ? "text-slate-200 dark:text-slate-700" : ""}
          />
        ))
      )}
      {tramRoutes.map((r, ri) =>
        r.hourlyDepartures.map((dep, ci) =>
          dep > 0 ? (
            <text
              key={`txt-${r.name}-${ci}`}
              x={
                HEATMAP_LABEL_W +
                ci * (HEATMAP_CELL_W + HEATMAP_GAP) +
                HEATMAP_CELL_W / 2
              }
              y={ri * (HEATMAP_CELL_H + HEATMAP_GAP) + HEATMAP_CELL_H / 2 + 1}
              textAnchor="middle"
              dominantBaseline="central"
              className={
                dep < maxDep * 0.42
                  ? "fill-slate-700 font-sans text-[10px] font-medium dark:fill-slate-200"
                  : "fill-white/90 font-sans text-[10px] font-medium"
              }
            >
              {dep}
            </text>
          ) : null
        )
      )}
    </>
  )
}

function HeatmapInsight({
  insights,
}: {
  insights: ReturnType<typeof computeInsights>
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-slate-50/80 p-6 sm:p-7 dark:border-white/10 dark:bg-white/4">
      <h3 className="mb-2 font-sans text-[12px] font-semibold tracking-widest text-slate-500 uppercase sm:text-[13px] dark:text-slate-400">
        Satni polasci tramvaja
      </h3>
      <p className="text-[16px] leading-relaxed text-slate-600 sm:text-[15px] dark:text-slate-300">
        Broj polazaka po satu za svaku tramvajsku liniju. Svjetlija boja znači
        više polazaka. Vršni sat je <strong>{insights.peakHour}:00</strong> s{" "}
        {insights.peakDeps} tramvajskih polazaka.
        {insights.busiestTram && (
          <>
            {" "}
            Najfrekventnija linija {insights.busiestTram.name} ima{" "}
            {insights.busiestPeakDep} polazaka u vršnom satu - tramvaj svakih{" "}
            <strong>{fmtDec(insights.busiestInterval, 1)} minuta</strong>.
          </>
        )}{" "}
        Noćna mreža (linije 31-34) pruža samo {insights.nightTotal} polazaka -
        tek{" "}
        {fmtDec(
          (insights.nightTotal / Math.max(insights.dayTotal, 1)) * 100,
          1
        )}
        % dnevnog kapaciteta.
      </p>
    </div>
  )
}

function HourlyHeatmap({
  routes,
  insights,
}: {
  routes: NetworkRoute[]
  insights: ReturnType<typeof computeInsights>
}) {
  const tramRoutes = routes
    .filter((r) => r.mode === "TRAM")
    .sort((a, b) => {
      const totalA = a.hourlyDepartures.reduce((s, v) => s + v, 0)
      const totalB = b.hourlyDepartures.reduce((s, v) => s + v, 0)
      return totalB - totalA
    })

  if (tramRoutes.length === 0) return null

  const allDeps = tramRoutes.flatMap((r) => r.hourlyDepartures)
  const maxDep = Math.max(...allDeps, 1)
  const colorScale = scaleLinear<string>({
    domain: [0, maxDep * 0.25, maxDep * 0.5, maxDep * 0.75, maxDep],
    range: ["transparent", "#e2e8f0", "#94a3b8", "#475569", "#0f172a"],
  })

  return (
    <div className="flex flex-col gap-8">
      <HeatmapInsight insights={insights} />
      <div className="overflow-x-auto rounded-2xl border border-slate-200/60 bg-slate-100 p-4 sm:rounded-3xl sm:p-6 dark:border-white/10 dark:bg-zinc-800/60">
        <p className="mb-3 text-center text-[12px] leading-snug text-slate-500 sm:hidden dark:text-slate-400">
          Povucite vodoravno za sve sate i linije.
        </p>
        <HeatmapSvg
          tramRoutes={tramRoutes}
          colorScale={colorScale}
          maxDep={maxDep}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 3. Route Quality Cards
// ---------------------------------------------------------------------------
function cvColor(cv: number | null): string {
  if (cv === null) return "text-slate-400 dark:text-slate-500"
  if (cv < 0.2) return "text-slate-700 dark:text-slate-300"
  if (cv <= 0.4) return "text-slate-500 dark:text-slate-400"
  return "text-slate-900 dark:text-slate-200"
}

function cvLabel(cv: number | null): string {
  if (cv === null) return "-"
  if (cv < 0.15) return "odlično"
  if (cv < 0.25) return "dobro"
  if (cv <= 0.4) return "umjereno"
  return "kaotičan"
}

function RouteQualityCardStatRow({
  label,
  valueClassName,
  children,
}: {
  label: string
  valueClassName: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 border-b border-slate-100 py-2 last:border-0 sm:gap-2 sm:py-1.5 dark:border-white/5">
      <span className="min-w-0 shrink text-[11px] font-medium tracking-widest text-slate-500 uppercase sm:truncate sm:text-[10px] dark:text-slate-400">
        {label}
      </span>
      <span
        className={`shrink-0 font-sans text-[15px] leading-none tracking-tight tabular-nums sm:text-[14px] ${valueClassName}`}
      >
        {children}
      </span>
    </div>
  )
}

function RouteQualityCardStats({ r }: { r: NetworkRoute }) {
  return (
    <div className="mt-1 min-w-0">
      <RouteQualityCardStatRow
        label="Tortuoznost"
        valueClassName="text-slate-900 dark:text-slate-100"
      >
        {r.tortuosity !== null ? fmtDec(r.tortuosity) : "-"}
      </RouteQualityCardStatRow>
      <RouteQualityCardStatRow
        label="Razmak"
        valueClassName="text-slate-900 dark:text-slate-100"
      >
        {r.stopSpacing ? `${Math.round(r.stopSpacing.avgM)} m` : "-"}
      </RouteQualityCardStatRow>
      <RouteQualityCardStatRow
        label="CV takta"
        valueClassName={cvColor(r.headwayCv) + " font-medium"}
      >
        {r.headwayCv !== null ? fmtDec(r.headwayCv) : "-"}
      </RouteQualityCardStatRow>
      <RouteQualityCardStatRow
        label="Vrh:baza"
        valueClassName="text-slate-900 dark:text-slate-100"
      >
        {r.peakToBaseRatio !== null ? fmtDec(r.peakToBaseRatio) : "-"}
      </RouteQualityCardStatRow>
    </div>
  )
}

function RouteQualityCard({ r }: { r: NetworkRoute }) {
  const totalDeps = r.hourlyDepartures.reduce((s, v) => s + v, 0)
  const isNight = totalDeps < 30
  return (
    <div className="isolate flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[12px] bg-[#f9f9f9] p-5 dark:bg-[#1a1a1a]">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <span className="inline-flex h-8 w-11 shrink-0 items-center justify-center rounded-sm bg-white/90 text-[13px] font-bold text-slate-700 dark:bg-white/10 dark:text-slate-200">
          {r.name}
        </span>
        {isNight && (
          <span className="shrink-0 text-[10px] font-medium tracking-widest text-slate-400 uppercase">
            noćna
          </span>
        )}
      </div>
      <RouteQualityCardStats r={r} />
      {r.headwayCv !== null && (
        <div className="mt-2 min-w-0 truncate text-[11px] font-medium text-slate-500">
          <span className={cvColor(r.headwayCv)}>
            Takt: {cvLabel(r.headwayCv)}
          </span>
        </div>
      )}
    </div>
  )
}

function RouteQualityInsight({
  insights,
}: {
  insights: ReturnType<typeof computeInsights>
}) {
  return (
    <div className="flex flex-col rounded-[12px] bg-[#f9f9f9] p-6 sm:p-7 dark:bg-[#1a1a1a]">
      <h3 className="mb-2 font-sans text-[13px] font-semibold tracking-widest text-slate-500 uppercase dark:text-slate-400">
        Zanimljivosti
      </h3>
      <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
        {insights.mostDirect && insights.mostWinding && (
          <>
            Najizravnija linija je{" "}
            <strong className="font-medium text-slate-900 dark:text-slate-100">
              tramvaj {insights.mostDirect.name}
            </strong>{" "}
            (tortuoznost {fmtDec(insights.mostDirect.tortuosity!, 2)}), a
            najkrivudavija{" "}
            <strong className="font-medium text-slate-900 dark:text-slate-100">
              tramvaj {insights.mostWinding.name}
            </strong>{" "}
            ({fmtDec(insights.mostWinding.tortuosity!, 2)} -{" "}
            {Math.round((insights.mostWinding.tortuosity! - 1) * 100)}% duža od
            ravne linije).
          </>
        )}
        {insights.fastest && insights.slowest && (
          <>
            {" "}
            Korelacija je jasna: linije s većim razmakom stajališta voze brže.{" "}
            <strong className="font-medium text-slate-900 dark:text-slate-100">
              Tramvaj {insights.fastest.name}
            </strong>{" "}
            ({Math.round(insights.fastest.spacing)} m razmak) postiže{" "}
            {fmtDec(insights.fastest.speed, 1)} km/h, dok{" "}
            <strong className="font-medium text-slate-900 dark:text-slate-100">
              tramvaj {insights.slowest.name}
            </strong>{" "}
            ({Math.round(insights.slowest.spacing)} m) ide samo{" "}
            {fmtDec(insights.slowest.speed, 1)} km/h.
          </>
        )}
      </p>
    </div>
  )
}

function RouteQualityCards({
  routes,
  insights,
}: {
  routes: NetworkRoute[]
  insights: ReturnType<typeof computeInsights>
}) {
  const tramRoutes = routes
    .filter((r) => r.mode === "TRAM")
    .sort((a, b) => tramSort(a.name, b.name))

  if (tramRoutes.length === 0) return null

  return (
    <div className="flex flex-col">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <StatModuleTitle>
            Kvaliteta tramvajskih linija
          </StatModuleTitle>
          <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
            Tortuoznost mjeri koliko je ruta neizravna (1,0 = savršeno ravna).
            CV takta označava ujednačenost razmaka polazaka (manje = bolje).
          </p>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {tramRoutes.map((r) => (
          <div key={r.name} className="min-w-0">
            <RouteQualityCard r={r} />
          </div>
        ))}
      </div>

      <RouteQualityInsight insights={insights} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// 4. Fleet & Interlining
// ---------------------------------------------------------------------------
function FleetNumbers({ fleet }: { fleet: Fleet }) {
  return (
    <div className="rounded-[12px] bg-[#f9f9f9] p-7 sm:p-8 dark:bg-[#1a1a1a]">
      <div className="grid grid-cols-2 gap-6 sm:gap-4">
        <div>
          <div className="font-sans text-3xl leading-none font-semibold tracking-tighter text-slate-900 tabular-nums sm:text-[28px] dark:text-slate-100">
            {fleet.totalBlocks}
          </div>
          <div className="mt-2 text-[13px] text-slate-500 sm:mt-1 sm:text-[12px] dark:text-slate-400">
            ukupno blokova
          </div>
        </div>
        <div>
          <div className="font-sans text-3xl leading-none font-semibold tracking-tighter text-slate-700 tabular-nums sm:text-[28px] dark:text-slate-200">
            {fleet.interlinedBlocks}
          </div>
          <div className="mt-2 text-[13px] text-slate-500 sm:mt-1 sm:text-[12px] dark:text-slate-400">
            interliniranih
          </div>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 border-t border-slate-100 pt-5 sm:mt-4 sm:gap-6 sm:pt-4 dark:border-slate-800">
        <div>
          <span className="font-sans text-[22px] tracking-tight text-slate-800 tabular-nums sm:text-[20px] dark:text-slate-200">
            {fleet.tramBlocks}
          </span>
          <span className="ml-2 text-[12px] text-slate-500 sm:ml-1.5 sm:text-[11px]">
            tramvajskih
          </span>
        </div>
        <div>
          <span className="font-sans text-[22px] tracking-tight text-slate-800 tabular-nums sm:text-[20px] dark:text-slate-200">
            {fleet.busBlocks}
          </span>
          <span className="ml-2 text-[12px] text-slate-500 sm:ml-1.5 sm:text-[11px]">
            autobusnih
          </span>
        </div>
      </div>
    </div>
  )
}

function FleetTopBlocks({ fleet }: { fleet: Fleet }) {
  const topBlocks = [...fleet.interlinedExamples]
    .sort((a, b) => b.routes.length - a.routes.length)
    .slice(0, 5)

  return (
    <div className="rounded-[12px] bg-[#f9f9f9] p-5 sm:p-6 dark:bg-[#1a1a1a]">
      <div className="mb-3 font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
        Najsloženiji blokovi
      </div>
      <div className="space-y-2.5">
        {topBlocks.map((block) => (
          <div
            key={block.blockId}
            className="flex flex-wrap items-center gap-1.5"
          >
            <span className="shrink-0 text-[12px] font-medium text-slate-600 tabular-nums dark:text-slate-300">
              {block.blockId}
            </span>
            <span className="text-[10px] text-slate-400">→</span>
            {block.routes.map((route) => (
              <span
                key={route}
                className="inline-flex h-5 items-center rounded-md bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-700 tabular-nums dark:bg-white/10 dark:text-slate-200"
              >
                {route}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function FleetSection({
  fleet,
  insights,
}: {
  fleet: Fleet
  insights: ReturnType<typeof computeInsights>
}) {
  return (
    <div className="flex flex-col">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <StatModuleTitle>
            Vozni park i interlining
          </StatModuleTitle>
          <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
            Koliko se često ista vozila (blokovi) koriste na više različitih
            linija tijekom dana, što štedi resurse, ali komplicira mrežu.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_320px]">
        <FleetNumbers fleet={fleet} />
        <FleetTopBlocks fleet={fleet} />
      </div>

      <Insight>
        Interlining je isključivo autobusni fenomen -{" "}
        <strong>{insights.busInterlinePct}% autobusnih blokova</strong> vozi
        više od jedne linije, dok tramvaji zadržavaju fiksne rute.
        {insights.biggestBlock && (
          <>
            {" "}
            Najsloženiji blok ({insights.biggestBlock.blockId}) prolazi kroz{" "}
            <strong>
              {insights.biggestBlock.routes.length} različitih linija
            </strong>{" "}
            u jednom danu. To znači da kašnjenje na liniji{" "}
            {insights.biggestBlock.routes[0]} može kaskadno utjecati na linije{" "}
            {insights.biggestBlock.routes.slice(1).join(", ")}.
          </>
        )}
      </Insight>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 5. Weekend & Asymmetry
// ---------------------------------------------------------------------------
function WeekdayOnlyCard({
  weekendService,
}: {
  weekendService: WeekendService
}) {
  return (
    <div className="flex flex-col border-l-2 border-indigo-500 py-2 pl-6">
      <div className="mb-2 font-sans text-[13px] font-bold tracking-widest text-indigo-700 uppercase">
        Samo radnim danom
      </div>
      <div className="mb-4 font-sans text-[36px] leading-none font-medium tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
        {weekendService.weekdayOnlyCount}{" "}
        <span className="font-sans text-[18px] text-slate-500 dark:text-slate-400">
          linija
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {weekendService.weekdayOnlyRoutes
          .sort((a, b) => {
            const na = parseInt(a, 10),
              nb = parseInt(b, 10)
            if (isNaN(na) && isNaN(nb)) return a.localeCompare(b)
            if (isNaN(na)) return 1
            if (isNaN(nb)) return -1
            return na - nb
          })
          .map((route) => (
            <span
              key={route}
              className="inline-flex h-6 items-center rounded-sm bg-slate-100 px-2 font-mono text-[12px] font-bold text-slate-700 tabular-nums dark:bg-slate-800 dark:text-slate-300"
            >
              {route}
            </span>
          ))}
      </div>
    </div>
  )
}

function AsymmetryCard({
  asymmetry,
  topAsymmetric,
}: {
  asymmetry: DirectionalAsymmetryEntry[]
  topAsymmetric: DirectionalAsymmetryEntry[]
}) {
  return (
    <div className="flex flex-col border-l-2 border-slate-300 py-2 pl-6">
      <div className="mb-2 font-sans text-[13px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
        Smjerna asimetrija
      </div>
      <div className="mb-4 font-sans text-[36px] leading-none font-medium tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
        {asymmetry.length}{" "}
        <span className="font-sans text-[18px] text-slate-500 dark:text-slate-400">
          linija
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {topAsymmetric.map((entry) => (
          <div
            key={entry.name}
            className="flex flex-col border-b border-slate-100 py-3 last:border-0 dark:border-white/5"
          >
            <AsymmetryBar entry={entry} />
          </div>
        ))}
      </div>
    </div>
  )
}

function AsymmetryBar({ entry }: { entry: DirectionalAsymmetryEntry }) {
  const maxTrips = Math.max(entry.outboundTrips, entry.inboundTrips, 1)
  const outPct = (entry.outboundTrips / maxTrips) * 100
  const inPct = (entry.inboundTrips / maxTrips) * 100
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-6 items-center justify-center rounded-sm bg-slate-100 px-2 font-mono text-[12px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {entry.name}
        </span>
        <span className="text-[14px] text-slate-700 dark:text-slate-300">
          {entry.outboundTrips} odl. / {entry.inboundTrips} dol.
        </span>
      </div>
      <div className="ml-2 flex items-center gap-2">
        <span className="w-8 text-right text-[11px] tracking-widest text-slate-500 uppercase dark:text-slate-400">
          odl.
        </span>
        <div className="flex-1">
          <div
            className="h-1.5 rounded-full bg-slate-900 dark:bg-slate-100"
            style={{ width: `${outPct}%` }}
          />
        </div>
      </div>
      <div className="ml-2 flex items-center gap-2">
        <span className="w-8 text-right text-[11px] tracking-widest text-slate-500 uppercase dark:text-slate-400">
          dol.
        </span>
        <div className="flex-1">
          <div
            className="h-1.5 rounded-full bg-slate-400 dark:bg-slate-500"
            style={{ width: `${inPct}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function WeekendAsymmetryInsight({
  weekdayTrams,
  topAsymmetric,
}: {
  weekdayTrams: string[]
  topAsymmetric: DirectionalAsymmetryEntry[]
}) {
  return (
    <Insight>
      {weekdayTrams.length > 0 && (
        <>
          Tramvajske linije <strong>{weekdayTrams.join(", ")}</strong> potpuno
          nestaju vikendom - ZET ih zamjenjuje drugačijim voznim redom.
        </>
      )}
      {topAsymmetric.length > 0 && (
        <>
          {" "}
          Linija {topAsymmetric[0].name} ima {topAsymmetric[0].outboundTrips}{" "}
          polazaka u jednom smjeru, ali samo {topAsymmetric[0].inboundTrips} u
          drugom - vjerojatno ekspresna varijanta koja se vraća pod drugim
          brojem linije.
        </>
      )}
    </Insight>
  )
}

function WeekendAsymmetrySection({
  weekendService,
  asymmetry,
}: {
  weekendService: WeekendService | null
  asymmetry: DirectionalAsymmetryEntry[] | null
}) {
  if (!weekendService && !asymmetry) return null

  const topAsymmetric = asymmetry
    ? [...asymmetry].sort((a, b) => a.ratio - b.ratio).slice(0, 5)
    : []

  const weekdayTrams =
    weekendService?.weekdayOnlyRoutes.filter(
      (r) => parseInt(r, 10) <= 34 && !isNaN(parseInt(r, 10))
    ) ?? []

  return (
    <section className="flex flex-col border-t border-slate-100 pt-16 dark:border-white/10">
      <div className="mb-12">
        <StatModuleTitle>
          Vikend i smjerna asimetrija
        </StatModuleTitle>
        <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
          Neke linije ne voze vikendom, a neke imaju različit broj polazaka u
          svakom smjeru.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {weekendService && <WeekdayOnlyCard weekendService={weekendService} />}
        {topAsymmetric.length > 0 && asymmetry && (
          <AsymmetryCard asymmetry={asymmetry} topAsymmetric={topAsymmetric} />
        )}
      </div>
      <WeekendAsymmetryInsight
        weekdayTrams={weekdayTrams}
        topAsymmetric={topAsymmetric}
      />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Shared: stacked-bar histogram for service span
// ---------------------------------------------------------------------------
function HistogramBars({
  data,
  max,
}: {
  data: ServiceSpan["firstServiceHistogram"]
  max: number
}) {
  return (
    <div className="space-y-1">
      {data.map((bucket) => (
        <div key={bucket.label} className="flex items-center gap-2 sm:gap-2">
          <span className="w-12 shrink-0 text-right font-mono text-[12px] text-slate-500 tabular-nums sm:w-10 sm:text-[11px] dark:text-slate-400">
            {bucket.label}
          </span>
          <div className="flex-1">
            <div className="flex h-5 items-center gap-px">
              {bucket.tramStops > 0 && (
                <div
                  className="h-full rounded-l bg-slate-400 dark:bg-slate-500"
                  style={{ width: `${(bucket.tramStops / max) * 100}%` }}
                />
              )}
              {bucket.busStops > 0 && (
                <div
                  className={`h-full bg-indigo-300 dark:bg-indigo-500/70 ${bucket.tramStops === 0 ? "rounded-l" : ""}`}
                  style={{ width: `${(bucket.busStops / max) * 100}%` }}
                />
              )}
              {bucket.railStops > 0 && (
                <div
                  className="h-full rounded-r bg-amber-200/90 dark:bg-amber-200/40"
                  style={{ width: `${(bucket.railStops / max) * 100}%` }}
                />
              )}
            </div>
          </div>
          <span className="w-8 text-right font-mono text-[10px] text-slate-400 tabular-nums">
            {bucket.stopCount}
          </span>
        </div>
      ))}
    </div>
  )
}

function ServiceHistogram({
  data,
  max,
  title,
  subtitle,
  titleColor,
  hasRail,
}: {
  data: ServiceSpan["firstServiceHistogram"]
  max: number
  title: string
  subtitle: string
  titleColor: string
  hasRail: boolean
}) {
  return (
    <div className="flex flex-col rounded-[12px] bg-[#f9f9f9] p-5 sm:p-6 dark:bg-[#1a1a1a]">
      <div
        className={`mb-1 font-sans text-[11px] font-bold tracking-widest uppercase ${titleColor}`}
      >
        {title}
      </div>
      <div className="mb-4 text-[14px] text-slate-600 dark:text-slate-400">
        {subtitle}
      </div>
      <HistogramBars data={data} max={max} />
      <div className="mt-3 flex gap-4 text-[10px] text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-slate-400" />{" "}
          tramvaj
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-indigo-300 dark:bg-indigo-500/70" />{" "}
          autobus
        </span>
        {hasRail && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-amber-200/90 dark:bg-amber-200/50" />{" "}
            vlak
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 6. First & Last Service (1.4 + 1.3)
// ---------------------------------------------------------------------------
function ServiceSpanNumbers({ span }: { span: ServiceSpan }) {
  const tramMode = span.byMode.find((m) => m.mode === "TRAM")
  const busMode = span.byMode.find((m) => m.mode === "BUS")
  const { nightGap } = span

  return (
    <div className="mb-8 grid grid-cols-1 gap-6 rounded-[12px] bg-[#f9f9f9] p-5 sm:grid-cols-3 sm:gap-8 sm:p-6 dark:bg-[#1a1a1a]">
      <div className="flex flex-col">
        <div className="font-sans text-[36px] leading-none font-medium tracking-tight text-amber-600 tabular-nums dark:text-amber-400">
          {span.firstMorningDeparture}
        </div>
        <div className="mt-2 text-[14px] text-slate-600 dark:text-slate-400">
          prvi jutarnji polazak
        </div>
        {tramMode && (
          <div className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
            Tramvaj {tramMode.earliestDeparture} · Autobus{" "}
            {busMode?.earliestDeparture ?? "-"}
          </div>
        )}
      </div>
      <div className="flex flex-col">
        <div className="font-sans text-[36px] leading-none font-medium tracking-tight text-indigo-600 tabular-nums dark:text-indigo-400">
          {span.lastEveningDeparture}
        </div>
        <div className="mt-2 text-[14px] text-slate-600 dark:text-slate-400">
          zadnji večernji polazak
        </div>
        {tramMode && (
          <div className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
            Tramvaj {tramMode.latestDeparture} · Autobus{" "}
            {busMode?.latestDeparture ?? "-"}
          </div>
        )}
      </div>
      <div className="flex flex-col">
        <div className="font-sans text-[36px] leading-none font-medium tracking-tight text-red-600 tabular-nums dark:text-red-400">
          {Math.round(nightGap.pctDarkBy23)}%
        </div>
        <div className="mt-2 text-[14px] text-slate-600 dark:text-slate-400">
          stanica u mraku do 23h
        </div>
        <div className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
          {fmtDots(nightGap.stopsDarkBy23)} od {fmtDots(nightGap.totalStops)}{" "}
          stanica
        </div>
      </div>
    </div>
  )
}

function PastMidnightCard({ routes }: { routes: string[] }) {
  return (
    <div className="rounded-[12px] bg-[#f9f9f9] p-5 sm:p-6 dark:bg-[#1a1a1a]">
      <div className="mb-1 font-sans text-[11px] font-bold tracking-widest text-emerald-600 uppercase dark:text-emerald-400">
        Usluga nakon ponoći
      </div>
      <div className="mb-3 text-[12px] text-slate-500 dark:text-slate-400">
        {routes.length} linija čija usluga prelazi ponoć
      </div>
      <div className="flex flex-wrap gap-1.5">
        {routes.slice(0, 30).map((route) => (
          <span
            key={route}
            className="inline-flex h-6 items-center rounded-full bg-emerald-100 px-2 text-[11px] font-semibold text-emerald-800 tabular-nums dark:bg-emerald-900/40 dark:text-emerald-300"
          >
            {route}
          </span>
        ))}
        {routes.length > 30 && (
          <span className="inline-flex h-6 items-center px-1 text-[11px] text-slate-400">
            +{routes.length - 30}
          </span>
        )}
      </div>
    </div>
  )
}

function EndingBefore23Card({ routes }: { routes: string[] }) {
  return (
    <div className="rounded-[12px] bg-[#f9f9f9] p-5 sm:p-6 dark:bg-[#1a1a1a]">
      <div className="mb-1 font-sans text-[11px] font-bold tracking-widest text-red-600 uppercase dark:text-red-400">
        Gašenje prije 23h
      </div>
      <div className="mb-3 text-[12px] text-slate-500 dark:text-slate-400">
        {routes.length} linija završava radni dan do 23:00
      </div>
      <div className="flex flex-wrap gap-1.5">
        {routes.slice(0, 20).map((route) => (
          <span
            key={route}
            className="inline-flex h-6 items-center rounded-full bg-red-100 px-2 text-[11px] font-semibold text-red-800 tabular-nums dark:bg-red-900/40 dark:text-red-300"
          >
            {route}
          </span>
        ))}
        {routes.length > 20 && (
          <span className="inline-flex h-6 items-center px-1 text-[11px] text-slate-400">
            +{routes.length - 20}
          </span>
        )}
      </div>
    </div>
  )
}

function NightGapDetails({ nightGap }: { nightGap: ServiceSpan["nightGap"] }) {
  if (
    nightGap.routesPastMidnight.length === 0 &&
    nightGap.routesEndingBefore23.length === 0
  ) {
    return null
  }

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      {nightGap.routesPastMidnight.length > 0 && (
        <PastMidnightCard routes={nightGap.routesPastMidnight} />
      )}
      {nightGap.routesEndingBefore23.length > 0 && (
        <EndingBefore23Card routes={nightGap.routesEndingBefore23} />
      )}
    </div>
  )
}

function ServiceSpanInsight({ span }: { span: ServiceSpan }) {
  const { nightGap } = span
  return (
    <Insight>
      Jutarnji prijevoz počinje u <strong>{span.firstMorningDeparture}</strong>,
      a zadnji večernji polazak kreće u{" "}
      <strong>{span.lastEveningDeparture}</strong>. Do 23 sata,{" "}
      <strong>{Math.round(nightGap.pctDarkBy23)}%</strong> stanica (
      {fmtDots(nightGap.stopsDarkBy23)}) već nema nijedan polazak.
      {nightGap.routesEndingBefore23.length > 0 && (
        <>
          {" "}
          Čak {nightGap.routesEndingBefore23.length} linija završava uslugu
          prije 23:00.
        </>
      )}{" "}
      Ako propustite zadnji polazak, na velikom dijelu mreže nemate alternativu
      osim taksija.
    </Insight>
  )
}

function ServiceSpanSection({ span }: { span: ServiceSpan }) {
  const { firstServiceHistogram, lastServiceHistogram, nightGap } = span
  const maxFirst = Math.max(...firstServiceHistogram.map((b) => b.stopCount), 1)
  const maxLast = Math.max(...lastServiceHistogram.map((b) => b.stopCount), 1)
  const hasRail = span.hasRail

  return (
    <section className="flex flex-col border-t border-slate-100 pt-16 dark:border-white/10">
      <div className="mb-12">
        <StatModuleTitle>
          Kad se Zagreb budi i gasi
        </StatModuleTitle>
        <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
          Kada stajalište dobije prvi polazak ujutro, a kada ostaje bez usluge
          navečer. Zagreb ne spava u isto vrijeme - neke četvrti gube prijevoz
          satima prije ostatka grada.
        </p>
      </div>

      <ServiceSpanNumbers span={span} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ServiceHistogram
          data={firstServiceHistogram}
          max={maxFirst}
          title="Buđenje mreže"
          subtitle="Koliko stanica dobije prvi polazak u svakom polusatu"
          titleColor="text-amber-600 dark:text-amber-400"
          hasRail={hasRail}
        />
        <ServiceHistogram
          data={lastServiceHistogram}
          max={maxLast}
          title="Gašenje mreže"
          subtitle="Kada stanice gube zadnji polazak navečer"
          titleColor="text-indigo-600 dark:text-indigo-400"
          hasRail={hasRail}
        />
      </div>

      <NightGapDetails nightGap={nightGap} />
      <ServiceSpanInsight span={span} />
    </section>
  )
}

// ---------------------------------------------------------------------------
// 7. Pulse Scheduling Detection
// ---------------------------------------------------------------------------
function pulseWaitColor(waitMin: number): string {
  if (waitMin < 3) return "text-emerald-600 dark:text-emerald-400"
  if (waitMin <= 6) return "text-amber-600 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}

function pulseWaitBg(waitMin: number): string {
  if (waitMin < 3)
    return "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200"
  if (waitMin <= 6)
    return "bg-slate-200/80 text-slate-800 dark:bg-white/15 dark:text-slate-200"
  return "bg-slate-300 text-slate-900 dark:bg-white/20 dark:text-white"
}

function PulseHubRow({ hub }: { hub: PulseHub }) {
  return (
    <tr className="border-b border-slate-100 last:border-0 dark:border-slate-800">
      <td className="py-3 pr-4 text-left">
        <div className="text-[13px] font-medium text-slate-800 dark:text-slate-200">
          {hub.stopName}
        </div>
      </td>
      <td className="py-3 pr-4 text-center">
        <span className="font-sans text-[14px] font-medium tracking-tight text-slate-800 tabular-nums dark:text-slate-200">
          {hub.routeCount}
        </span>
      </td>
      <td className="py-3 pr-4">
        <div className="flex flex-wrap gap-1">
          {hub.routes.slice(0, 8).map((route) => (
            <span
              key={route}
              className="inline-flex h-5 items-center rounded bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-700 tabular-nums dark:bg-slate-800 dark:text-slate-300"
            >
              {route}
            </span>
          ))}
          {hub.routes.length > 8 && (
            <span className="text-[10px] text-slate-400">
              +{hub.routes.length - 8}
            </span>
          )}
        </div>
      </td>
      <td className="py-3 pr-4 text-center">
        <span
          className={`inline-flex h-6 items-center rounded-full px-2 text-[12px] font-semibold tabular-nums ${pulseWaitBg(hub.avgTransferWaitMin)}`}
        >
          {fmtDec(hub.avgTransferWaitMin, 1)} min
        </span>
      </td>
      <td className="py-3 text-center">
        <span className="text-[13px] text-slate-700 tabular-nums dark:text-slate-300">
          {hub.bestHour}:00
        </span>
        <span
          className={`ml-1.5 text-[11px] font-medium tabular-nums ${pulseWaitColor(hub.bestHourWaitMin)}`}
        >
          ({fmtDec(hub.bestHourWaitMin, 1)} min)
        </span>
      </td>
    </tr>
  )
}

const PULSE_CELL_W = 32
const PULSE_CELL_H = 28
const PULSE_GAP = 2
const PULSE_LABEL_W = 120

function pulseHeatColor(wait: number, maxWait: number): string {
  if (wait < 0) return "transparent"
  const t = Math.min(wait / maxWait, 1)
  if (t < 0.33) return "#e2e8f0"
  if (t < 0.55) return "#94a3b8"
  if (t < 0.77) return "#64748b"
  return "#1e293b"
}

function PulseHeatmapCells({
  topHubs,
  maxWait,
}: {
  topHubs: PulseHub[]
  maxWait: number
}) {
  return (
    <>
      {topHubs.map((hub, ri) =>
        hub.hourlyWait.map((wait, ci) => (
          <rect
            key={`cell-${hub.stopKey}-${ci}`}
            x={PULSE_LABEL_W + ci * (PULSE_CELL_W + PULSE_GAP)}
            y={ri * (PULSE_CELL_H + PULSE_GAP)}
            width={PULSE_CELL_W}
            height={PULSE_CELL_H}
            rx={4}
            fill={pulseHeatColor(wait, maxWait)}
            opacity={wait < 0 ? 0.1 : 0.8}
          />
        ))
      )}
      {topHubs.map((hub, ri) =>
        hub.hourlyWait.map((wait, ci) =>
          wait >= 0 ? (
            <text
              key={`txt-${hub.stopKey}-${ci}`}
              x={
                PULSE_LABEL_W +
                ci * (PULSE_CELL_W + PULSE_GAP) +
                PULSE_CELL_W / 2
              }
              y={ri * (PULSE_CELL_H + PULSE_GAP) + PULSE_CELL_H / 2 + 1}
              textAnchor="middle"
              dominantBaseline="central"
              className={
                wait < maxWait * 0.33
                  ? "fill-slate-700 font-sans text-[9px] font-medium dark:fill-slate-200"
                  : "fill-white/90 font-sans text-[9px] font-medium"
              }
            >
              {wait.toFixed(0)}
            </text>
          ) : null
        )
      )}
    </>
  )
}

function PulseHeatmap({ hubs }: { hubs: PulseHub[] }) {
  const topHubs = hubs.slice(0, 5)
  if (topHubs.length === 0) return null

  const hours = Array.from({ length: 19 }, (_, i) => i + 5)
  const allWaits = topHubs.flatMap((h) => h.hourlyWait.filter((v) => v >= 0))
  const maxWait = Math.max(...allWaits, 1)
  const svgW = PULSE_LABEL_W + hours.length * (PULSE_CELL_W + PULSE_GAP)
  const svgH = topHubs.length * (PULSE_CELL_H + PULSE_GAP) + 24

  return (
    <div className="mt-6 w-full overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200/60 bg-slate-100 p-4 [-webkit-overflow-scrolling:touch] sm:rounded-3xl sm:p-8 dark:border-white/10 dark:bg-zinc-800/60">
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="mx-auto block w-full max-w-none shrink-0 max-sm:min-w-[720px] sm:w-auto sm:max-w-full"
        role="img"
        aria-label="Toplinska karta prosječnog čekanja na presjedanje po satu"
      >
        {topHubs.map((hub, ri) => (
          <text
            key={`lbl-${hub.stopKey}`}
            x={PULSE_LABEL_W - 8}
            y={ri * (PULSE_CELL_H + PULSE_GAP) + PULSE_CELL_H / 2 + 1}
            textAnchor="end"
            dominantBaseline="central"
            className="fill-slate-600 font-sans text-[11px] dark:fill-slate-400"
          >
            {hub.stopName.length > 18
              ? hub.stopName.slice(0, 16) + "..."
              : hub.stopName}
          </text>
        ))}
        <PulseHeatmapCells topHubs={topHubs} maxWait={maxWait} />
        {hours
          .filter((_, i) => i % 3 === 0)
          .map((h) => (
            <text
              key={`hr-${h}`}
              x={
                PULSE_LABEL_W +
                (h - 5) * (PULSE_CELL_W + PULSE_GAP) +
                PULSE_CELL_W / 2
              }
              y={topHubs.length * (PULSE_CELL_H + PULSE_GAP) + 16}
              textAnchor="middle"
              className="fill-slate-500 font-sans text-[10px] dark:fill-slate-400"
            >
              {h}h
            </text>
          ))}
      </svg>
    </div>
  )
}

function PulseHubsTable({ hubs }: { hubs: PulseHub[] }) {
  return (
    <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200/60 bg-slate-100 [-webkit-overflow-scrolling:touch] sm:rounded-3xl dark:border-white/10 dark:bg-zinc-800/60">
      <table className="w-full min-w-[640px] text-left">
        <thead>
          <tr className="border-b border-slate-100 dark:border-slate-700">
            <th className="px-6 py-3 text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
              Stajalište
            </th>
            <th className="px-4 py-3 text-center text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
              Linije
            </th>
            <th className="px-4 py-3 text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
              Rute
            </th>
            <th className="px-4 py-3 text-center text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
              Prosj. čekanje
            </th>
            <th className="px-4 py-3 text-center text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
              Najbolji sat
            </th>
          </tr>
        </thead>
        <tbody className="px-6">
          {hubs.map((hub) => (
            <PulseHubRow key={hub.stopKey} hub={hub} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PulseInsight({
  hubs,
  avgWait,
  bestHub,
  pulsedCount,
}: {
  hubs: PulseHub[]
  avgWait: number
  bestHub: PulseHub
  pulsedCount: number
}) {
  if (pulsedCount > 0) {
    return (
      <Insight>
        Zagreb pokazuje elemente pulse schedulinga na{" "}
        <strong>
          {pulsedCount} od {hubs.length}
        </strong>{" "}
        analiziranih čvorišta (prosječno čekanje na presjedanje &lt;5 min u
        vršnom satu). Najbolje sinkronizirano čvorište je{" "}
        <strong>{bestHub.stopName}</strong> s prosječnim čekanjem od samo{" "}
        {fmtDec(bestHub.avgTransferWaitMin, 1)} minuta. Ukupni prosjek od{" "}
        {fmtDec(avgWait, 1)} minuta sugerira da postoji određena koordinacija,
        ali ne sustavni pulse.
      </Insight>
    )
  }
  return (
    <Insight>
      Zagreb ne koristi pulse scheduling - prosječno čekanje na presjedanje na
      velikim čvorištima iznosi <strong>{fmtDec(avgWait, 1)} minuta</strong>.
      Presjedanja su uglavnom prepuštena slučaju, što je tipično za mreže s
      kratkim intervalima. Najbolje sinkronizirano čvorište je{" "}
      <strong>{bestHub.stopName}</strong> s prosječnim čekanjem od{" "}
      {fmtDec(bestHub.avgTransferWaitMin, 1)} minuta.
    </Insight>
  )
}

function PulseSchedulingSection({ hubs }: { hubs: PulseHub[] }) {
  if (hubs.length === 0) return null

  const avgWait =
    hubs.reduce((s, h) => s + h.avgTransferWaitMin, 0) / hubs.length
  const bestHub = [...hubs].sort(
    (a, b) => a.avgTransferWaitMin - b.avgTransferWaitMin
  )[0]
  const pulsedCount = hubs.filter((h) => h.bestHourWaitMin < 5).length

  return (
    <section className="flex flex-col border-t border-slate-100 pt-16 dark:border-white/10">
      <div className="mb-12">
        <StatModuleTitle>
          Pulse scheduling
        </StatModuleTitle>
        <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
          Pulse scheduling znači sinkronizaciju dolazaka različitih linija na
          ključna čvorišta, kako bi putnici mogli presjedati s minimalnim
          čekanjem. Analiziramo {hubs.length} najvećih presjedačkih čvorišta.
        </p>
      </div>

      <PulseHubsTable hubs={hubs} />
      <PulseHeatmap hubs={hubs} />
      <PulseInsight
        hubs={hubs}
        avgWait={avgWait}
        bestHub={bestHub}
        pulsedCount={pulsedCount}
      />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function NetworkStatsSection() {
  const data = loadNetworkStats()
  if (!data) return null

  const routeStats = loadRouteStatsForInsights()
  const insights = computeInsights(data, routeStats)

  return (
    <section
      id="mreza"
      className="flex min-w-0 flex-col border-t border-slate-100 py-14 sm:py-24 dark:border-white/10"
    >
      <div className="mb-10 flex flex-col gap-4 sm:mb-12 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <StatModuleTitle>
            Analiza mreže
          </StatModuleTitle>
          <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-slate-700 sm:text-[18px] dark:text-slate-300">
            Detaljan pregled rasporeda, kapaciteta i karakteristika voznog reda
            zagrebačkog javnog prijevoza.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-16">
        <NetworkOverview data={data} />
        <HourlyHeatmap routes={data.routes} insights={insights} />
        <RouteQualityCards routes={data.routes} insights={insights} />
        {data.fleet && <FleetSection fleet={data.fleet} insights={insights} />}
        <WeekendAsymmetrySection
          weekendService={data.weekendService}
          asymmetry={data.directionalAsymmetry}
        />
        {data.serviceSpan && <ServiceSpanSection span={data.serviceSpan} />}
        {data.pulseHubs && data.pulseHubs.length > 0 && (
          <PulseSchedulingSection hubs={data.pulseHubs} />
        )}
      </div>
    </section>
  )
}
