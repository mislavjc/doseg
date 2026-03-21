"use client"

import { useMemo } from "react"
import useSWR from "swr"
import { fmtHR } from "@/lib/format"
import { computeXTicks } from "@/lib/chart-utils"
import { scaleLinear, scaleTime } from "@visx/scale"
import { Group } from "@visx/group"
import { LinePath, AreaClosed } from "@visx/shape"
import { GridRows } from "@visx/grid"
import { curveMonotoneX } from "@visx/curve"

// --- Types ---

interface UsagePoint {
  ts: number
  bikesInUse: number
  available: number
  knownFleet: number
}

// --- Constants ---

const CHART_WIDTH = 520
const CHART_HEIGHT = 240
const MARGIN = { top: 16, right: 24, bottom: 40, left: 52 }
const INNER_WIDTH = CHART_WIDTH - MARGIN.left - MARGIN.right
const INNER_HEIGHT = CHART_HEIGHT - MARGIN.top - MARGIN.bottom

// --- Helpers ---

function fmtTime(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" })
}

// --- Data fetching ---

function useBajsUsageHistory() {
  const { data, error, isLoading } = useSWR<UsagePoint[]>(
    "bajs-usage-history",
    () =>
      fetch("/api/rt/bajs-usage-history")
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        }),
    { refreshInterval: 60_000, keepPreviousData: true },
  )
  return { points: data ?? null, error: error ? (error as Error).message : null, isLoading }
}

// --- Scales ---

function useUsageScales(points: UsagePoint[]) {
  return useMemo(() => {
    const tsMin = Math.min(...points.map((p) => p.ts))
    const tsMax = Math.max(...points.map((p) => p.ts))
    const maxBikes = Math.max(...points.map((p) => p.bikesInUse), 1)

    const xScale = scaleTime<number>({
      domain: [new Date(tsMin * 1000), new Date(tsMax * 1000)],
      range: [0, INNER_WIDTH],
    })
    const yScale = scaleLinear<number>({
      domain: [0, maxBikes * 1.15],
      range: [INNER_HEIGHT, 0],
      nice: true,
    })

    const xTicks = computeXTicks(tsMin, tsMax, 5)
    const yTicks = yScale.ticks(5)

    const current = points[points.length - 1].bikesInUse
    const peak = maxBikes
    const avg = points.reduce((s, p) => s + p.bikesInUse, 0) / points.length

    return { xScale, yScale, xTicks, yTicks, current, peak, avg }
  }, [points])
}

// --- Component ---

export default function BajsUsageChart() {
  const { points, error, isLoading } = useBajsUsageHistory()

  if (error) return <ErrorState message={error} />
  if (isLoading || !points) return <LoadingState />
  if (points.length === 0) return <EmptyState />

  return <ChartCard points={points} />
}

// --- Chart card ---

function ChartCard({ points }: { points: UsagePoint[] }) {
  const { xScale, yScale, xTicks, yTicks, current, peak, avg } =
    useUsageScales(points)

  return (
    <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
      <ChartHeader current={current} peak={peak} avg={avg} />
      <ChartSvg label="Grafikon korištenja BAJS bicikala">
        <GridRows
          scale={yScale}
          width={INNER_WIDTH}
          tickValues={yTicks}
          stroke="#94a3b8"
          strokeOpacity={0.15}
          strokeWidth={1}
        />
        {points.length > 1 && (
          <AreaClosed<UsagePoint>
            data={points}
            x={(d) => xScale(new Date(d.ts * 1000)) ?? 0}
            y={(d) => yScale(d.bikesInUse) ?? 0}
            yScale={yScale}
            fill="#22c55e"
            fillOpacity={0.12}
            curve={curveMonotoneX}
          />
        )}
        <LinePath<UsagePoint>
          data={points}
          x={(d) => xScale(new Date(d.ts * 1000)) ?? 0}
          y={(d) => yScale(d.bikesInUse) ?? 0}
          stroke="#16a34a"
          strokeWidth={2}
          strokeLinejoin="round"
          curve={curveMonotoneX}
        />
        <ChartXLabels ticks={xTicks} xScale={xScale} />
        <ChartYLabels ticks={yTicks} yScale={yScale} />
        <ChartYTitle label="Bicikli" />
      </ChartSvg>
    </div>
  )
}

// --- Header ---

function ChartHeader({
  current,
  peak,
  avg,
}: {
  current: number
  peak: number
  avg: number
}) {
  return (
    <>
      <div className="mb-2 font-sans text-[11px] font-bold tracking-widest text-lime-700 uppercase dark:text-lime-400">
        Bicikli u uporabi
      </div>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-serif text-[28px] leading-none text-green-600 tabular-nums dark:text-green-400">
          {fmtHR(current)}
        </span>
        <span className="text-[12px] text-slate-500 dark:text-slate-400">
          trenutno &middot; prosjek {fmtHR(avg, 1)} &middot; vrh {fmtHR(peak)}
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
}: {
  ticks: Date[]
  xScale: ReturnType<typeof scaleTime<number>>
}) {
  return (
    <>
      {ticks.map((t, i) => (
        <text
          key={i}
          x={xScale(t)}
          y={INNER_HEIGHT + 20}
          textAnchor="middle"
          className="fill-slate-400 text-[8px] dark:fill-slate-500"
        >
          {fmtTime(t.getTime() / 1000)}
        </text>
      ))}
    </>
  )
}

function ChartYLabels({
  ticks,
  yScale,
}: {
  ticks: number[]
  yScale: ReturnType<typeof scaleLinear<number>>
}) {
  return (
    <>
      {ticks.map((v) => (
        <text
          key={v}
          x={-8}
          y={(yScale(v) ?? 0) + 1}
          textAnchor="end"
          dominantBaseline="middle"
          className="fill-slate-400 text-[8px] dark:fill-slate-500"
        >
          {fmtHR(v)}
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

// --- State components ---

function LoadingState() {
  return (
    <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-[14px] text-slate-500 dark:text-slate-400">
          <svg className="h-5 w-5 animate-spin text-lime-500" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-25" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          Učitavanje podataka...
        </div>
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
      <div className="rounded-2xl bg-red-50/50 p-8 text-center dark:bg-red-950/10">
        <p className="text-[14px] text-red-700 dark:text-red-400">
          Nije moguće dohvatiti podatke: {message}
        </p>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
      <div className="rounded-2xl bg-slate-50/50 p-8 text-center dark:bg-zinc-900/20">
        <p className="text-[14px] text-slate-600 dark:text-slate-400">
          Podaci se prikupljaju...
        </p>
      </div>
    </div>
  )
}
