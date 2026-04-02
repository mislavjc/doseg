"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { pickPreferredRoute } from "@/lib/format"
import { Term } from "@/components/ui/term"
import {
  StatModuleLead,
  StatModuleTitle,
} from "./stat-typography"
import { scaleLinear, scaleTime } from "@visx/scale"
import { Group } from "@visx/group"
import { BarRounded } from "@visx/shape"
import { GridRows } from "@visx/grid"

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
  points: HistoryPoint[]
}

interface RouteOption {
  name: string
  mode: string
}

type TimeRange = "24h" | "7d" | "30d"

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  "24h": "24 sata",
  "7d": "7 dana",
  "30d": "30 dana",
}

const TIME_RANGE_SECONDS: Record<TimeRange, number> = {
  "24h": 86400,
  "7d": 7 * 86400,
  "30d": 30 * 86400,
}

// --- Helpers ---

function aggregateBucket(chunk: HistoryPoint[]): HistoryPoint {
  const ts = chunk[Math.floor(chunk.length / 2)].ts
  const sumTrips = chunk.reduce((sum, p) => sum + p.tripCount, 0)
  let sumDelay = 0, sumOnTime = 0, maxDelay = -Infinity
  let sumHeadwaySec = 0, sumHeadwayCv = 0, headwaySamples = 0

  for (const p of chunk) {
    const w = p.tripCount || 1
    sumDelay += p.avgDelay * w
    sumOnTime += p.onTimePct * w
    maxDelay = Math.max(maxDelay, p.maxDelay)
    if (p.headwayCv != null && p.headwaySec != null) {
      sumHeadwaySec += p.headwaySec * w
      sumHeadwayCv += p.headwayCv * w
      headwaySamples += w
    }
  }

  const weight = sumTrips || chunk.length
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

function downsamplePoints(points: HistoryPoint[], maxPoints: number): HistoryPoint[] {
  if (points.length <= maxPoints) return points

  const tMin = points[0].ts
  const tMax = points[points.length - 1].ts
  const span = tMax - tMin
  if (span <= 0) return points

  const bucketDuration = span / maxPoints
  const buckets: HistoryPoint[][] = Array.from({ length: maxPoints }, () => [])
  for (const p of points) {
    const idx = Math.min(Math.floor((p.ts - tMin) / bucketDuration), maxPoints - 1)
    buckets[idx].push(p)
  }

  return buckets.filter((b) => b.length > 0).map(aggregateBucket)
}

/** Detailed delay format with seconds remainder: "3 min 12 s" (for stat headers). */
function fmtDelayDetailed(seconds: number): string {
  if (Math.abs(seconds) < 60) return `${Math.round(seconds)} s`
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
  return d.toLocaleString("hr-HR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

function useHistoryFetch(route: string, timeRange: TimeRange) {
  const key = route ? `rt-history:${route}:${timeRange}` : null
  const { data, error, isLoading } = useSWR<HistoryResponse>(
    key,
    () => {
      const now = Math.floor(Date.now() / 1000)
      const from = now - TIME_RANGE_SECONDS[timeRange]
      return fetch(
        `/api/rt/history?route=${encodeURIComponent(route)}&from=${from}&to=${now}`
      ).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
    },
    { keepPreviousData: true }
  )
  return {
    data: data ?? null,
    error: error ? (error as Error).message : null,
    isLoading,
  }
}

// --- Component ---

export default function PunctualitySection({
  routes,
}: {
  routes: RouteOption[]
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
  routes: RouteOption[]
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

  if (error) return <ErrorState message={error} />
  if (!data) return <LoadingState />
  if (data.points.length === 0) return <EmptyState />
  const hasHeadway = points.some((p) => p.headwayCv != null)
  return (
    <div className="flex flex-col gap-6">
      <DelayChart points={points} timeRange={timeRange} />
      {hasHeadway && (
        <HeadwayChart points={points} timeRange={timeRange} />
      )}
    </div>
  )
}

const ROUTE_GROUPS: { mode: string; label: string }[] = [
  { mode: "TRAM", label: "Tramvaj" },
  { mode: "BUS", label: "Bus" },
]

const SELECT_CHEVRON_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m2 3.5 3 3 3-3'/%3E%3C/svg%3E")`

function RouteSelector({
  routes,
  value,
  onChange,
}: {
  routes: RouteOption[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/50 py-1 pr-1 pl-3.5 dark:border-white/10 dark:bg-zinc-900/50">
      <label
        htmlFor="punctuality-route"
        className="pointer-events-none flex items-center gap-1.5 text-[12px] font-medium text-slate-500 dark:text-slate-400"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60" aria-hidden="true">
          <path d="M8 6v6M15 6v6M2 12h19.6M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H6C4.9 6 3.9 6.8 3.6 7.8l-1.4 5c-.1.4-.2.8-.2 1.2 0 .4.1.8.2 1.2C2.5 16.3 3 18 3 18h3M7 18v2M17 18v2" />
        </svg>
        Linija
      </label>
      <select
        id="punctuality-route"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[80px] sm:min-w-[100px] cursor-pointer appearance-none rounded-full border-0 bg-slate-900 py-1.5 pr-7 pl-3 text-[12px] font-medium text-white shadow-sm transition-all hover:bg-slate-800 focus:ring-2 focus:ring-indigo-400/40 focus:ring-offset-1 focus:outline-none dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white dark:focus:ring-indigo-500/40"
        style={{ backgroundImage: SELECT_CHEVRON_SVG, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}
      >
        {ROUTE_GROUPS.map(({ mode, label }) => {
          const group = routes.filter((r) => r.mode === mode)
          if (group.length === 0) return null
          return (
            <optgroup key={mode} label={label}>
              {group.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
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
      {(Object.keys(TIME_RANGE_LABELS) as TimeRange[]).map((range) => (
        <button
          type="button"
          key={range}
          onClick={() => onChange(range)}
          className={`rounded-full px-4 py-1.5 text-[12px] font-medium transition-colors ${
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
      <div className="flex items-center gap-3 text-[15px] text-slate-500 dark:text-slate-400">
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
      <p className="text-[15px] font-medium text-red-600 dark:text-red-400">
        Nije moguće dohvatiti podatke: {message}
      </p>
      <p className="mt-2 text-[15px] text-red-500/70 dark:text-red-500/50">
        Provjeri je li backend pokrenut.
      </p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-slate-100 p-12 text-center dark:border-white/10 dark:bg-zinc-800/60">
      <p className="text-[15px] font-medium text-slate-600 dark:text-slate-400">
        Nema podataka za odabrani period.
      </p>
      <p className="mt-2 text-[15px] text-slate-500 dark:text-slate-500">
        Podaci se prikupljaju u stvarnom vremenu iz{" "}
        <Term title="General Transit Feed Specification — Real Time: međunarodni standard za podatke o javnom prijevozu">
          GTFS-RT
        </Term>{" "}
        feed-a.
      </p>
    </div>
  )
}

// --- Charts ---

const CHART_WIDTH = 700
const CHART_HEIGHT = 240
const MARGIN = { top: 16, right: 48, bottom: 40, left: 16 }
const INNER_WIDTH = CHART_WIDTH - MARGIN.left - MARGIN.right
const INNER_HEIGHT = CHART_HEIGHT - MARGIN.top - MARGIN.bottom

function useDelayScales(points: HistoryPoint[]) {
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
  points: HistoryPoint[]
  timeRange: TimeRange
  hovered: HistoryPoint | null
  onHover: (p: HistoryPoint | null) => void
}) {
  const { xScale, yScale, xTicks, yTicks } = useDelayScales(points)
  const { gap, barWidth } = computeBarLayout(points, xScale)
  
  return (
    <ChartSvg label="Grafikon prosječnog kašnjenja">
      <GridRows scale={yScale} width={INNER_WIDTH} tickValues={yTicks} stroke="#e2e8f0" strokeOpacity={0.5} strokeWidth={1} strokeDasharray="4 4" className="dark:stroke-slate-700" />
      {yTicks[0] < 0 && (
        <line x1={0} y1={yScale(0) ?? 0} x2={INNER_WIDTH} y2={yScale(0) ?? 0} stroke="#94a3b8" strokeWidth={1} strokeOpacity={0.2} />
      )}
      
      {/* Bars */}
      {points.map((p) => {
        const xPos = xScale(new Date(p.ts * 1000)) ?? 0
        const delay = Math.max(0, p.avgDelay)
        const barHeight = Math.max(INNER_HEIGHT - (yScale(delay) ?? INNER_HEIGHT), 4)
        const yPos = INNER_HEIGHT - barHeight
        const isHovered = hovered === p
        const color = delay < 180 ? "#10b981" : "#f59e0b"
        const opacity = isHovered ? 1 : 0.85
        return (
          <BarRounded
            key={p.ts}
            x={xPos - barWidth / 2}
            y={yPos}
            width={barWidth}
            height={barHeight}
            fill={color}
            fillOpacity={opacity}
            radius={Math.min(barWidth / 2, 4)}
            top
            bottom={false}
          />
        )
      })}
      <HitAreas points={points} xScale={xScale} gap={gap} onHover={onHover} />
      
      <ChartXLabels ticks={xTicks} xScale={xScale} timeRange={timeRange} />
      <ChartYLabels ticks={yTicks} yScale={yScale} />
      
      {hovered && (
        <SvgTooltip 
          x={xScale(new Date(hovered.ts * 1000)) ?? 0} 
          y={(yScale(Math.max(0, hovered.avgDelay)) ?? 0) - 10} 
          title={fmtTooltipTime(hovered.ts, timeRange)} 
          value={fmtDelayDetailed(hovered.avgDelay)} 
          subtitle={`${hovered.tripCount} polazaka`}
          color={hovered.avgDelay < 180 ? "#10b981" : "#f59e0b"}
        />
      )}
    </ChartSvg>
  )
}

function DelayChart({
  points,
  timeRange,
}: {
  points: HistoryPoint[]
  timeRange: TimeRange
}) {
  const [hovered, setHovered] = useState<HistoryPoint | null>(null)

  return (
    <div className="rounded-[12px] bg-[#f9f9f9] p-3 sm:p-5 dark:bg-[#1a1a1a]">
      <DelayChartHeader points={points} />
      <div className="mt-8 mb-4">
        <h4 className="flex items-center gap-2 text-[13px] font-medium text-slate-500 dark:text-slate-400"><span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden="true" />Uživo kašnjenje u prometu</h4>
      </div>
      <div className="w-full">
        <DelayChartBody points={points} timeRange={timeRange} hovered={hovered} onHover={setHovered} />
      </div>
    </div>
  )
}

function DelayChartHeader({ points }: { points: HistoryPoint[] }) {
  const totalTrips = points.reduce((s, p) => s + p.tripCount, 0)
  const onTimeTrips = Math.round(points.reduce((s, p) => s + p.onTimePct * p.tripCount, 0))
  const delayedTrips = Math.max(0, totalTrips - onTimeTrips)
  
  const onTimePct = totalTrips > 0 ? Math.round((onTimeTrips / totalTrips) * 100) : 0
  const delayedPct = totalTrips > 0 ? 100 - onTimePct : 0

  return (
    <div className="flex flex-col">
      <h3 className="mb-6 font-sans text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Točnost polazaka</h3>
      
      <div className="flex flex-wrap gap-4 sm:gap-8 mb-5">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 text-[13px] text-slate-500 font-medium mb-1">
            <span className="w-1 h-3 rounded-full bg-[#10b981]"></span>
            Na vrijeme
          </div>
          <span className="font-sans text-4xl sm:text-[40px] font-medium leading-none tracking-tight text-slate-900 dark:text-slate-100 mb-1">
            {onTimePct}%
          </span>
          <span className="text-[13px] text-slate-500">
            {onTimeTrips.toLocaleString("hr-HR")}
          </span>
        </div>
        
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 text-[13px] text-slate-500 font-medium mb-1">
            <span className="w-1 h-3 rounded-full bg-[#f59e0b]"></span>
            Kašnjenje
          </div>
          <span className="font-sans text-4xl sm:text-[40px] font-medium leading-none tracking-tight text-slate-900 dark:text-slate-100 mb-1">
            {delayedPct}%
          </span>
          <span className="text-[13px] text-slate-500">
            {delayedTrips.toLocaleString("hr-HR")}
          </span>
        </div>
      </div>
      
      <div className="flex h-1.5 w-full rounded-full overflow-hidden gap-1 bg-slate-100 dark:bg-slate-800">
        <div className="bg-[#10b981] h-full transition-all duration-500" style={{ width: `${onTimePct}%` }} />
        <div className="bg-[#f59e0b] h-full transition-all duration-500" style={{ width: `${delayedPct}%` }} />
      </div>
    </div>
  )
}


// --- Headway chart ---

function useHeadwayScales(points: HistoryPoint[]) {
  return useMemo(() => {
    const pts = points.filter((p) => p.headwayCv != null)
    if (pts.length === 0) return null
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

    // Weighted average headway and CV
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
  maxTrips,
}: {
  pts: HistoryPoint[]
  timeRange: TimeRange
  hovered: HistoryPoint | null
  onHover: (p: HistoryPoint | null) => void
  xScale: ReturnType<typeof scaleTime<number>>
  yScale: ReturnType<typeof scaleLinear<number>>
  xTicks: Date[]
  yTicks: number[]
  maxTrips: number
}) {
  const { gap, barWidth } = computeBarLayout(pts, xScale)
  
  return (
    <ChartSvg label="Grafikon regularnosti razmaka">
      <GridRows scale={yScale} width={INNER_WIDTH} tickValues={yTicks} stroke="#e2e8f0" strokeOpacity={0.5} strokeWidth={1} strokeDasharray="4 4" className="dark:stroke-slate-700" />
      <RegularityZone yScale={yScale} />
      
      {/* Bars */}
      {pts.map((p) => {
        const xPos = xScale(new Date(p.ts * 1000)) ?? 0
        const cv = p.headwayCv ?? 0
        const barHeight = Math.max(INNER_HEIGHT - (yScale(cv) ?? INNER_HEIGHT), 4)
        const yPos = INNER_HEIGHT - barHeight
        const isHovered = hovered === p
        const color = cv < 0.3 ? "#10b981" : cv < 0.5 ? "#f59e0b" : "#ef4444"
        const opacity = isHovered ? 1 : 0.85
        return (
          <BarRounded
            key={p.ts}
            x={xPos - barWidth / 2}
            y={yPos}
            width={barWidth}
            height={barHeight}
            fill={color}
            fillOpacity={opacity}
            radius={Math.min(barWidth / 2, 4)}
            top
            bottom={false}
          />
        )
      })}
      <HitAreas points={pts} xScale={xScale} gap={gap} onHover={onHover} />
      
      <ChartXLabels ticks={xTicks} xScale={xScale} timeRange={timeRange} />
      <ChartYLabels ticks={yTicks} yScale={yScale} format={(v) => v.toFixed(1)} />
      
      {hovered && (
        <SvgTooltip 
          x={xScale(new Date(hovered.ts * 1000)) ?? 0} 
          y={(yScale(hovered.headwayCv ?? 0) ?? 0) - 10} 
          title={fmtTooltipTime(hovered.ts, timeRange)} 
          value={`CV ${hovered.headwayCv?.toFixed(2)}`} 
          subtitle={hovered.headwaySec ? `razmak ${Math.round(hovered.headwaySec / 60)} min` : undefined}
          color={(hovered.headwayCv ?? 0) < 0.3 ? "#10b981" : (hovered.headwayCv ?? 0) < 0.5 ? "#f59e0b" : "#ef4444"}
        />
      )}
    </ChartSvg>
  )
}

function HeadwayChart({
  points,
  timeRange,
}: {
  points: HistoryPoint[]
  timeRange: TimeRange
}) {
  const [hovered, setHovered] = useState<HistoryPoint | null>(null)
  const scales = useHeadwayScales(points)
  if (!scales) return null
  const { xScale, yScale, xTicks, yTicks, avgHeadway, avgCv, maxTrips, pts } = scales

  return (
    <div className="rounded-[12px] bg-[#f9f9f9] p-3 sm:p-5 dark:bg-[#1a1a1a]">
      <HeadwayChartHeader avgHeadway={avgHeadway} avgCv={avgCv} />
      <div className="mt-8 mb-4">
        <h4 className="flex items-center gap-2 text-[13px] font-medium text-slate-500 dark:text-slate-400"><span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden="true" />Varijacija razmaka uživo</h4>
      </div>
      <div className="w-full">
        <HeadwayChartBody pts={pts} timeRange={timeRange} hovered={hovered} onHover={setHovered} xScale={xScale} yScale={yScale} xTicks={xTicks} yTicks={yTicks} maxTrips={maxTrips} />
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
        className="fill-slate-400/80 text-[7px] dark:fill-slate-500"
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
      <h3 className="mb-6 font-sans text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Regularnost razmaka</h3>
      
      <div className="flex flex-wrap gap-4 sm:gap-8 mb-5">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 text-[13px] text-slate-500 font-medium mb-1">
            Kvaliteta
          </div>
          <span className={`font-sans text-4xl sm:text-[40px] font-medium leading-none tracking-tight capitalize mb-1 ${qualityColor}`}>
            {quality}
          </span>
        </div>
        
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 text-[13px] text-slate-500 font-medium mb-1">
            <Term title="Koeficijent varijacije — niži broj znači pravilniji razmak između vozila">CV</Term>
          </div>
          <span className="font-sans text-4xl sm:text-[40px] font-medium leading-none tracking-tight text-slate-900 dark:text-slate-100 mb-1">
            {avgCv.toFixed(2)}
          </span>
          <span className="text-[13px] text-slate-500">
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

function SvgTooltip({
  x,
  y,
  title,
  value,
  subtitle,
  color = "#10b981",
}: {
  x: number
  y: number
  title: string
  value: string
  subtitle?: string
  color?: string
}) {
  const width = 156
  const height = subtitle ? 72 : 52
  // keep inside bounds
  const adjustedX = Math.max(0, Math.min(x - width / 2, INNER_WIDTH - width))
  const adjustedY = Math.max(0, y - height - 12)

  return (
    <g className="pointer-events-none transition-all duration-200 ease-out">
      <g transform={`translate(${adjustedX}, ${adjustedY})`}>
        <rect
          width={width}
          height={height}
          rx={8}
          className="fill-white dark:fill-[#262626] stroke-slate-200 dark:stroke-white/10"
          strokeWidth={1}
          style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.08)) drop-shadow(0 1px 3px rgba(0,0,0,0.05))" }}
        />
        <text x={14} y={22} fontSize={11} fontWeight={500} className="fill-slate-400 dark:fill-slate-500">
          {title}
        </text>
        <circle cx={18} cy={37} r={3.5} fill={color} />
        <text x={28} y={41} fontSize={14} fontWeight={600} className="fill-slate-900 dark:fill-slate-100">
          {value}
        </text>
        {subtitle && (
          <text x={14} y={58} fontSize={11} fontWeight={400} className="fill-slate-500 dark:fill-slate-400">
            {subtitle}
          </text>
        )}
      </g>
    </g>
  )
}

function ChartSvg({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="relative mx-auto w-full">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={label}
      >
        <Group top={MARGIN.top} left={MARGIN.left}>
          {children}
        </Group>
      </svg>
    </div>
  )
}

function ChartXLabels({
  ticks,
  xScale,
  timeRange,
}: {
  ticks: Date[]
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
          className="fill-slate-500 text-[11px] font-medium dark:fill-slate-400"
        >
          {fmtTime(t.getTime() / 1000, timeRange)}
        </text>
      ))}
    </>
  )
}

function ChartYLabels({
  ticks,
  yScale,
  format,
}: {
  ticks: number[]
  yScale: ReturnType<typeof scaleLinear<number>>
  format?: (v: number) => string
}) {
  return (
    <>
      {ticks.map((v) => {
        let label = "0"
        if (format) {
          label = format(v)
        } else {
          label = "0m"
          if (v !== 0) {
            const m = Math.round(v / 60)
            if (m >= 60 && m % 60 === 0) label = `${m / 60}h`
            else if (m > 60) label = `${Math.floor(m / 60)}h ${m % 60}m`
            else label = `${m}m`
          }
        }
        return (
          <text
            key={v}
            x={INNER_WIDTH + 8}
            y={(yScale(v) ?? 0) + 1}
            textAnchor="start"
            dominantBaseline="middle"
            className="fill-slate-500 text-[11px] font-medium dark:fill-slate-400"
          >
            {label}
          </text>
        )
      })}
    </>
  )
}

function computeBarLayout(
  points: HistoryPoint[],
  xScale: ReturnType<typeof scaleTime<number>>
) {
  const gap =
    points.length > 1
      ? Math.abs(
          (xScale(new Date(points[1].ts * 1000)) ?? 0) -
            (xScale(new Date(points[0].ts * 1000)) ?? 0)
        )
      : 8
  return { gap, barWidth: Math.max(8, gap * 0.4) }
}

function HitAreas({
  points,
  xScale,
  gap,
  onHover,
}: {
  points: HistoryPoint[]
  xScale: ReturnType<typeof scaleTime<number>>
  gap: number
  onHover: (p: HistoryPoint | null) => void
}) {
  return (
    <>
      {points.map((p) => (
        <rect
          key={p.ts}
          x={(xScale(new Date(p.ts * 1000)) ?? 0) - gap / 2}
          y={0}
          width={gap}
          height={INNER_HEIGHT}
          fill="transparent"
          onPointerEnter={() => onHover(p)}
          onPointerLeave={() => onHover(null)}
          className="cursor-crosshair outline-none"
        />
      ))}
    </>
  )
}

