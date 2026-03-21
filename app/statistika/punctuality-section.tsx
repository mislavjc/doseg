"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { fmtDelaySec, pickPreferredRoute } from "@/lib/format"
import { scaleLinear, scaleTime } from "@visx/scale"
import { Group } from "@visx/group"
import { LinePath, Bar } from "@visx/shape"
import { GridRows } from "@visx/grid"

// --- Types ---

interface HistoryPoint {
  ts: number
  avgDelay: number
  maxDelay: number
  onTimePct: number
  tripCount: number
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

function computeXTicks(tsMin: number, tsMax: number, count: number): Date[] {
  const ticks: Date[] = []
  for (let i = 0; i <= count; i++) {
    ticks.push(new Date((tsMin + (i / count) * (tsMax - tsMin)) * 1000))
  }
  return ticks
}

function useHistoryFetch(route: string, timeRange: TimeRange) {
  const key = route ? `rt-history:${route}:${timeRange}` : null
  const { data, error, isLoading } = useSWR<HistoryResponse>(key, () => {
    const now = Math.floor(Date.now() / 1000)
    const from = now - TIME_RANGE_SECONDS[timeRange]
    return fetch(`/api/rt/history?route=${encodeURIComponent(route)}&from=${from}&to=${now}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
  }, { keepPreviousData: true })
  return { data: data ?? null, error: error ? (error as Error).message : null, isLoading }
}

// --- Component ---

export default function PunctualitySection({
  routes,
}: {
  routes: RouteOption[]
}) {
  const [selectedRoute, setSelectedRoute] = useState(() => pickPreferredRoute(routes.map((r) => r.name)))
  const [timeRange, setTimeRange] = useState<TimeRange>("24h")
  const { data, error, isLoading } = useHistoryFetch(selectedRoute, timeRange)

  return (
    <section id="tocnost" className="mt-16 sm:mt-20">
      <PunctualityHeader />
      <PunctualityControls
        routes={routes}
        selectedRoute={selectedRoute}
        onRouteChange={setSelectedRoute}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
      />
      <PunctualityContent
        data={data}
        error={error}
        isLoading={isLoading}
        timeRange={timeRange}
      />
    </section>
  )
}

// --- Header & Controls ---

function PunctualityHeader() {
  return (
    <div className="mb-10 flex flex-col items-center text-center">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-full bg-sky-500" />
        <h2 className="font-serif text-3xl tracking-tight text-slate-900 sm:text-4xl dark:text-slate-100">
          Praćenje u stvarnom vremenu
        </h2>
      </div>
      <p className="max-w-2xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
        Točnost dolazaka po liniji: prosječno kašnjenje i postotak vozila
        koja su stigla na vrijeme (kašnjenje &lt; 5 min).
      </p>
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
    <div className="mb-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
      <RouteSelector routes={routes} value={selectedRoute} onChange={onRouteChange} />
      <span className="hidden h-5 w-px bg-slate-200 sm:block dark:bg-zinc-700" />
      <TimeRangeSelector value={timeRange} onChange={onTimeRangeChange} />
    </div>
  )
}

function PunctualityContent({
  data,
  error,
  isLoading,
  timeRange,
}: {
  data: HistoryResponse | null
  error: string | null
  isLoading: boolean
  timeRange: TimeRange
}) {
  if (error) return <ErrorState message={error} />
  if (isLoading || !data) return <LoadingState />
  if (data.points.length === 0) return <EmptyState />
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <DelayChart points={data.points} timeRange={timeRange} />
      <OnTimeChart points={data.points} timeRange={timeRange} />
    </div>
  )
}

function RouteSelector({
  routes,
  value,
  onChange,
}: {
  routes: RouteOption[]
  value: string
  onChange: (v: string) => void
}) {
  const trams = routes.filter((r) => r.mode === "TRAM")
  const buses = routes.filter((r) => r.mode === "BUS")

  return (
    <div className="flex items-center gap-2">
      <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400">Linija</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[140px] appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-8 text-[14px] font-medium text-slate-900 shadow-sm transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-200 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-slate-100 dark:focus:border-sky-600 dark:focus:ring-sky-900"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m2 4 4 4 4-4'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}
      >
        {trams.length > 0 && (
          <optgroup label="Tramvaj">
            {trams.map((r) => (
              <option key={r.name} value={r.name}>{r.name}</option>
            ))}
          </optgroup>
        )}
        {buses.length > 0 && (
          <optgroup label="Bus">
            {buses.map((r) => (
              <option key={r.name} value={r.name}>{r.name}</option>
            ))}
          </optgroup>
        )}
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
    <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-zinc-800">
      {(Object.keys(TIME_RANGE_LABELS) as TimeRange[]).map((range) => (
        <button
          key={range}
          onClick={() => onChange(range)}
          className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
            value === range
              ? "bg-white text-slate-900 shadow-sm dark:bg-zinc-700 dark:text-slate-100"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
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
      <div className="flex items-center gap-3 text-[14px] text-slate-500 dark:text-slate-400">
        <LoadingSpinner />
        Učitavanje podataka...
      </div>
    </div>
  )
}

function LoadingSpinner() {
  return (
    <svg className="h-5 w-5 animate-spin text-sky-500" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl bg-red-50/50 p-8 text-center dark:bg-red-950/10">
      <p className="text-[14px] text-red-700 dark:text-red-400">
        Nije moguće dohvatiti podatke: {message}
      </p>
      <p className="mt-1 text-[13px] text-red-500/70 dark:text-red-500/50">
        Provjeri je li backend pokrenut.
      </p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-2xl bg-slate-50/50 p-8 text-center dark:bg-zinc-900/20">
      <p className="text-[14px] text-slate-600 dark:text-slate-400">
        Nema podataka za odabrani period.
      </p>
      <p className="mt-1 text-[13px] text-slate-400 dark:text-slate-500">
        Podaci se prikupljaju u stvarnom vremenu iz GTFS-RT feed-a.
      </p>
    </div>
  )
}

// --- Charts ---

const CHART_WIDTH = 520
const CHART_HEIGHT = 280
const MARGIN = { top: 16, right: 24, bottom: 40, left: 52 }
const INNER_WIDTH = CHART_WIDTH - MARGIN.left - MARGIN.right
const INNER_HEIGHT = CHART_HEIGHT - MARGIN.top - MARGIN.bottom

function useDelayScales(points: HistoryPoint[]) {
  return useMemo(() => {
    const tsMin = Math.min(...points.map((p) => p.ts))
    const tsMax = Math.max(...points.map((p) => p.ts))
    const maxD = Math.max(...points.map((p) => p.avgDelay), 60)
    const minD = Math.min(...points.map((p) => p.avgDelay), 0)
    const xScale = scaleTime<number>({
      domain: [new Date(tsMin * 1000), new Date(tsMax * 1000)],
      range: [0, INNER_WIDTH],
    })
    const yScale = scaleLinear<number>({
      domain: [minD < 0 ? minD * 1.15 : 0, maxD * 1.15],
      range: [INNER_HEIGHT, 0],
      nice: true,
    })
    const xTicks = computeXTicks(tsMin, tsMax, 5)
    const yTicks = yScale.ticks(5)
    const totalTrips = points.reduce((s, p) => s + p.tripCount, 0)
    const avgDelay =
      points.reduce((s, p) => s + p.avgDelay * p.tripCount, 0) /
      Math.max(totalTrips, 1)
    const maxDelaySec = Math.max(...points.map((p) => p.maxDelay))
    return { xScale, yScale, xTicks, yTicks, avgDelay, maxDelaySec, totalTrips }
  }, [points])
}

function DelayChart({ points, timeRange }: { points: HistoryPoint[]; timeRange: TimeRange }) {
  const { xScale, yScale, xTicks, yTicks, avgDelay, maxDelaySec, totalTrips } =
    useDelayScales(points)

  return (
    <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
      <DelayChartHeader avgDelay={avgDelay} maxDelaySec={maxDelaySec} totalTrips={totalTrips} />
      <ChartSvg label="Grafikon prosječnog kašnjenja">
        <GridRows scale={yScale} width={INNER_WIDTH} tickValues={yTicks} stroke="#94a3b8" strokeOpacity={0.15} strokeWidth={1} />
        {yTicks[0] < 0 && (
          <line x1={0} y1={yScale(0) ?? 0} x2={INNER_WIDTH} y2={yScale(0) ?? 0} stroke="#94a3b8" strokeWidth={1} strokeOpacity={0.4} />
        )}
        {points.length > 1 && (
          <TripCountBars points={points} xScale={xScale} maxTrips={Math.max(...points.map((p) => p.tripCount))} color="#0ea5e9" />
        )}
        <LinePath<HistoryPoint>
          data={points}
          x={(d) => xScale(new Date(d.ts * 1000)) ?? 0}
          y={(d) => yScale(d.avgDelay) ?? 0}
          stroke="#0284c7"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <ChartXLabels ticks={xTicks} xScale={xScale} timeRange={timeRange} />
        <ChartYLabels ticks={yTicks} yScale={yScale} format={fmtDelaySec} />
        <ChartYTitle label="Kašnjenje" />
      </ChartSvg>
    </div>
  )
}

function DelayChartHeader({
  avgDelay,
  maxDelaySec,
  totalTrips,
}: {
  avgDelay: number
  maxDelaySec: number
  totalTrips: number
}) {
  return (
    <>
      <div className="mb-2 font-sans text-[11px] font-bold tracking-widest text-sky-700 uppercase dark:text-sky-400">
        Prosječno kašnjenje
      </div>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-serif text-[28px] leading-none text-sky-600 tabular-nums dark:text-sky-400">
          {fmtDelayDetailed(avgDelay)}
        </span>
        <span className="text-[12px] text-slate-500 dark:text-slate-400">
          prosjek &middot; maks {fmtDelayDetailed(maxDelaySec)} &middot;{" "}
          {totalTrips.toLocaleString("hr-HR")} polazaka
        </span>
      </div>
    </>
  )
}

function useOnTimeScales(points: HistoryPoint[]) {
  return useMemo(() => {
    const tsMin = Math.min(...points.map((p) => p.ts))
    const tsMax = Math.max(...points.map((p) => p.ts))
    const xScale = scaleTime<number>({
      domain: [new Date(tsMin * 1000), new Date(tsMax * 1000)],
      range: [0, INNER_WIDTH],
    })
    const yScale = scaleLinear<number>({
      domain: [0, 100],
      range: [INNER_HEIGHT, 0],
    })
    const xTicks = computeXTicks(tsMin, tsMax, 5)
    const yTicks = [0, 25, 50, 75, 100]
    const totalTrips = points.reduce((s, p) => s + p.tripCount, 0)
    const avgOnTime =
      (points.reduce((s, p) => s + p.onTimePct * p.tripCount, 0) /
      Math.max(totalTrips, 1)) * 100
    return { xScale, yScale, xTicks, yTicks, avgOnTime, totalTrips }
  }, [points])
}

function OnTimeChart({ points, timeRange }: { points: HistoryPoint[]; timeRange: TimeRange }) {
  const { xScale, yScale, xTicks, yTicks, avgOnTime, totalTrips } =
    useOnTimeScales(points)

  return (
    <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
      <OnTimeChartHeader avgOnTime={avgOnTime} totalTrips={totalTrips} />
      <ChartSvg label="Grafikon točnosti dolazaka">
        <GridRows scale={yScale} width={INNER_WIDTH} tickValues={yTicks} stroke="#94a3b8" strokeOpacity={0.15} strokeWidth={1} />
        {points.length > 1 && (
          <TripCountBars points={points} xScale={xScale} maxTrips={Math.max(...points.map((p) => p.tripCount))} color="#10b981" />
        )}
        <LinePath<HistoryPoint>
          data={points}
          x={(d) => xScale(new Date(d.ts * 1000)) ?? 0}
          y={(d) => yScale(d.onTimePct * 100) ?? 0}
          stroke="#059669"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <ThresholdLine yScale={yScale} />
        <ChartXLabels ticks={xTicks} xScale={xScale} timeRange={timeRange} />
        <ChartYLabels ticks={yTicks} yScale={yScale} format={(v) => `${v}%`} />
        <ChartYTitle label="Na vrijeme (%)" />
      </ChartSvg>
    </div>
  )
}

function OnTimeChartHeader({ avgOnTime, totalTrips }: { avgOnTime: number; totalTrips: number }) {
  return (
    <>
      <div className="mb-2 font-sans text-[11px] font-bold tracking-widest text-emerald-700 uppercase dark:text-emerald-400">
        Točnost dolazaka
      </div>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-serif text-[28px] leading-none text-emerald-600 tabular-nums dark:text-emerald-400">
          {avgOnTime.toFixed(1).replace(".", ",")}%
        </span>
        <span className="text-[12px] text-slate-500 dark:text-slate-400">
          na vrijeme (&lt; 5 min) &middot;{" "}
          {totalTrips.toLocaleString("hr-HR")} polazaka
        </span>
      </div>
    </>
  )
}

// --- Shared chart primitives ---

function ChartSvg({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-full">
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="w-full" aria-label={label}>
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
      {ticks.map((t, i) => (
        <text key={i} x={xScale(t)} y={INNER_HEIGHT + 20} textAnchor="middle" className="fill-slate-400 text-[8px] dark:fill-slate-500">
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
  format: (v: number) => string
}) {
  return (
    <>
      {ticks.map((v) => (
        <text key={v} x={-8} y={(yScale(v) ?? 0) + 1} textAnchor="end" dominantBaseline="middle" className="fill-slate-400 text-[8px] dark:fill-slate-500">
          {format(v)}
        </text>
      ))}
    </>
  )
}

function ChartYTitle({ label }: { label: string }) {
  return (
    <text
      x={-38}
      y={INNER_HEIGHT / 2}
      textAnchor="middle"
      dominantBaseline="middle"
      transform={`rotate(-90, -38, ${INNER_HEIGHT / 2})`}
      className="fill-slate-500 text-[9px] dark:fill-slate-400"
    >
      {label}
    </text>
  )
}

function ThresholdLine({ yScale }: { yScale: ReturnType<typeof scaleLinear<number>> }) {
  return (
    <>
      <line
        x1={0}
        y1={yScale(80) ?? 0}
        x2={INNER_WIDTH}
        y2={yScale(80) ?? 0}
        stroke="#059669"
        strokeWidth={1}
        strokeDasharray="4 3"
        strokeOpacity={0.4}
      />
      <text
        x={INNER_WIDTH - 2}
        y={(yScale(80) ?? 0) - 4}
        textAnchor="end"
        className="fill-emerald-500/60 text-[7px] dark:fill-emerald-400/60"
      >
        80% cilj
      </text>
    </>
  )
}

function TripCountBars({
  points,
  xScale,
  maxTrips,
  color,
}: {
  points: HistoryPoint[]
  xScale: ReturnType<typeof scaleTime<number>>
  maxTrips: number
  color: string
}) {
  if (maxTrips === 0) return null
  const barWidth = Math.max(
    2,
    points.length > 1
      ? Math.abs(
          (xScale(new Date(points[1].ts * 1000)) ?? 0) -
            (xScale(new Date(points[0].ts * 1000)) ?? 0)
        ) * 0.6
      : 4
  )
  return (
    <>
      {points.map((p, i) => {
        const barHeight = (p.tripCount / maxTrips) * INNER_HEIGHT * 0.3
        return (
          <Bar
            key={i}
            x={(xScale(new Date(p.ts * 1000)) ?? 0) - barWidth / 2}
            y={INNER_HEIGHT - barHeight}
            width={barWidth}
            height={barHeight}
            fill={color}
            fillOpacity={0.1}
            rx={1}
          />
        )
      })}
    </>
  )
}
