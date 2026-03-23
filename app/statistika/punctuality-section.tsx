"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { fmtDelaySec, pickPreferredRoute } from "@/lib/format"
import { Term } from "@/components/ui/term"
import { computeXTicks } from "@/lib/chart-utils"
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
  const { data, error } = useHistoryFetch(selectedRoute, timeRange)

  return (
    <section id="tocnost" className="flex flex-col border-t border-slate-200 py-16 sm:py-24 dark:border-white/10">
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
        <h2 className="font-serif text-[28px] tracking-tight text-slate-900 sm:text-[32px] dark:text-slate-100">
          Praćenje u stvarnom vremenu
        </h2>
        <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
          Točnost dolazaka po liniji: prosječno kašnjenje, postotak vozila
          na vrijeme (−1 do +5 min) i regularnost razmaka (koliko ravnomjerno dolaze vozila).
        </p>
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
      <RouteSelector routes={routes} value={selectedRoute} onChange={onRouteChange} />
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
  if (error) return <ErrorState message={error} />
  if (!data) return <LoadingState />
  if (data.points.length === 0) return <EmptyState />
  const hasHeadway = data.points.some((p) => p.headwayCv != null)
  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
      <DelayChart points={data.points} timeRange={timeRange} />
      <OnTimeChart points={data.points} timeRange={timeRange} />
      {hasHeadway && <HeadwayChart points={data.points} timeRange={timeRange} />}
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
    <div className="flex items-center gap-3">
      <label htmlFor="punctuality-route" className="text-[14px] font-medium text-slate-600 dark:text-slate-400">Linija</label>
      <select
        id="punctuality-route"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[160px] appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-4 pr-10 text-[15px] font-medium text-slate-900 transition-colors hover:bg-slate-100 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10 dark:focus:border-indigo-600 dark:focus:ring-indigo-900"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m2 4 4 4 4-4'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center" }}
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
    <div className="flex gap-1 rounded-full border border-slate-200 bg-white/50 p-1 dark:border-white/10 dark:bg-zinc-900/50">
      {(Object.keys(TIME_RANGE_LABELS) as TimeRange[]).map((range) => (
        <button
          type="button"
          key={range}
          onClick={() => onChange(range)}
          className={`rounded-full px-4 py-1.5 text-[12px] font-medium transition-colors ${
            value === range
              ? "bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900"
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
    <div className="rounded-2xl border border-dashed border-red-200 bg-red-50/50 p-12 text-center dark:border-red-900/20 dark:bg-red-900/10">
      <p className="text-[15px] font-medium text-red-600 dark:text-red-400">
        Nije moguće dohvatiti podatke: {message}
      </p>
      <p className="mt-2 text-[14px] text-red-500/70 dark:text-red-500/50">
        Provjeri je li backend pokrenut.
      </p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-12 text-center dark:border-white/10 dark:bg-white/5">
      <p className="text-[15px] font-medium text-slate-600 dark:text-slate-400">
        Nema podataka za odabrani period.
      </p>
      <p className="mt-2 text-[14px] text-slate-500 dark:text-slate-500">
        Podaci se prikupljaju u stvarnom vremenu iz{" "}
            <Term title="General Transit Feed Specification — Real Time: međunarodni standard za podatke o javnom prijevozu">GTFS-RT</Term>{" "}
            feed-a.
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
    const xTicks = computeXTicks(tsMin, tsMax, 5)
    const yTicks = yScale.ticks(5)
    const totalTrips = points.reduce((s, p) => s + p.tripCount, 0)
    const avgDelay =
      points.reduce((s, p) => s + p.avgDelay * p.tripCount, 0) /
      Math.max(totalTrips, 1)
    const maxDelaySec = points.reduce((m, p) => Math.max(m, p.maxDelay), 0)
    const maxTrips = points.reduce((m, p) => Math.max(m, p.tripCount), 0)
    return { xScale, yScale, xTicks, yTicks, avgDelay, maxDelaySec, totalTrips, maxTrips }
  }, [points])
}

function DelayChart({ points, timeRange }: { points: HistoryPoint[]; timeRange: TimeRange }) {
  const { xScale, yScale, xTicks, yTicks, avgDelay, maxDelaySec, totalTrips, maxTrips } =
    useDelayScales(points)

  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/50 p-6 sm:p-8 dark:border-white/10 dark:bg-white/5">
      <DelayChartHeader avgDelay={avgDelay} maxDelaySec={maxDelaySec} totalTrips={totalTrips} />
      <ChartSvg label="Grafikon prosječnog kašnjenja">
        <GridRows scale={yScale} width={INNER_WIDTH} tickValues={yTicks} stroke="#94a3b8" strokeOpacity={0.15} strokeWidth={1} />
        {yTicks[0] < 0 && (
          <line x1={0} y1={yScale(0) ?? 0} x2={INNER_WIDTH} y2={yScale(0) ?? 0} stroke="#94a3b8" strokeWidth={1} strokeOpacity={0.4} />
        )}
        {points.length > 1 && (
          <TripCountBars points={points} xScale={xScale} maxTrips={maxTrips} color="#0ea5e9" />
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
    const tsMin = points.reduce((m, p) => Math.min(m, p.ts), Infinity)
    const tsMax = points.reduce((m, p) => Math.max(m, p.ts), -Infinity)
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
    const maxTrips = points.reduce((m, p) => Math.max(m, p.tripCount), 0)
    return { xScale, yScale, xTicks, yTicks, avgOnTime, totalTrips, maxTrips }
  }, [points])
}

function OnTimeChart({ points, timeRange }: { points: HistoryPoint[]; timeRange: TimeRange }) {
  const { xScale, yScale, xTicks, yTicks, avgOnTime, totalTrips, maxTrips } =
    useOnTimeScales(points)

  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/50 p-6 sm:p-8 dark:border-white/10 dark:bg-white/5">
      <OnTimeChartHeader avgOnTime={avgOnTime} totalTrips={totalTrips} />
      <ChartSvg label="Grafikon točnosti dolazaka">
        <GridRows scale={yScale} width={INNER_WIDTH} tickValues={yTicks} stroke="#94a3b8" strokeOpacity={0.15} strokeWidth={1} />
        {points.length > 1 && (
          <TripCountBars points={points} xScale={xScale} maxTrips={maxTrips} color="#10b981" />
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
          na vrijeme (−1 do +5 min) &middot;{" "}
          {totalTrips.toLocaleString("hr-HR")} polazaka
        </span>
      </div>
    </>
  )
}

// --- Headway chart ---

function useHeadwayScales(points: HistoryPoint[]) {
  return useMemo(() => {
    const pts = points.filter((p) => p.headwayCv != null)
    if (pts.length === 0) return null
    const tsMin = pts.reduce((m, p) => Math.min(m, p.ts), Infinity)
    const tsMax = pts.reduce((m, p) => Math.max(m, p.ts), -Infinity)
    const maxCv = pts.reduce((m, p) => Math.max(m, p.headwayCv!), 0.6)
    const xScale = scaleTime<number>({
      domain: [new Date(tsMin * 1000), new Date(tsMax * 1000)],
      range: [0, INNER_WIDTH],
    })
    const yScale = scaleLinear<number>({
      domain: [0, Math.min(maxCv * 1.2, 1.5)],
      range: [INNER_HEIGHT, 0],
      nice: true,
    })
    const xTicks = computeXTicks(tsMin, tsMax, 5)
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
    return { xScale, yScale, xTicks, yTicks, avgHeadway, avgCv, totalTrips, maxTrips, pts }
  }, [points])
}

function HeadwayChart({ points, timeRange }: { points: HistoryPoint[]; timeRange: TimeRange }) {
  const scales = useHeadwayScales(points)
  if (!scales) return null
  const { xScale, yScale, xTicks, yTicks, avgHeadway, avgCv, maxTrips, pts } = scales

  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/50 p-6 sm:p-8 dark:border-white/10 dark:bg-white/5">
      <HeadwayChartHeader avgHeadway={avgHeadway} avgCv={avgCv} />
      <ChartSvg label="Grafikon regularnosti razmaka">
        <GridRows scale={yScale} width={INNER_WIDTH} tickValues={yTicks} stroke="#94a3b8" strokeOpacity={0.15} strokeWidth={1} />
        <RegularityZone yScale={yScale} />
        {pts.length > 1 && (
          <TripCountBars points={pts} xScale={xScale} maxTrips={maxTrips} color="#8b5cf6" />
        )}
        <LinePath<HistoryPoint>
          data={pts}
          x={(d) => xScale(new Date(d.ts * 1000)) ?? 0}
          y={(d) => yScale(d.headwayCv ?? 0) ?? 0}
          stroke="#7c3aed"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <ChartXLabels ticks={xTicks} xScale={xScale} timeRange={timeRange} />
        <ChartYLabels ticks={yTicks} yScale={yScale} format={(v) => v.toFixed(1)} />
        <ChartYTitle label="CV razmaka" />
      </ChartSvg>
    </div>
  )
}

function RegularityZone({ yScale }: { yScale: ReturnType<typeof scaleLinear<number>> }) {
  const y03 = yScale(0.3) ?? 0
  return (
    <>
      <rect x={0} y={y03} width={INNER_WIDTH} height={Math.max(0, (yScale(0) ?? 0) - y03)} fill="#10b981" fillOpacity={0.06} />
      <line x1={0} y1={y03} x2={INNER_WIDTH} y2={y03} stroke="#7c3aed" strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.4} />
      <text x={INNER_WIDTH - 2} y={y03 - 4} textAnchor="end" className="fill-violet-500/60 text-[7px] dark:fill-violet-400/60">
        dobra regularnost
      </text>
    </>
  )
}

function HeadwayChartHeader({ avgHeadway, avgCv }: { avgHeadway: number; avgCv: number }) {
  const quality =
    avgCv < 0.3 ? "odlična" : avgCv < 0.5 ? "umjerena" : "loša"
  const qualityColor =
    avgCv < 0.3
      ? "text-emerald-600 dark:text-emerald-400"
      : avgCv < 0.5
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400"

  return (
    <>
      <div className="mb-2 font-sans text-[11px] font-bold tracking-widest text-violet-700 uppercase dark:text-violet-400">
        Regularnost razmaka
      </div>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className={`font-serif text-[28px] leading-none tabular-nums ${qualityColor}`}>
          {quality}
        </span>
        <span className="text-[12px] text-slate-500 dark:text-slate-400">
          <Term title="Koeficijent varijacije — niži broj znači pravilniji razmak između vozila">CV</Term> {avgCv.toFixed(2)} &middot; prosječni razmak{" "}
          {avgHeadway >= 60
            ? `${Math.round(avgHeadway / 60)} min`
            : `${Math.round(avgHeadway)} s`}
        </span>
      </div>
    </>
  )
}

// --- Shared chart primitives ---

function ChartSvg({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-full">
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="w-full" role="img" aria-label={label}>
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
