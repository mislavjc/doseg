"use client"

import { useState, useMemo } from "react"
import useSWR from "swr"
import { fmtHR } from "@/lib/format"
import { computeXTicks } from "@/lib/chart-utils"
import { scaleLinear, scaleTime } from "@visx/scale"
import { Group } from "@visx/group"
import { BarRounded } from "@visx/shape"
import { GridRows } from "@visx/grid"

// --- Types ---

interface UsagePoint {
  ts: number
  bikesInUse: number
  available: number
  knownFleet: number
}

// --- Constants ---

const CHART_WIDTH = 600
const CHART_HEIGHT = 240
const MARGIN = { top: 16, right: 48, bottom: 40, left: 16 }
const INNER_WIDTH = CHART_WIDTH - MARGIN.left - MARGIN.right
const INNER_HEIGHT = CHART_HEIGHT - MARGIN.top - MARGIN.bottom

// --- Helpers ---

function computeBarLayout(
  points: UsagePoint[],
  xScale: ReturnType<typeof scaleTime<number>>
) {
  const gap =
    points.length > 1
      ? Math.abs(
          (xScale(new Date(points[1].ts * 1000)) ?? 0) -
            (xScale(new Date(points[0].ts * 1000)) ?? 0)
        )
      : 8
  return { gap, barWidth: Math.max(2, gap * 0.65) }
}

function HitAreas({
  points,
  xScale,
  gap,
  onHover,
}: {
  points: UsagePoint[]
  xScale: ReturnType<typeof scaleTime<number>>
  gap: number
  onHover: (p: UsagePoint | null) => void
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

function SvgTooltip({
  x,
  y,
  title,
  value,
  subtitle,
  color = "#3b82f6",
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

function fmtTime(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" })
}

// --- Data fetching ---

function useBajsUsageHistory() {
  const { data, error, isLoading } = useSWR<UsagePoint[]>(
    "bajs-usage-history",
    () =>
      fetch("/api/rt/bajs-usage-history").then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      }),
    { refreshInterval: 60_000, keepPreviousData: true }
  )
  return {
    points: data ?? null,
    error: error ? (error as Error).message : null,
    isLoading,
  }
}

// --- Scales ---

function useUsageScales(points: UsagePoint[]) {
  return useMemo(() => {
    const tsMin = points.reduce((m, p) => Math.min(m, p.ts), Infinity)
    const tsMax = points.reduce((m, p) => Math.max(m, p.ts), -Infinity)
    const maxBikes = points.reduce((m, p) => Math.max(m, p.bikesInUse), 0)

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
  const [hovered, setHovered] = useState<UsagePoint | null>(null)
  const { xScale, yScale, xTicks, yTicks, current, peak, avg } =
    useUsageScales(points)
  const { gap, barWidth } = computeBarLayout(points, xScale)

  return (
    <div className="flex flex-col overflow-hidden border-t border-slate-100 pt-8 dark:border-white/5">
      <div className="overflow-hidden rounded-[12px] bg-[#f9f9f9] p-5 sm:p-6 dark:bg-[#1a1a1a]">
        <ChartHeader current={current} peak={peak} />
        <div className="mt-8 mb-4">
          <h4 className="text-[15px] font-medium text-slate-500">Dnevni trend korištenja</h4>
        </div>
        <ChartSvg label="Grafikon korištenja BAJS bicikala">
          <GridRows
            scale={yScale}
            width={INNER_WIDTH}
            tickValues={yTicks}
            stroke="#e2e8f0"
            strokeOpacity={0.5}
            strokeWidth={1}
            strokeDasharray="4 4"
            className="dark:stroke-slate-700"
          />
          {yTicks[0] <= 0 && (
            <line x1={0} y1={yScale(0) ?? 0} x2={INNER_WIDTH} y2={yScale(0) ?? 0} stroke="#94a3b8" strokeWidth={1} strokeOpacity={0.2} />
          )}
          
          {/* Bars */}
          {points.map((p) => {
            const xPos = xScale(new Date(p.ts * 1000)) ?? 0
            const yPos = yScale(p.bikesInUse) ?? 0
            const barHeight = Math.max(INNER_HEIGHT - yPos, 4)
            const isHovered = hovered === p
            const opacity = isHovered ? 1 : 0.85
            
            // Color based on usage (e.g., above avg vs below avg, or just uniform)
            const color = p.bikesInUse > avg * 1.2 ? "#3b82f6" : "#60a5fa"
            
            return (
              <BarRounded
                key={p.ts}
                x={xPos - barWidth / 2}
                y={INNER_HEIGHT - barHeight}
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
          
          <HitAreas points={points} xScale={xScale} gap={gap} onHover={setHovered} />
          
          <ChartXLabels ticks={xTicks} xScale={xScale} />
          <ChartYLabels ticks={yTicks} yScale={yScale} />
          
          {hovered && (
            <SvgTooltip 
              x={xScale(new Date(hovered.ts * 1000)) ?? 0} 
              y={(yScale(hovered.bikesInUse) ?? 0) - 10} 
              title={fmtTime(hovered.ts)} 
              value={`${hovered.bikesInUse} bicikala`} 
              subtitle={`${hovered.available} dostupno na stanicama`} 
              color={hovered.bikesInUse > avg * 1.2 ? "#3b82f6" : "#60a5fa"}
            />
          )}
        </ChartSvg>
      </div>
    </div>
  )
}

// --- Header ---

function ChartHeader({
  current,
  peak,
}: {
  current: number
  peak: number
}) {
  return (
    <div className="flex flex-col mb-8">
      <h3 className="mb-6 font-sans text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl dark:text-slate-100">Trend korištenja</h3>
      
      <div className="flex flex-wrap gap-8 sm:gap-12">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 text-[13px] text-slate-500 font-medium mb-1">
            <span className="w-1 h-3 rounded-full bg-[#3b82f6]"></span>
            Trenutno
          </div>
          <span className="font-sans text-4xl sm:text-[40px] font-medium leading-none tracking-tight text-slate-900 dark:text-slate-100 mb-1">
            {fmtHR(current)}
          </span>
          <span className="text-[13px] text-slate-500">
            u uporabi
          </span>
        </div>
        
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 text-[13px] text-slate-500 font-medium mb-1">
            <span className="w-1 h-3 rounded-full bg-slate-300 dark:bg-slate-700"></span>
            Maksimum
          </div>
          <span className="font-sans text-4xl sm:text-[40px] font-medium leading-none tracking-tight text-slate-900 dark:text-slate-100 mb-1">
            {fmtHR(peak)}
          </span>
          <span className="text-[13px] text-slate-500">
            najviše istovremeno
          </span>
        </div>
      </div>
    </div>
  )
}

// --- Shared chart primitives ---

function ChartSvg({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="relative mx-auto w-full overflow-hidden">
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
}: {
  ticks: Date[]
  xScale: ReturnType<typeof scaleTime<number>>
}) {
  // Skip labels when ticks are too dense to avoid overlap.
  // Approximate label width in SVG units (~44px for "HH:MM" at 11px font).
  const minLabelSpacing = 48
  const step =
    ticks.length > 1
      ? Math.max(
          1,
          Math.ceil(
            minLabelSpacing /
              Math.abs((xScale(ticks[1]) ?? 0) - (xScale(ticks[0]) ?? 0))
          )
        )
      : 1

  return (
    <>
      {ticks.map((t, i) =>
        i % step === 0 ? (
          <text
            key={t.getTime()}
            x={xScale(t)}
            y={INNER_HEIGHT + 24}
            textAnchor="middle"
            className="fill-slate-500 text-[11px] font-medium dark:fill-slate-400"
          >
            {fmtTime(t.getTime() / 1000)}
          </text>
        ) : null
      )}
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
          x={INNER_WIDTH + 8}
          y={(yScale(v) ?? 0) + 1}
          textAnchor="start"
          dominantBaseline="middle"
          className="fill-slate-500 text-[11px] font-medium dark:fill-slate-400"
        >
          {fmtHR(v)}
        </text>
      ))}
    </>
  )
}

// --- State components ---

function LoadingState() {
  return (
    <div className="flex flex-col border-t border-slate-100 pt-8 dark:border-white/5">
      <div className="mb-6 font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
        Dnevni trend
      </div>
      <div className="rounded-[12px] bg-[#f9f9f9] p-5 sm:p-6 dark:bg-[#1a1a1a]">
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-[15px] text-slate-500 dark:text-slate-400">
            <svg
              className="h-5 w-5 animate-spin text-lime-500"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
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
            Učitavanje podataka...
          </div>
        </div>
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col border-t border-slate-100 pt-8 dark:border-white/5">
      <div className="mb-6 font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
        Dnevni trend
      </div>
      <div className="rounded-[12px] bg-[#f9f9f9] p-5 sm:p-6 dark:bg-[#1a1a1a]">
        <div className="rounded-2xl bg-red-50/50 p-8 text-center dark:bg-red-950/10">
          <p className="text-[15px] text-red-700 dark:text-red-400">
            Nije moguće dohvatiti podatke: {message}
          </p>
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col border-t border-slate-100 pt-8 dark:border-white/5">
      <div className="mb-6 font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
        Dnevni trend
      </div>
      <div className="rounded-[12px] bg-[#f9f9f9] p-5 sm:p-6 dark:bg-[#1a1a1a]">
        <div className="rounded-2xl bg-slate-50/50 p-8 text-center dark:bg-zinc-900/20">
          <p className="text-[15px] text-slate-600 dark:text-slate-400">
            Podaci se prikupljaju...
          </p>
        </div>
      </div>
    </div>
  )
}
