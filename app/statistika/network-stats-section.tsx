import { join } from "node:path"
import { getDataDir } from "@/lib/data-dir"
import { readJsonCached } from "@/lib/page-data"
import { fmtHR } from "@/lib/format"
import { loadRouteStats } from "./stat-data"
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
import { CollapsibleContent } from "./stat-expandable"
import { plural } from "@/app/linije/copy"

function fmtDots(n: number): string {
  return Math.round(n)
    .toString()
    .replaceAll(/\B(?=(\d{3})+(?!\d))/gu, ".")
}

function tramSort(a: string, b: string): number {
  return Number.parseInt(a, 10) - Number.parseInt(b, 10)
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
  trams: Array<NetworkRoute>,
  dayTrams: Array<NetworkRoute>,
  nightTrams: Array<NetworkRoute>
) {
  const hourlySystem = Array.from({ length: 24 }, () => 0)
  for (const r of trams) {
    r.hourlyDepartures.forEach((d, h) => {
      hourlySystem[h] += d
    })
  }
  const peakHour = hourlySystem.indexOf(Math.max(...hourlySystem))
  const peakDeps = hourlySystem[peakHour]
  const busiestTram = dayTrams.toSorted(
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
  dayTrams: Array<NetworkRoute>,
  routeStats: RouteStatsOutput | null
) {
  const withTort = dayTrams.filter(
    (r): r is NetworkRoute & { tortuosity: number } =>
      r.tortuosity !== null && r.tortuosity < 4
  )
  const mostDirect =
    withTort.length > 0
      ? withTort.toSorted(
          (a, b) => (a.tortuosity ?? 99) - (b.tortuosity ?? 99)
        )[0]
      : null
  const mostWinding =
    withTort.length > 0
      ? withTort.toSorted(
          (a, b) => (b.tortuosity ?? 0) - (a.tortuosity ?? 0)
        )[0]
      : null
  const mostRegular =
    dayTrams
      .filter((r) => r.headwayCv !== null && r.headwayCv > 0)
      .toSorted((a, b) => (a.headwayCv ?? 99) - (b.headwayCv ?? 99))[0] ?? null

  const speedData: Array<{ name: string; spacing: number; speed: number }> = []
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
      ? speedData.toSorted((a, b) => a.speed - b.speed)[0]
      : null
  const fastest =
    speedData.length > 0
      ? speedData.toSorted((a, b) => b.speed - a.speed)[0]
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
    ? (fleet.interlinedExamples.toSorted(
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
    <div className="grid grid-cols-1 gap-10 bg-surface p-6 sm:grid-cols-3 sm:gap-10 sm:p-8">
      <div className="flex flex-col">
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          {fmtDots(vehicleKm.total)}
        </div>
        <div className="mt-3 text-body text-ink-2 sm:mt-2">vozilo-km/dan</div>
        <div className="mt-2 text-body text-ink-muted sm:mt-1">
          Tramvaj {fmtDots(vehicleKm.tram)} · Autobus {fmtDots(vehicleKm.bus)}
        </div>
      </div>
      <div className="flex flex-col">
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          {fleet ? fmtDots(fleet.totalBlocks) : "-"}
        </div>
        <div className="mt-3 text-body text-ink-2 sm:mt-2">vozila</div>
        {fleet && (
          <div className="mt-2 text-body text-ink-muted sm:mt-1">
            Tramvaj {fleet.tramBlocks} · Autobus {fleet.busBlocks}
          </div>
        )}
      </div>
      <div className="flex flex-col">
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          {fmtDots(deadEndStops.total)}
        </div>
        <div className="mt-3 text-body text-ink-2 sm:mt-2">
          slijepih stanica
        </div>
        <div className="mt-2 text-body text-ink-muted sm:mt-1">
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
        kvartovi s tramvajskim linijama postižu u prosjeku{" "}
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
  tramRoutes: Array<NetworkRoute>
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
        className="mx-auto block w-full max-w-none shrink-0 sm:w-auto sm:max-w-full"
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
            className="fill-ink-muted font-mono text-label"
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
            className="fill-ink-muted font-mono text-label"
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
  tramRoutes: Array<NetworkRoute>
  colorScale: (v: number) => string
  maxDep: number
}) {
  return (
    <>
      {tramRoutes.map((r, ri) =>
        r.hourlyDepartures.map((dep, ci) => (
          <rect
            // oxlint-disable-next-line react/no-array-index-key -- ci is the hour of day, a stable column identity
            key={`cell-${r.name}-${ci}`}
            x={HEATMAP_LABEL_W + ci * (HEATMAP_CELL_W + HEATMAP_GAP)}
            y={ri * (HEATMAP_CELL_H + HEATMAP_GAP)}
            width={HEATMAP_CELL_W}
            height={HEATMAP_CELL_H}
            rx={4}
            fill={dep === 0 ? "transparent" : colorScale(dep)}
            stroke={dep === 0 ? "currentColor" : "none"}
            strokeWidth={dep === 0 ? 0.5 : 0}
            className={dep === 0 ? "text-ink-ghost" : ""}
          />
        ))
      )}
      {tramRoutes.map((r, ri) =>
        r.hourlyDepartures.map((dep, ci) =>
          dep > 0 ? (
            <text
              // oxlint-disable-next-line react/no-array-index-key -- ci is the hour of day, a stable column identity
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
                  ? "fill-ink font-mono text-label"
                  : "fill-white/90 font-mono text-label"
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
    <div className="flex flex-col border border-hairline-strong bg-surface p-6 sm:p-7">
      <h3 className="mb-2 font-mono text-label font-bold text-ink-muted">
        Satni polasci tramvaja
      </h3>
      <p className="text-body text-ink-2">
        Broj polazaka po satu za svaku tramvajsku liniju. Svjetlija boja znači
        više polazaka. Vršni sat je <strong>{insights.peakHour}:00</strong> s{" "}
        {insights.peakDeps} tramvajskih polazaka.
        {insights.busiestTram !== undefined && (
          <>
            {" "}
            Najfrekventnija linija {insights.busiestTram.name} ima{" "}
            {insights.busiestPeakDep}{" "}
            {plural(insights.busiestPeakDep, "polazak", "polaska", "polazaka")}{" "}
            u vršnom satu - tramvaj svakih{" "}
            <strong>{fmtHR(insights.busiestInterval, 1)} minuta</strong>.
          </>
        )}{" "}
        Noćna mreža (linije 31-34) pruža samo {insights.nightTotal}{" "}
        {plural(insights.nightTotal, "polazak", "polaska", "polazaka")} - tek{" "}
        {fmtHR((insights.nightTotal / Math.max(insights.dayTotal, 1)) * 100, 1)}
        % dnevnog kapaciteta.
      </p>
    </div>
  )
}

function HourlyHeatmap({
  routes,
  insights,
}: {
  routes: Array<NetworkRoute>
  insights: ReturnType<typeof computeInsights>
}) {
  const tramRoutes = routes
    .filter((r) => r.mode === "TRAM")
    .toSorted((a, b) => {
      const totalA = a.hourlyDepartures.reduce((s, v) => s + v, 0)
      const totalB = b.hourlyDepartures.reduce((s, v) => s + v, 0)
      return totalB - totalA
    })

  if (tramRoutes.length === 0) {
    return null
  }

  const allDeps = tramRoutes.flatMap((r) => r.hourlyDepartures)
  const maxDep = Math.max(...allDeps, 1)
  const colorScale = scaleLinear<string>({
    domain: [0, maxDep * 0.25, maxDep * 0.5, maxDep * 0.75, maxDep],
    range: [
      "transparent",
      "var(--hairline-strong)",
      "var(--ink-faint)",
      "var(--ink-muted)",
      "var(--ink)",
    ],
  })

  return (
    <div className="flex flex-col gap-8">
      <HeatmapInsight insights={insights} />
      <div className="sm: overflow-x-auto border border-hairline-strong bg-track p-4 sm:p-6">
        <p className="mb-3 text-center text-body text-ink-muted sm:hidden">
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
  if (cv === null) {
    return "text-ink-faint"
  }
  if (cv < 0.2) {
    return "text-ink-2"
  }
  if (cv <= 0.4) {
    return "text-ink-muted"
  }
  return "text-ink"
}

function cvLabel(cv: number | null): string {
  if (cv === null) {
    return "-"
  }
  if (cv < 0.15) {
    return "odlično"
  }
  if (cv < 0.25) {
    return "dobro"
  }
  if (cv <= 0.4) {
    return "umjereno"
  }
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
    <div className="flex min-w-0 items-baseline justify-between gap-3 border-b border-hairline py-2 last:border-0 sm:gap-2 sm:py-1.5">
      <span className="min-w-0 shrink font-mono text-label text-ink-muted sm:truncate">
        {label}
      </span>
      <span
        className={`shrink-0 font-sans text-body tabular-nums ${valueClassName}`}
      >
        {children}
      </span>
    </div>
  )
}

function RouteQualityCardStats({ r }: { r: NetworkRoute }) {
  return (
    <div className="mt-1 min-w-0">
      <RouteQualityCardStatRow label="Tortuoznost" valueClassName="text-ink">
        {r.tortuosity === null ? "-" : fmtHR(r.tortuosity, 2)}
      </RouteQualityCardStatRow>
      <RouteQualityCardStatRow label="Razmak" valueClassName="text-ink">
        {r.stopSpacing ? `${Math.round(r.stopSpacing.avgM)} m` : "-"}
      </RouteQualityCardStatRow>
      <RouteQualityCardStatRow
        label="CV takta"
        valueClassName={cvColor(r.headwayCv) + " font-medium"}
      >
        {r.headwayCv === null ? "-" : fmtHR(r.headwayCv, 2)}
      </RouteQualityCardStatRow>
      <RouteQualityCardStatRow label="Vrh:baza" valueClassName="text-ink">
        {r.peakToBaseRatio === null ? "-" : fmtHR(r.peakToBaseRatio, 2)}
      </RouteQualityCardStatRow>
    </div>
  )
}

function RouteQualityCard({ r }: { r: NetworkRoute }) {
  const totalDeps = r.hourlyDepartures.reduce((s, v) => s + v, 0)
  const isNight = totalDeps < 30
  return (
    <div className="isolate flex min-h-0 min-w-0 flex-col overflow-hidden bg-surface p-5">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <span className="inline-flex h-8 w-11 shrink-0 items-center justify-center bg-surface text-head font-bold text-ink-2">
          {r.name}
        </span>
        {isNight && (
          <span className="shrink-0 font-mono text-label text-ink-faint">
            noćna
          </span>
        )}
      </div>
      <RouteQualityCardStats r={r} />
      {r.headwayCv !== null && (
        <div className="mt-2 min-w-0 truncate font-mono text-label text-ink-muted">
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
    <div className="flex flex-col bg-surface p-6 sm:p-7">
      <h3 className="mb-2 font-mono text-label font-bold text-ink-muted">
        Zanimljivosti
      </h3>
      <p className="text-body text-ink-2">
        {insights.mostDirect && insights.mostWinding && (
          <>
            Najizravnija linija je{" "}
            <strong className="font-medium text-ink">
              tramvaj {insights.mostDirect.name}
            </strong>{" "}
            (tortuoznost {fmtHR(insights.mostDirect.tortuosity, 2)}), a
            najkrivudavija{" "}
            <strong className="font-medium text-ink">
              tramvaj {insights.mostWinding.name}
            </strong>{" "}
            ({fmtHR(insights.mostWinding.tortuosity, 2)} -{" "}
            {Math.round((insights.mostWinding.tortuosity - 1) * 100)}% duža od
            ravne linije).
          </>
        )}
        {insights.fastest && insights.slowest && (
          <>
            {" "}
            Korelacija je jasna: linije s većim razmakom stajališta voze brže.{" "}
            <strong className="font-medium text-ink">
              Tramvaj {insights.fastest.name}
            </strong>{" "}
            ({Math.round(insights.fastest.spacing)} m razmak) postiže{" "}
            {fmtHR(insights.fastest.speed, 1)} km/h, dok{" "}
            <strong className="font-medium text-ink">
              tramvaj {insights.slowest.name}
            </strong>{" "}
            ({Math.round(insights.slowest.spacing)} m) ide samo{" "}
            {fmtHR(insights.slowest.speed, 1)} km/h.
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
  routes: Array<NetworkRoute>
  insights: ReturnType<typeof computeInsights>
}) {
  const tramRoutes = routes
    .filter((r) => r.mode === "TRAM")
    .toSorted((a, b) => tramSort(a.name, b.name))

  if (tramRoutes.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <StatModuleTitle>Kvaliteta tramvajskih linija</StatModuleTitle>
          <p className="mt-4 max-w-xl text-body text-ink-2">
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
    <div className="bg-surface p-7 sm:p-8">
      <div className="grid grid-cols-2 gap-6 sm:gap-4">
        <div>
          <div className="font-sans text-head font-bold text-ink tabular-nums">
            {fleet.totalBlocks}
          </div>
          <div className="mt-2 text-body text-ink-muted sm:mt-1">
            ukupno blokova
          </div>
        </div>
        <div>
          <div className="font-sans text-head font-bold text-ink-2 tabular-nums">
            {fleet.interlinedBlocks}
          </div>
          <div className="mt-2 text-body text-ink-muted sm:mt-1">
            interliniranih
          </div>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 border-t border-hairline pt-5 sm:mt-4 sm:gap-6 sm:pt-4">
        <div>
          <span className="font-sans text-head font-bold text-ink tabular-nums">
            {fleet.tramBlocks}
          </span>
          <span className="ml-2 text-body text-ink-muted sm:ml-1.5">
            tramvajskih
          </span>
        </div>
        <div>
          <span className="font-sans text-head font-bold text-ink tabular-nums">
            {fleet.busBlocks}
          </span>
          <span className="ml-2 text-body text-ink-muted sm:ml-1.5">
            autobusnih
          </span>
        </div>
      </div>
    </div>
  )
}

function FleetTopBlocks({ fleet }: { fleet: Fleet }) {
  const topBlocks = fleet.interlinedExamples
    .toSorted((a, b) => b.routes.length - a.routes.length)
    .slice(0, 5)

  return (
    <div className="bg-surface p-5 sm:p-6">
      <div className="mb-3 font-mono text-label font-bold text-ink-muted">
        Najsloženiji blokovi
      </div>
      <div className="space-y-2.5">
        {topBlocks.map((block) => (
          <div
            key={block.blockId}
            className="flex flex-wrap items-center gap-1.5"
          >
            <span className="shrink-0 font-mono text-label text-ink-2 tabular-nums">
              {block.blockId}
            </span>
            <span className="font-mono text-label text-ink-faint">→</span>
            {block.routes.map((route) => (
              <span
                key={route}
                className="inline-flex h-5 items-center bg-track px-1.5 font-mono text-label font-bold text-ink-2 tabular-nums"
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
          <StatModuleTitle>Vozni park i interlining</StatModuleTitle>
          <p className="mt-4 max-w-xl text-body text-ink-2">
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
    <div className="flex flex-col border-l-2 border-zg-blue py-2 pl-6">
      <div className="mb-2 font-mono text-label font-bold text-zg-blue">
        Samo radnim danom
      </div>
      <div className="mb-4 font-sans text-head font-bold text-ink tabular-nums">
        {weekendService.weekdayOnlyCount}{" "}
        <span className="font-sans text-body text-ink-muted">linija</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {weekendService.weekdayOnlyRoutes
          .toSorted((a, b) => {
            const na = Number.parseInt(a, 10),
              nb = Number.parseInt(b, 10)
            if (Number.isNaN(na) && Number.isNaN(nb)) {
              return a.localeCompare(b)
            }
            if (Number.isNaN(na)) {
              return 1
            }
            if (Number.isNaN(nb)) {
              return -1
            }
            return na - nb
          })
          .map((route) => (
            <span
              key={route}
              className="inline-flex h-6 items-center bg-track px-2 font-mono text-label font-bold text-ink-2 tabular-nums"
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
  asymmetry: Array<DirectionalAsymmetryEntry>
  topAsymmetric: Array<DirectionalAsymmetryEntry>
}) {
  return (
    <div className="flex flex-col border-l-2 border-hairline-strong py-2 pl-6">
      <div className="mb-2 font-mono text-label font-bold text-ink-muted">
        Smjerna asimetrija
      </div>
      <div className="mb-4 font-sans text-head font-bold text-ink tabular-nums">
        {asymmetry.length}{" "}
        <span className="font-sans text-body text-ink-muted">linija</span>
      </div>
      <div className="flex flex-col gap-2">
        {topAsymmetric.map((entry) => (
          <div
            key={entry.name}
            className="flex flex-col border-b border-hairline py-3 last:border-0"
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
        <span className="inline-flex h-6 items-center justify-center bg-track px-2 font-mono text-label font-bold text-ink-2">
          {entry.name}
        </span>
        <span className="text-body text-ink-2">
          {entry.outboundTrips} odl. / {entry.inboundTrips} dol.
        </span>
      </div>
      <div className="ml-2 flex items-center gap-2">
        <span className="w-8 text-right font-mono text-label text-ink-muted">
          odl.
        </span>
        <div className="flex-1">
          <div className="h-1.5 bg-ink" style={{ width: `${outPct}%` }} />
        </div>
      </div>
      <div className="ml-2 flex items-center gap-2">
        <span className="w-8 text-right font-mono text-label text-ink-muted">
          dol.
        </span>
        <div className="flex-1">
          <div className="h-1.5 bg-ink-ghost" style={{ width: `${inPct}%` }} />
        </div>
      </div>
    </div>
  )
}

function WeekendAsymmetryInsight({
  weekdayTrams,
  topAsymmetric,
}: {
  weekdayTrams: Array<string>
  topAsymmetric: Array<DirectionalAsymmetryEntry>
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
  asymmetry: Array<DirectionalAsymmetryEntry> | null
}) {
  if (!weekendService && !asymmetry) {
    return null
  }

  const topAsymmetric = asymmetry
    ? asymmetry.toSorted((a, b) => a.ratio - b.ratio).slice(0, 5)
    : []

  const weekdayTrams =
    weekendService?.weekdayOnlyRoutes.filter(
      (r) =>
        Number.parseInt(r, 10) <= 34 && !Number.isNaN(Number.parseInt(r, 10))
    ) ?? []

  return (
    <section className="flex flex-col border-t border-hairline pt-16">
      <div className="mb-12">
        <StatModuleTitle>Vikend i smjerna asimetrija</StatModuleTitle>
        <p className="mt-4 max-w-xl text-body text-ink-2">
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
          <span className="w-12 shrink-0 text-right font-mono text-label text-ink-muted tabular-nums sm:w-10">
            {bucket.label}
          </span>
          <div className="flex-1">
            <div className="flex h-5 items-center gap-px">
              {bucket.tramStops > 0 && (
                <div
                  className="h-full bg-ink-ghost"
                  style={{ width: `${(bucket.tramStops / max) * 100}%` }}
                />
              )}
              {bucket.busStops > 0 && (
                <div
                  className={`h-full bg-blue-pale ${bucket.tramStops === 0 ? "" : ""}`}
                  style={{ width: `${(bucket.busStops / max) * 100}%` }}
                />
              )}
              {bucket.railStops > 0 && (
                <div
                  className="h-full bg-track"
                  style={{ width: `${(bucket.railStops / max) * 100}%` }}
                />
              )}
            </div>
          </div>
          <span className="w-8 text-right font-mono text-label text-ink-faint tabular-nums">
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
    <div className="flex flex-col bg-surface p-5 sm:p-6">
      <div className={`mb-1 font-mono text-label font-bold ${titleColor}`}>
        {title}
      </div>
      <div className="mb-4 text-body text-ink-2">{subtitle}</div>
      <HistogramBars data={data} max={max} />
      <div className="mt-3 flex gap-4 font-mono text-label text-ink-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 bg-ink-ghost" /> tramvaj
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 bg-blue-pale" /> autobus
        </span>
        {hasRail && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 bg-track" /> vlak
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
    <div className="mb-8 grid grid-cols-1 gap-6 bg-surface p-5 sm:grid-cols-3 sm:gap-8 sm:p-6">
      <div className="flex flex-col">
        <div className="font-sans text-head font-bold text-ink-muted tabular-nums">
          {span.firstMorningDeparture}
        </div>
        <div className="mt-2 text-body text-ink-2">prvi jutarnji polazak</div>
        {tramMode && (
          <div className="mt-1 text-body text-ink-muted">
            Tramvaj {tramMode.earliestDeparture} · Autobus{" "}
            {busMode?.earliestDeparture ?? "-"}
          </div>
        )}
      </div>
      <div className="flex flex-col">
        <div className="font-sans text-head font-bold text-zg-blue tabular-nums">
          {span.lastEveningDeparture}
        </div>
        <div className="mt-2 text-body text-ink-2">zadnji večernji polazak</div>
        {tramMode && (
          <div className="mt-1 text-body text-ink-muted">
            Tramvaj {tramMode.latestDeparture} · Autobus{" "}
            {busMode?.latestDeparture ?? "-"}
          </div>
        )}
      </div>
      <div className="flex flex-col">
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          {Math.round(nightGap.pctDarkBy23)}%
        </div>
        <div className="mt-2 text-body text-ink-2">stanica u mraku do 23h</div>
        <div className="mt-1 text-body text-ink-muted">
          {fmtDots(nightGap.stopsDarkBy23)} od {fmtDots(nightGap.totalStops)}{" "}
          stanica
        </div>
      </div>
    </div>
  )
}

function PastMidnightCard({ routes }: { routes: Array<string> }) {
  return (
    <div className="bg-surface p-5 sm:p-6">
      <div className="mb-1 font-mono text-label font-bold text-zg-blue">
        Usluga nakon ponoći
      </div>
      <div className="mb-3 text-body text-ink-muted">
        {routes.length} {plural(routes.length, "linija", "linije", "linija")}{" "}
        čija usluga prelazi ponoć
      </div>
      <div className="flex flex-wrap gap-1.5">
        {routes.slice(0, 30).map((route) => (
          <span
            key={route}
            className="inline-flex h-6 items-center bg-chip-blue px-2 font-mono text-label font-bold text-zg-blue tabular-nums"
          >
            {route}
          </span>
        ))}
        {routes.length > 30 && (
          <span className="inline-flex h-6 items-center px-1 font-mono text-label text-ink-faint">
            +{routes.length - 30}
          </span>
        )}
      </div>
    </div>
  )
}

function EndingBefore23Card({ routes }: { routes: Array<string> }) {
  return (
    <div className="bg-surface p-5 sm:p-6">
      <div className="mb-1 font-mono text-label font-bold text-ink">
        Gašenje prije 23h
      </div>
      <div className="mb-3 text-body text-ink-muted">
        {routes.length}{" "}
        {plural(
          routes.length,
          "linija završava",
          "linije završavaju",
          "linija završava"
        )}{" "}
        radni dan do 23:00
      </div>
      <div className="flex flex-wrap gap-1.5">
        {routes.slice(0, 20).map((route) => (
          <span
            key={route}
            className="inline-flex h-6 items-center bg-surface px-2 font-mono text-label font-bold text-ink tabular-nums"
          >
            {route}
          </span>
        ))}
        {routes.length > 20 && (
          <span className="inline-flex h-6 items-center px-1 font-mono text-label text-ink-faint">
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
          Čak {nightGap.routesEndingBefore23.length}{" "}
          {plural(
            nightGap.routesEndingBefore23.length,
            "linija završava",
            "linije završavaju",
            "linija završava"
          )}{" "}
          uslugu prije 23:00.
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
    <section className="flex flex-col border-t border-hairline pt-16">
      <div className="mb-12">
        <StatModuleTitle>Kad se Zagreb budi i gasi</StatModuleTitle>
        <p className="mt-4 max-w-xl text-body text-ink-2">
          Kada stajalište dobije prvi polazak ujutro, a kada ostaje bez usluge
          navečer. Zagreb ne spava u isto vrijeme - neki kvartovi gube prijevoz
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
          titleColor="text-ink-muted"
          hasRail={hasRail}
        />
        <ServiceHistogram
          data={lastServiceHistogram}
          max={maxLast}
          title="Gašenje mreže"
          subtitle="Kada stanice gube zadnji polazak navečer"
          titleColor="text-zg-blue"
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
  if (waitMin < 3) {
    return "text-zg-blue"
  }
  if (waitMin <= 6) {
    return "text-ink-muted"
  }
  return "text-ink"
}

function pulseWaitBg(waitMin: number): string {
  if (waitMin < 3) {
    return "bg-track text-ink-2"
  }
  if (waitMin <= 6) {
    return "bg-hairline-strong text-ink"
  }
  return "bg-ink-ghost text-ink"
}

function PulseHubRow({ hub }: { hub: PulseHub }) {
  return (
    <tr className="border-b border-hairline last:border-0">
      <td className="py-3 pr-4 text-left">
        <div className="text-body text-ink">{hub.stopName}</div>
      </td>
      <td className="py-3 pr-4 text-center">
        <span className="font-sans text-body text-ink tabular-nums">
          {hub.routeCount}
        </span>
      </td>
      <td className="py-3 pr-4">
        <div className="flex flex-wrap gap-1">
          {hub.routes.slice(0, 8).map((route) => (
            <span
              key={route}
              className="inline-flex h-5 items-center bg-track px-1.5 font-mono text-label font-bold text-ink-2 tabular-nums"
            >
              {route}
            </span>
          ))}
          {hub.routes.length > 8 && (
            <span className="font-mono text-label text-ink-faint">
              +{hub.routes.length - 8}
            </span>
          )}
        </div>
      </td>
      <td className="py-3 pr-4 text-center">
        <span
          className={`inline-flex h-6 items-center px-2 font-mono text-label font-bold tabular-nums ${pulseWaitBg(hub.avgTransferWaitMin)}`}
        >
          {fmtHR(hub.avgTransferWaitMin, 1)} min
        </span>
      </td>
      <td className="py-3 text-center">
        <span className="font-mono text-label text-ink-2 tabular-nums">
          {hub.bestHour}:00
        </span>
        <span
          className={`ml-1.5 font-mono text-label tabular-nums ${pulseWaitColor(hub.bestHourWaitMin)}`}
        >
          ({fmtHR(hub.bestHourWaitMin, 1)} min)
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
  if (wait < 0) {
    return "transparent"
  }
  const t = Math.min(wait / maxWait, 1)
  if (t < 0.33) {
    return "var(--hairline-strong)"
  }
  if (t < 0.55) {
    return "var(--ink-faint)"
  }
  if (t < 0.77) {
    return "var(--ink-muted)"
  }
  return "var(--ink)"
}

function PulseHeatmapCells({
  topHubs,
  maxWait,
}: {
  topHubs: Array<PulseHub>
  maxWait: number
}) {
  return (
    <>
      {topHubs.map((hub, ri) =>
        hub.hourlyWait.map((wait, ci) => (
          <rect
            // oxlint-disable-next-line react/no-array-index-key -- ci is the hour of day, a stable column identity
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
              // oxlint-disable-next-line react/no-array-index-key -- ci is the hour of day, a stable column identity
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
                  ? "fill-ink font-mono text-label"
                  : "fill-white/90 font-mono text-label"
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

function PulseHeatmap({ hubs }: { hubs: Array<PulseHub> }) {
  const topHubs = hubs.slice(0, 5)
  if (topHubs.length === 0) {
    return null
  }

  const hours = Array.from({ length: 19 }, (_, i) => i + 5)
  const allWaits = topHubs.flatMap((h) => h.hourlyWait.filter((v) => v >= 0))
  const maxWait = Math.max(...allWaits, 1)
  const svgW = PULSE_LABEL_W + hours.length * (PULSE_CELL_W + PULSE_GAP)
  const svgH = topHubs.length * (PULSE_CELL_H + PULSE_GAP) + 24

  return (
    <div className="sm: mt-6 w-full overflow-x-auto overscroll-x-contain border border-hairline-strong bg-track p-4 [-webkit-overflow-scrolling:touch] sm:p-8">
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="mx-auto block w-full max-w-none shrink-0 sm:w-auto sm:max-w-full"
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
            className="fill-ink-muted font-mono text-label"
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
              className="fill-ink-muted font-mono text-label"
            >
              {h}h
            </text>
          ))}
      </svg>
    </div>
  )
}

function PulseHubsTable({ hubs }: { hubs: Array<PulseHub> }) {
  return (
    <div className="sm: overflow-x-auto overscroll-x-contain border border-hairline-strong bg-track [-webkit-overflow-scrolling:touch]">
      <table className="w-full min-w-[640px] text-left">
        <thead>
          <tr className="border-b border-hairline">
            <th className="px-6 py-3 font-mono text-label font-bold text-ink-muted">
              Stajalište
            </th>
            <th className="px-4 py-3 text-center font-mono text-label font-bold text-ink-muted">
              Linije
            </th>
            <th className="px-4 py-3 font-mono text-label font-bold text-ink-muted">
              Rute
            </th>
            <th className="px-4 py-3 text-center font-mono text-label font-bold text-ink-muted">
              Prosj. čekanje
            </th>
            <th className="px-4 py-3 text-center font-mono text-label font-bold text-ink-muted">
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
  hubs: Array<PulseHub>
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
        {fmtHR(bestHub.avgTransferWaitMin, 1)} minuta. Ukupni prosjek od{" "}
        {fmtHR(avgWait, 1)} minuta sugerira da postoji određena koordinacija,
        ali ne sustavni pulse.
      </Insight>
    )
  }
  return (
    <Insight>
      Zagreb ne koristi pulse scheduling - prosječno čekanje na presjedanje na
      velikim čvorištima iznosi <strong>{fmtHR(avgWait, 1)} minuta</strong>.
      Presjedanja su uglavnom prepuštena slučaju, što je tipično za mreže s
      kratkim intervalima. Najbolje sinkronizirano čvorište je{" "}
      <strong>{bestHub.stopName}</strong> s prosječnim čekanjem od{" "}
      {fmtHR(bestHub.avgTransferWaitMin, 1)} minuta.
    </Insight>
  )
}

function PulseSchedulingSection({ hubs }: { hubs: Array<PulseHub> }) {
  if (hubs.length === 0) {
    return null
  }

  const avgWait =
    hubs.reduce((s, h) => s + h.avgTransferWaitMin, 0) / hubs.length
  const bestHub = hubs.toSorted(
    (a, b) => a.avgTransferWaitMin - b.avgTransferWaitMin
  )[0]
  const pulsedCount = hubs.filter((h) => h.bestHourWaitMin < 5).length

  return (
    <section className="flex flex-col border-t border-hairline pt-16">
      <div className="mb-12">
        <StatModuleTitle>Pulse scheduling</StatModuleTitle>
        <p className="mt-4 max-w-xl text-body text-ink-2">
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
  const data = readJsonCached<NetworkStatsOutput>(
    join(getDataDir(), "network-stats.json")
  )
  if (!data) {
    return null
  }

  const routeStats = loadRouteStats()
  const insights = computeInsights(data, routeStats)

  return (
    <section
      id="mreza"
      className="flex min-w-0 flex-col border-t border-hairline py-14 sm:py-24"
    >
      <div className="mb-10 flex flex-col gap-4 sm:mb-12 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <StatModuleTitle>Analiza mreže</StatModuleTitle>
          <p className="mt-4 max-w-xl text-body text-ink-2">
            Detaljan pregled rasporeda, kapaciteta i karakteristika voznog reda
            zagrebačkog javnog prijevoza.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-16">
        <NetworkOverview data={data} />
        <CollapsibleContent
          expandLabel="Prikaži detaljnu analizu mreže"
          collapseLabel="Suzi analizu mreže"
        >
          <div className="flex flex-col gap-16">
            <HourlyHeatmap routes={data.routes} insights={insights} />
            <RouteQualityCards routes={data.routes} insights={insights} />
            {data.fleet && (
              <FleetSection fleet={data.fleet} insights={insights} />
            )}
            <WeekendAsymmetrySection
              weekendService={data.weekendService}
              asymmetry={data.directionalAsymmetry}
            />
            {data.serviceSpan && <ServiceSpanSection span={data.serviceSpan} />}
            {data.pulseHubs.length > 0 && (
              <PulseSchedulingSection hubs={data.pulseHubs} />
            )}
          </div>
        </CollapsibleContent>
      </div>
    </section>
  )
}
