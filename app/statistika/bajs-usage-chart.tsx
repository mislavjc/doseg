"use client"

import { useState, useMemo } from "react"
import useSWR from "swr"
import { fmtHR } from "@/lib/format"
import { computeXTicks } from "@/lib/chart-utils"
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

interface UsagePoint {
  ts: number
  bikesInUse: number
  available: number
  knownFleet: number
}

// --- Constants ---

const CHART_WIDTH = 600
const INNER_WIDTH = CHART_WIDTH - MARGIN.left - MARGIN.right

// --- Helpers ---

function fmtTime(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" })
}

// --- Data fetching ---

function useBajsUsageHistory() {
  const { data, error, isLoading } = useSWR<Array<UsagePoint>, Error>(
    "bajs-usage-history",
    () =>
      fetch("/api/rt/bajs-usage-history").then((r) => {
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}`)
        }
        return r.json()
      }),
    { refreshInterval: 60_000, keepPreviousData: true }
  )
  return {
    points: data ?? null,
    error: error ? error.message : null,
    isLoading,
  }
}

// --- Scales ---

function useUsageScales(points: Array<UsagePoint>) {
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

  if (error) {
    return <ErrorState message={error} />
  }
  if (isLoading || !points) {
    return <LoadingState />
  }
  if (points.length === 0) {
    return <EmptyState />
  }

  return <ChartCard points={points} />
}

// --- Chart card ---

function ChartCard({ points }: { points: Array<UsagePoint> }) {
  const [hovered, setHovered] = useState<UsagePoint | null>(null)
  const { xScale, yScale, xTicks, yTicks, current, peak, avg } =
    useUsageScales(points)
  const { gap, barWidth } = computeBarLayout(points, xScale, 2, 0.65)
  const barColor = (v: number) =>
    v > avg * 1.2 ? "var(--zg-blue)" : "var(--blue-pale)"

  return (
    <div className="flex flex-col overflow-hidden border-t border-hairline pt-8">
      <div className="overflow-hidden bg-surface p-5 sm:p-6">
        <ChartHeader current={current} peak={peak} />
        <div className="mt-8 mb-4">
          <h4 className="text-body text-ink-muted">Dnevni trend korištenja</h4>
        </div>
        <ChartSvg
          width={CHART_WIDTH}
          clip
          label="Grafikon korištenja BAJS bicikala"
        >
          <ChartGrid yScale={yScale} yTicks={yTicks} innerWidth={INNER_WIDTH} />
          {yTicks[0] <= 0 && (
            <line
              x1={0}
              y1={yScale(0) ?? 0}
              x2={INNER_WIDTH}
              y2={yScale(0) ?? 0}
              stroke="var(--ink-faint)"
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
            value={(p) => p.bikesInUse}
            color={barColor}
          />

          <HitAreas
            points={points}
            xScale={xScale}
            gap={gap}
            onHover={setHovered}
          />

          <ChartXLabels ticks={xTicks} xScale={xScale} />
          <ChartYLabels
            ticks={yTicks}
            yScale={yScale}
            innerWidth={INNER_WIDTH}
            format={fmtHR}
          />

          {hovered && (
            <SvgTooltip
              x={xScale(new Date(hovered.ts * 1000)) ?? 0}
              y={(yScale(hovered.bikesInUse) ?? 0) - 10}
              innerWidth={INNER_WIDTH}
              title={fmtTime(hovered.ts)}
              value={`${hovered.bikesInUse} ${plural(hovered.bikesInUse, "bicikl", "bicikla", "bicikala")}`}
              subtitle={`${hovered.available} dostupno na stanicama`}
              color={barColor(hovered.bikesInUse)}
            />
          )}
        </ChartSvg>
      </div>
    </div>
  )
}

// --- Header ---

function ChartHeader({ current, peak }: { current: number; peak: number }) {
  return (
    <div className="mb-8 flex flex-col">
      <h3 className="mb-6 font-sans text-head font-bold text-ink">
        Trend korištenja
      </h3>

      <div className="flex flex-wrap gap-8 sm:gap-12">
        <div className="flex flex-col">
          <div className="mb-1 flex items-center gap-1.5 text-body text-ink-muted">
            <span className="h-3 w-1 bg-zg-blue"></span>
            Trenutno
          </div>
          <span className="mb-1 font-sans text-head font-bold text-ink">
            {fmtHR(current)}
          </span>
          <span className="text-body text-ink-muted">u uporabi</span>
        </div>

        <div className="flex flex-col">
          <div className="mb-1 flex items-center gap-1.5 text-body text-ink-muted">
            <span className="h-3 w-1 bg-ink-ghost"></span>
            Maksimum
          </div>
          <span className="mb-1 font-sans text-head font-bold text-ink">
            {fmtHR(peak)}
          </span>
          <span className="text-body text-ink-muted">najviše istovremeno</span>
        </div>
      </div>
    </div>
  )
}

// --- Shared chart primitives ---

function ChartXLabels({
  ticks,
  xScale,
}: {
  ticks: Array<Date>
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
            className="fill-ink-muted font-mono text-label"
          >
            {fmtTime(t.getTime() / 1000)}
          </text>
        ) : null
      )}
    </>
  )
}

// --- State components ---

function LoadingState() {
  return (
    <div className="flex flex-col border-t border-hairline pt-8">
      <div className="mb-6 font-mono text-label font-bold text-ink-muted">
        Dnevni trend
      </div>
      <div className="bg-surface p-5 sm:p-6">
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-body text-ink-muted">
            <svg
              className="h-5 w-5 animate-spin text-zg-blue"
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
    <div className="flex flex-col border-t border-hairline pt-8">
      <div className="mb-6 font-mono text-label font-bold text-ink-muted">
        Dnevni trend
      </div>
      <div className="border-l-2 border-ink bg-surface p-5">
        <p className="font-mono text-label text-ink">
          Nije moguće dohvatiti podatke: {message}
        </p>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col border-t border-hairline pt-8">
      <div className="mb-6 font-mono text-label font-bold text-ink-muted">
        Dnevni trend
      </div>
      <div className="bg-surface p-5 sm:p-6">
        <div className="bg-surface p-8 text-center">
          <p className="text-body text-ink-2">Podaci se prikupljaju...</p>
        </div>
      </div>
    </div>
  )
}
