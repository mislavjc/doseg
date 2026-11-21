"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { pickPreferredRoute } from "@/lib/format"
import { Term } from "@/components/ui/term"
import { StatModuleLead, StatModuleTitle } from "./stat-typography"
import { scaleLinear, scaleTime } from "@visx/scale"
import { plural } from "@/app/linije/copy"
import {
  ChartGrid,
  ChartSvg,
  ChartYLabels,
  computeBarLayout,
  HitAreas,
  INNER_HEIGHT,
  MARGIN,
  SvgTooltip,
  TimeBars,
} from "./time-chart"

// --- Types ---

interface HistoryPoint {
  ts: number
  avgDelay: number
  maxDelay: number
  onTimePct: number
  tripCount: number
  headwaySec?: number
  headwayCv?: number
}

interface HistoryResponse {
  route: string
  from: number
  to: number
  points: Array<HistoryPoint>
}

interface RouteOption {
  name: string
  mode: string
}

type TimeRange = "24h" | "7d" | "30d"

const TIME_RANGES: Array<TimeRange> = ["24h", "7d", "30d"]

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  "24h": "24 sata",
  "7d": "7 dana",
  "30d": "30 dana",
}

const TIME_RANGE_SECONDS: Record<TimeRange, number> = {
  "24h": 86_400,
  "7d": 7 * 86_400,
  "30d": 30 * 86_400,
}

// --- Helpers ---

function aggregateBucket(chunk: Array<HistoryPoint>): HistoryPoint {
  const ts = chunk[Math.floor(chunk.length / 2)].ts
  const sumTrips = chunk.reduce((sum, p) => sum + p.tripCount, 0)
  let sumDelay = 0,
    sumOnTime = 0,
    maxDelay = -Infinity
  let sumHeadwaySec = 0,
    sumHeadwayCv = 0,
    headwaySamples = 0

  for (const p of chunk) {
    const w = p.tripCount || 1
    sumDelay += p.avgDelay * w
    sumOnTime += p.onTimePct * w
    maxDelay = Math.max(maxDelay, p.maxDelay)
    if (p.headwayCv !== undefined && p.headwaySec !== undefined) {
      sumHeadwaySec += p.headwaySec * w
      sumHeadwayCv += p.headwayCv * w
      headwaySamples += w
    }
  }

  const weight = sumTrips > 0 ? sumTrips : chunk.length
  return {
    ts,
    avgDelay: sumDelay / weight,
    maxDelay,
    onTimePct: sumOnTime / weight,
    tripCount: sumTrips,
    ...(headwaySamples > 0 && {
      headwaySec: sumHeadwaySec / headwaySamples,
      headwayCv: sumHeadwayCv / headwaySamples,
    }),
  }
}

function downsamplePoints(
  points: Array<HistoryPoint>,
  maxPoints: number
): Array<HistoryPoint> {
  if (points.length <= maxPoints) {
    return points
  }

  const tMin = points[0].ts
  const tMax = points[points.length - 1].ts
  const span = tMax - tMin
  if (span <= 0) {
    return points
  }

  const bucketDuration = span / maxPoints
  const buckets: Array<Array<HistoryPoint>> = Array.from(
    { length: maxPoints },
    () => []
  )
  for (const p of points) {
    const idx = Math.min(
      Math.floor((p.ts - tMin) / bucketDuration),
      maxPoints - 1
    )
    buckets[idx].push(p)
  }

  return buckets.flatMap((b) => (b.length > 0 ? [aggregateBucket(b)] : []))
}

/** Detailed delay format with seconds remainder: "3 min 12 s" (for stat headers). */
function fmtDelayDetailed(seconds: number): string {
  if (Math.abs(seconds) < 60) {
    return `${Math.round(seconds)} s`
  }
  const min = Math.floor(Math.abs(seconds) / 60)
  const sec = Math.round(Math.abs(seconds) % 60)
  const sign = seconds < 0 ? "-" : ""
  return sec > 0 ? `${sign}${min} min ${sec} s` : `${sign}${min} min`
}

function fmtTime(ts: number, range: TimeRange): string {
  const d = new Date(ts * 1000)
  if (range === "24h") {
    return d.toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" })
  }
  return d.toLocaleDateString("hr-HR", { day: "numeric", month: "short" })
}

function fmtTooltipTime(ts: number, range: TimeRange): string {
  const d = new Date(ts * 1000)
  if (range === "24h") {
    return d.toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" })
  }
  return d.toLocaleString("hr-HR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function useHistoryFetch(route: string, timeRange: TimeRange) {
  const key = route ? `rt-history:${route}:${timeRange}` : null
  const { data, error, isLoading } = useSWR<HistoryResponse, Error>(
    key,
    () => {
      const now = Math.floor(Date.now() / 1000)
      const from = now - TIME_RANGE_SECONDS[timeRange]
      return fetch(
        `/api/rt/history?route=${encodeURIComponent(route)}&from=${from}&to=${now}`
      ).then((r) => {
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}`)
        }
        return r.json()
      })
    },
    { keepPreviousData: true }
  )
  return {
    data: data ?? null,
    error: error ? error.message : null,
    isLoading,
  }
}

// --- Component ---

export default function PunctualitySection({
  routes,
}: {
  routes: Array<RouteOption>
}) {
  const [selectedRoute, setSelectedRoute] = useState(() =>
    pickPreferredRoute(routes.map((r) => r.name))
  )
  const [timeRange, setTimeRange] = useState<TimeRange>("24h")
  const { data, error } = useHistoryFetch(selectedRoute, timeRange)

  return (
    <section
      id="tocnost"
      className="flex flex-col border-t border-slate-200 py-16 sm:py-24 dark:border-white/10"
    >
      <PunctualityHeader />
      <PunctualityControls
        routes={routes}
        selectedRoute={selectedRoute}
        onRouteChange={setSelectedRoute}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
      />
      <PunctualityContent data={data} error={error} timeRange={timeRange} />
    </section>
  )
}

// --- Header & Controls ---

function PunctualityHeader() {
  return (
    <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <StatModuleTitle>Praćenje u stvarnom vremenu</StatModuleTitle>
        <StatModuleLead>
          Točnost dolazaka po liniji: prosječno kašnjenje, postotak vozila na
          vrijeme (−1 do +5 min) i regularnost razmaka (koliko ravnomjerno
          dolaze vozila).
        </StatModuleLead>
      </div>
    </div>
  )
}

function PunctualityControls({
  routes,
  selectedRoute,
  onRouteChange,
  timeRange,
  onTimeRangeChange,
}: {
  routes: Array<RouteOption>
  selectedRoute: string
  onRouteChange: (v: string) => void
  timeRange: TimeRange
  onTimeRangeChange: (v: TimeRange) => void
}) {
  return (
    <div className="mb-12 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
      <RouteSelector
        routes={routes}
        value={selectedRoute}
        onChange={onRouteChange}
      />
      <span className="hidden h-5 w-px bg-slate-200 sm:block dark:bg-white/10" />
      <TimeRangeSelector value={timeRange} onChange={onTimeRangeChange} />
    </div>
  )
}

function PunctualityContent({
  data,
  error,
  timeRange,
}: {
  data: HistoryResponse | null
  error: string | null
  timeRange: TimeRange
}) {
  const points = useMemo(
    () => (data ? downsamplePoints(data.points, 24) : []),
    [data]
  )

  if (error) {
    return <ErrorState message={error} />
  }
  if (!data) {
    return <LoadingState />
  }
  if (data.points.length === 0) {
    return <EmptyState />
  }
  const hasHeadway = points.some((p) => p.headwayCv !== undefined)
  return (
    <div className="flex flex-col gap-6">
      <DelayChart points={points} timeRange={timeRange} />
      {hasHeadway && <HeadwayChart points={points} timeRange={timeRange} />}
    </div>
  )
}

const ROUTE_GROUPS: Array<{ mode: string; label: string }> = [
  { mode: "TRAM", label: "Tramvaj" },
  { mode: "BUS", label: "Bus" },
]

const SELECT_CHEVRON_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m2 3.5 3 3 3-3'/%3E%3C/svg%3E")`

function RouteSelector({
  routes,
  value,
  onChange,
}: {
  routes: Array<RouteOption>
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/50 py-1 pr-1 pl-3.5 dark:border-white/10 dark:bg-zinc-900/50">
      <label
        htmlFor="punctuality-route"
        className="pointer-events-none flex items-center gap-1.5 font-mono text-label text-slate-500 dark:text-slate-400"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-60"
          aria-hidden="true"
        >
          <path d="M8 6v6M15 6v6M2 12h19.6M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H6C4.9 6 3.9 6.8 3.6 7.8l-1.4 5c-.1.4-.2.8-.2 1.2 0 .4.1.8.2 1.2C2.5 16.3 3 18 3 18h3M7 18v2M17 18v2" />
        </svg>
        Linija
      </label>
      <select
        id="punctuality-route"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[80px] cursor-pointer appearance-none rounded-full border-0 bg-slate-900 py-1.5 pr-7 pl-3 font-mono text-label text-white shadow-sm transition-all hover:bg-slate-800 focus:ring-2 focus:ring-indigo-400/40 focus:ring-offset-1 focus:outline-none sm:min-w-[100px] dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white dark:focus:ring-indigo-500/40"
        style={{
          backgroundImage: SELECT_CHEVRON_SVG,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 10px center",
        }}
      >
        {ROUTE_GROUPS.map(({ mode, label }) => {
          const group = routes.filter((r) => r.mode === mode)
          if (group.length === 0) {
            return null
          }
          return (
            <optgroup key={mode} label={label}>
              {group.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name}
                </option>
              ))}
            </optgroup>
          )
        })}
      </select>
    </div>
  )
}

function TimeRangeSelector({
  value,
  onChange,
}: {
  value: TimeRange
  onChange: (v: TimeRange) => void
}) {
  return (
    <div className="flex gap-1 rounded-full border border-slate-200 bg-white/50 p-1 dark:border-white/10 dark:bg-zinc-900/50">
      {TIME_RANGES.map((range) => (
        <button
          type="button"
          key={range}
          onClick={() => onChange(range)}
          className={`rounded-full px-4 py-1.5 font-mono text-label transition-colors ${
            value === range
              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
        >
          {TIME_RANGE_LABELS[range]}
        </button>
      ))}
    </div>
  )
}

// --- State components ---

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="flex items-center gap-3 text-body text-slate-500 dark:text-slate-400">
        <LoadingSpinner />
        Učitavanje podataka...
      </div>
    </div>
  )
}

function LoadingSpinner() {
  return (
    <svg
      className="h-5 w-5 animate-spin text-sky-500"
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label="Loading"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="opacity-25"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-red-200 bg-red-50/50 p-12 text-center dark:border-red-900/20 dark:bg-red-900/10">
      <p className="text-body text-red-600 dark:text-red-400">
        Nije moguće dohvatiti podatke: {message}
      </p>
      <p className="mt-2 text-body text-red-500/70 dark:text-red-500/50">
        Provjeri je li backend pokrenut.
      </p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-slate-100 p-12 text-center dark:border-white/10 dark:bg-zinc-800/60">
      <p className="text-body text-slate-600 dark:text-slate-400">
        Nema podataka za odabrani period.
      </p>
      <p className="mt-2 text-body text-slate-500 dark:text-slate-500">
        Podaci se prikupljaju u stvarnom vremenu iz{" "}
        <Term title="General Transit Feed Specification - Real Time: međunarodni standard za podatke o javnom prijevozu">
          GTFS-RT
        </Term>{" "}
        feed-a.
      </p>
    </div>
  )
}

// --- Charts ---

const CHART_WIDTH = 700
const INNER_WIDTH = CHART_WIDTH - MARGIN.left - MARGIN.right

const delayColor = (delay: number) => (delay < 180 ? "#10b981" : "#f59e0b")
const cvColor = (cv: number) =>
  cv < 0.3 ? "#10b981" : cv < 0.5 ? "#f59e0b" : "#ef4444"

function fmtDelayAxis(v: number): string {
  if (v === 0) {
    return "0m"
  }
  const m = Math.round(v / 60)
  if (m >= 60 && m % 60 === 0) {
    return `${m / 60}h`
  }
  if (m > 60) {
    return `${Math.floor(m / 60)}h ${m % 60}m`
  }
  return `${m}m`
}

function useDelayScales(points: Array<HistoryPoint>) {
  return useMemo(() => {
    const tsMin = points.reduce((m, p) => Math.min(m, p.ts), Infinity)
    const tsMax = points.reduce((m, p) => Math.max(m, p.ts), -Infinity)
    const maxD = points.reduce((m, p) => Math.max(m, p.avgDelay), 60)
    const minD = points.reduce((m, p) => Math.min(m, p.avgDelay), 0)
    const xScale = scaleTime<number>({
      domain: [new Date(tsMin * 1000), new Date(tsMax * 1000)],
      range: [0, INNER_WIDTH],
    })
    const yScale = scaleLinear<number>({
      domain: [minD < 0 ? minD * 1.15 : 0, maxD * 1.15],
      range: [INNER_HEIGHT, 0],
      nice: true,
    })
    const xTicks = xScale.ticks(5)
    const yTicks = yScale.ticks(5)
    const totalTrips = points.reduce((s, p) => s + p.tripCount, 0)
    const avgDelay =
      points.reduce((s, p) => s + p.avgDelay * p.tripCount, 0) /
      Math.max(totalTrips, 1)
    const maxDelaySec = points.reduce((m, p) => Math.max(m, p.maxDelay), 0)
    const maxTrips = points.reduce((m, p) => Math.max(m, p.tripCount), 0)
    return {
      xScale,
      yScale,
      xTicks,
      yTicks,
      avgDelay,
      maxDelaySec,
      totalTrips,
      maxTrips,
    }
  }, [points])
}

function DelayChartBody({
  points,
  timeRange,
  hovered,
  onHover,
}: {
  points: Array<HistoryPoint>
  timeRange: TimeRange
  hovered: HistoryPoint | null
  onHover: (p: HistoryPoint | null) => void
}) {
  const { xScale, yScale, xTicks, yTicks } = useDelayScales(points)
  const { gap, barWidth } = computeBarLayout(points, xScale, 8, 0.4)

  return (
    <ChartSvg width={CHART_WIDTH} label="Grafikon prosječnog kašnjenja">
      <ChartGrid yScale={yScale} yTicks={yTicks} innerWidth={INNER_WIDTH} />
      {yTicks[0] < 0 && (
        <line
          x1={0}
          y1={yScale(0) ?? 0}
          x2={INNER_WIDTH}
          y2={yScale(0) ?? 0}
          stroke="#94a3b8"
          strokeWidth={1}
          strokeOpacity={0.2}
        />
      )}

      <TimeBars
        points={points}
        xScale={xScale}
        yScale={yScale}
        barWidth={barWidth}
        hovered={hovered}
        value={(p) => Math.max(0, p.avgDelay)}
        color={delayColor}
      />
      <HitAreas points={points} xScale={xScale} gap={gap} onHover={onHover} />

      <ChartXLabels ticks={xTicks} xScale={xScale} timeRange={timeRange} />
      <ChartYLabels
        ticks={yTicks}
        yScale={yScale}
        innerWidth={INNER_WIDTH}
        format={fmtDelayAxis}
      />

      {hovered && (
        <SvgTooltip
          x={xScale(new Date(hovered.ts * 1000)) ?? 0}
          y={(yScale(Math.max(0, hovered.avgDelay)) ?? 0) - 10}
          innerWidth={INNER_WIDTH}
          title={fmtTooltipTime(hovered.ts, timeRange)}
          value={fmtDelayDetailed(hovered.avgDelay)}
          subtitle={`${hovered.tripCount} ${plural(hovered.tripCount, "polazak", "polaska", "polazaka")}`}
          color={delayColor(hovered.avgDelay)}
        />
      )}
    </ChartSvg>
  )
}

function DelayChart({
  points,
  timeRange,
}: {
  points: Array<HistoryPoint>
  timeRange: TimeRange
}) {
  const [hovered, setHovered] = useState<HistoryPoint | null>(null)

  return (
    <div className="rounded-[12px] bg-[#f9f9f9] p-3 sm:p-5 dark:bg-[#1a1a1a]">
      <DelayChartHeader points={points} />
      <div className="mt-8 mb-4">
        <h4 className="flex items-center gap-2 text-body text-slate-500 dark:text-slate-400">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500"
            aria-hidden="true"
          />
          Uživo kašnjenje u prometu
        </h4>
      </div>
      <div className="w-full">
        <DelayChartBody
          points={points}
          timeRange={timeRange}
          hovered={hovered}
          onHover={setHovered}
        />
      </div>
    </div>
  )
}

function DelayChartHeader({ points }: { points: Array<HistoryPoint> }) {
  const totalTrips = points.reduce((s, p) => s + p.tripCount, 0)
  const onTimeTrips = Math.round(
    points.reduce((s, p) => s + p.onTimePct * p.tripCount, 0)
  )
  const delayedTrips = Math.max(0, totalTrips - onTimeTrips)

  const onTimePct =
    totalTrips > 0 ? Math.round((onTimeTrips / totalTrips) * 100) : 0
  const delayedPct = totalTrips > 0 ? 100 - onTimePct : 0

  return (
    <div className="flex flex-col">
      <h3 className="mb-6 font-mono text-label font-bold text-slate-500 dark:text-slate-400">
        Točnost polazaka
      </h3>

      <div className="mb-5 flex flex-wrap gap-4 sm:gap-8">
        <div className="flex flex-col">
          <div className="mb-1 flex items-center gap-1.5 text-body text-slate-500">
            <span className="h-3 w-1 rounded-full bg-[#10b981]"></span>
            Na vrijeme
          </div>
          <span className="mb-1 font-sans text-head font-bold text-slate-900 dark:text-slate-100">
            {onTimePct}%
          </span>
          <span className="text-body text-slate-500">
            {onTimeTrips.toLocaleString("hr-HR")}
          </span>
        </div>

        <div className="flex flex-col">
          <div className="mb-1 flex items-center gap-1.5 text-body text-slate-500">
            <span className="h-3 w-1 rounded-full bg-[#f59e0b]"></span>
            Kašnjenje
          </div>
          <span className="mb-1 font-sans text-head font-bold text-slate-900 dark:text-slate-100">
            {delayedPct}%
          </span>
          <span className="text-body text-slate-500">
            {delayedTrips.toLocaleString("hr-HR")}
          </span>
        </div>
      </div>

      <div className="flex h-1.5 w-full gap-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full bg-[#10b981] transition-all duration-500"
          style={{ width: `${onTimePct}%` }}
        />
        <div
          className="h-full bg-[#f59e0b] transition-all duration-500"
          style={{ width: `${delayedPct}%` }}
        />
      </div>
    </div>
  )
}

// --- Headway chart ---

function useHeadwayScales(points: Array<HistoryPoint>) {
  return useMemo(() => {
    const pts = points.filter((p) => p.headwayCv !== undefined)
    if (pts.length === 0) {
      return null
    }
    const tsMin = pts.reduce((m, p) => Math.min(m, p.ts), Infinity)
    const tsMax = pts.reduce((m, p) => Math.max(m, p.ts), -Infinity)
    const maxCv = pts.reduce((m, p) => Math.max(m, p.headwayCv ?? 0), 0.6)
    const xScale = scaleTime<number>({
      domain: [new Date(tsMin * 1000), new Date(tsMax * 1000)],
      range: [0, INNER_WIDTH],
    })
    const yScale = scaleLinear<number>({
      domain: [0, Math.min(maxCv * 1.2, 1.5)],
      range: [INNER_HEIGHT, 0],
      nice: true,
    })
    const xTicks = xScale.ticks(5)
    const yTicks = yScale.ticks(5)

    const totalTrips = pts.reduce((s, p) => s + p.tripCount, 0)
    const avgHeadway =
      pts.reduce((s, p) => s + (p.headwaySec ?? 0) * p.tripCount, 0) /
      Math.max(totalTrips, 1)
    const avgCv =
      pts.reduce((s, p) => s + (p.headwayCv ?? 0) * p.tripCount, 0) /
      Math.max(totalTrips, 1)

    const maxTrips = pts.reduce((m, p) => Math.max(m, p.tripCount), 0)
    return {
      xScale,
      yScale,
      xTicks,
      yTicks,
      avgHeadway,
      avgCv,
      totalTrips,
      maxTrips,
      pts,
    }
  }, [points])
}

function HeadwayChartBody({
  pts,
  timeRange,
  hovered,
  onHover,
  xScale,
  yScale,
  xTicks,
  yTicks,
}: {
  pts: Array<HistoryPoint>
  timeRange: TimeRange
  hovered: HistoryPoint | null
  onHover: (p: HistoryPoint | null) => void
  xScale: ReturnType<typeof scaleTime<number>>
  yScale: ReturnType<typeof scaleLinear<number>>
  xTicks: Array<Date>
  yTicks: Array<number>
  maxTrips: number
}) {
  const { gap, barWidth } = computeBarLayout(pts, xScale, 8, 0.4)

  return (
    <ChartSvg width={CHART_WIDTH} label="Grafikon regularnosti razmaka">
      <ChartGrid yScale={yScale} yTicks={yTicks} innerWidth={INNER_WIDTH} />
      <RegularityZone yScale={yScale} />

      <TimeBars
        points={pts}
        xScale={xScale}
        yScale={yScale}
        barWidth={barWidth}
        hovered={hovered}
        value={(p) => p.headwayCv ?? 0}
        color={cvColor}
      />
      <HitAreas points={pts} xScale={xScale} gap={gap} onHover={onHover} />

      <ChartXLabels ticks={xTicks} xScale={xScale} timeRange={timeRange} />
      <ChartYLabels
        ticks={yTicks}
        yScale={yScale}
        innerWidth={INNER_WIDTH}
        format={(v) => v.toFixed(1)}
      />

      {hovered && (
        <SvgTooltip
          x={xScale(new Date(hovered.ts * 1000)) ?? 0}
          y={(yScale(hovered.headwayCv ?? 0) ?? 0) - 10}
          innerWidth={INNER_WIDTH}
          title={fmtTooltipTime(hovered.ts, timeRange)}
          value={`CV ${hovered.headwayCv?.toFixed(2)}`}
          subtitle={
            hovered.headwaySec !== undefined && hovered.headwaySec !== 0
              ? `razmak ${Math.round(hovered.headwaySec / 60)} min`
              : undefined
          }
          color={cvColor(hovered.headwayCv ?? 0)}
        />
      )}
    </ChartSvg>
  )
}

function HeadwayChart({
  points,
  timeRange,
}: {
  points: Array<HistoryPoint>
  timeRange: TimeRange
}) {
  const [hovered, setHovered] = useState<HistoryPoint | null>(null)
  const scales = useHeadwayScales(points)
  if (!scales) {
    return null
  }
  const { xScale, yScale, xTicks, yTicks, avgHeadway, avgCv, maxTrips, pts } =
    scales

  return (
    <div className="rounded-[12px] bg-[#f9f9f9] p-3 sm:p-5 dark:bg-[#1a1a1a]">
      <HeadwayChartHeader avgHeadway={avgHeadway} avgCv={avgCv} />
      <div className="mt-8 mb-4">
        <h4 className="flex items-center gap-2 text-body text-slate-500 dark:text-slate-400">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500"
            aria-hidden="true"
          />
          Varijacija razmaka uživo
        </h4>
      </div>
      <div className="w-full">
        <HeadwayChartBody
          pts={pts}
          timeRange={timeRange}
          hovered={hovered}
          onHover={setHovered}
          xScale={xScale}
          yScale={yScale}
          xTicks={xTicks}
          yTicks={yTicks}
          maxTrips={maxTrips}
        />
      </div>
    </div>
  )
}

function RegularityZone({
  yScale,
}: {
  yScale: ReturnType<typeof scaleLinear<number>>
}) {
  const y03 = yScale(0.3) ?? 0
  return (
    <>
      <rect
        x={0}
        y={y03}
        width={INNER_WIDTH}
        height={Math.max(0, (yScale(0) ?? 0) - y03)}
        fill="#94a3b8"
        fillOpacity={0.06}
      />
      <line
        x1={0}
        y1={y03}
        x2={INNER_WIDTH}
        y2={y03}
        stroke="#94a3b8"
        strokeWidth={1}
        strokeDasharray="4 3"
        strokeOpacity={0.35}
      />
      <text
        x={INNER_WIDTH - 2}
        y={y03 - 4}
        textAnchor="end"
        className="fill-slate-400/80 font-mono text-label dark:fill-slate-500"
      >
        dobra regularnost
      </text>
    </>
  )
}

function HeadwayChartHeader({
  avgHeadway,
  avgCv,
}: {
  avgHeadway: number
  avgCv: number
}) {
  const quality = avgCv < 0.3 ? "odlična" : avgCv < 0.5 ? "umjerena" : "loša"
  const qualityColor =
    avgCv < 0.3
      ? "text-[#10b981]"
      : avgCv < 0.5
        ? "text-[#f59e0b]"
        : "text-[#ef4444]"

  return (
    <div className="flex flex-col">
      <h3 className="mb-6 font-mono text-label font-bold text-slate-500 dark:text-slate-400">
        Regularnost razmaka
      </h3>

      <div className="mb-5 flex flex-wrap gap-4 sm:gap-8">
        <div className="flex flex-col">
          <div className="mb-1 flex items-center gap-1.5 text-body text-slate-500">
            Kvaliteta
          </div>
          <span
            className={`mb-1 font-sans text-head font-bold capitalize ${qualityColor}`}
          >
            {quality}
          </span>
        </div>

        <div className="flex flex-col">
          <div className="mb-1 flex items-center gap-1.5 text-body text-slate-500">
            <Term title="Koeficijent varijacije - niži broj znači pravilniji razmak između vozila">
              CV
            </Term>
          </div>
          <span className="mb-1 font-sans text-head font-bold text-slate-900 dark:text-slate-100">
            {avgCv.toFixed(2)}
          </span>
          <span className="text-body text-slate-500">
            {avgHeadway >= 60
              ? `${Math.round(avgHeadway / 60)} min prosjek`
              : `${Math.round(avgHeadway)} s prosjek`}
          </span>
        </div>
      </div>
    </div>
  )
}

// --- Shared chart primitives ---

function ChartXLabels({
  ticks,
  xScale,
  timeRange,
}: {
  ticks: Array<Date>
  xScale: ReturnType<typeof scaleTime<number>>
  timeRange: TimeRange
}) {
  return (
    <>
      {ticks.map((t) => (
        <text
          key={t.getTime()}
          x={xScale(t)}
          y={INNER_HEIGHT + 24}
          textAnchor="middle"
          className="fill-slate-500 font-mono text-label dark:fill-slate-400"
        >
          {fmtTime(t.getTime() / 1000, timeRange)}
        </text>
      ))}
    </>
  )
}
