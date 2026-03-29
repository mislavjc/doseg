"use client"

import { useMemo, useState } from "react"
import { StatModuleLead, StatModuleTitle } from "./stat-typography"
import useSWR from "swr"
import { fmtDelaySec, pickPreferredRoute } from "@/lib/format"
import { scaleLinear, scalePoint } from "@visx/scale"
import { Group } from "@visx/group"
import { LinePath } from "@visx/shape"
import { GridRows } from "@visx/grid"

interface DelayProfilePoint {
  seq: number
  stopName: string
  avgDelay: number
  p90Delay: number
  samples: number
}

interface DelayProfileData {
  route: string
  points: DelayProfilePoint[]
}

const CHART_MARGIN = { top: 20, right: 20, bottom: 80, left: 50 }

function useJumpStops(points: DelayProfilePoint[]) {
  return useMemo(() => {
    const jumps = new Set<number>()
    for (let i = 1; i < points.length; i++) {
      if (points[i].avgDelay - points[i - 1].avgDelay > 30) {
        jumps.add(i)
      }
    }
    return jumps
  }, [points])
}

function ChartGrid({
  yScale,
  innerW,
}: {
  yScale: ReturnType<typeof scaleLinear<number>>
  innerW: number
}) {
  const ticks = yScale.ticks(5)
  return (
    <>
      <GridRows
        scale={yScale}
        width={innerW}
        stroke="currentColor"
        className="text-slate-100 dark:text-slate-800"
        numTicks={5}
      />
      {ticks.map((t) => (
        <text
          key={t}
          x={-8}
          y={yScale(t)}
          textAnchor="end"
          dominantBaseline="central"
          className="fill-slate-500 text-[10px] dark:fill-slate-400"
        >
          {fmtDelaySec(t)}
        </text>
      ))}
    </>
  )
}

function ChartDots({
  points,
  xScale,
  yScale,
  jumpStops,
}: {
  points: DelayProfilePoint[]
  xScale: ReturnType<typeof scalePoint<string>>
  yScale: ReturnType<typeof scaleLinear<number>>
  jumpStops: Set<number>
}) {
  return (
    <>
      {points.map((p, i) => {
        const cx = xScale(p.stopName) ?? 0
        const cy = yScale(p.avgDelay)
        const isJump = jumpStops.has(i)
        return (
          <g key={p.seq}>
            {isJump && (
              <circle
                cx={cx}
                cy={cy}
                r={8}
                className="fill-none stroke-amber-400/90 stroke-2 dark:stroke-amber-400/70"
              />
            )}
            <circle
              cx={cx}
              cy={cy}
              r={isJump ? 3.5 : 3}
              className={
                isJump
                  ? "fill-amber-500 dark:fill-amber-400"
                  : "fill-slate-700 dark:fill-slate-300"
              }
            />
          </g>
        )
      })}
    </>
  )
}

function ChartXLabels({
  points,
  xScale,
  innerH,
}: {
  points: DelayProfilePoint[]
  xScale: ReturnType<typeof scalePoint<string>>
  innerH: number
}) {
  return (
    <>
      {points.map((p) => {
        const x = xScale(p.stopName) ?? 0
        const label =
          p.stopName.length > 16
            ? p.stopName.slice(0, 15) + "\u2026"
            : p.stopName
        return (
          <text
            key={p.seq}
            x={x}
            y={innerH + 12}
            textAnchor="end"
            transform={`rotate(-45 ${x} ${innerH + 12})`}
            className="fill-slate-500 text-[9px] dark:fill-slate-400"
          >
            {label}
          </text>
        )
      })}
    </>
  )
}

function DelayChart({ data }: { data: DelayProfileData }) {
  const points = data.points
  const width = Math.max(
    720,
    points.length * 28 + CHART_MARGIN.left + CHART_MARGIN.right
  )
  const height = 340
  const innerW = width - CHART_MARGIN.left - CHART_MARGIN.right
  const innerH = height - CHART_MARGIN.top - CHART_MARGIN.bottom
  const jumpStops = useJumpStops(points)

  const xScale = scalePoint<string>({
    domain: points.map((p) => p.stopName),
    range: [0, innerW],
    padding: 0.5,
  })
  const maxDelay = Math.max(
    ...points.map((p) => Math.max(p.avgDelay, p.p90Delay)),
    10
  )
  const minDelay = Math.min(
    ...points.map((p) => Math.min(p.avgDelay, p.p90Delay)),
    0
  )
  const yScale = scaleLinear<number>({
    domain: [minDelay < 0 ? minDelay * 1.15 : 0, maxDelay * 1.15],
    range: [innerH, 0],
    nice: true,
  })

  return (
    <div className="overflow-x-auto rounded-[12px] bg-[#f9f9f9] p-5 sm:p-6 dark:bg-[#1a1a1a]">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block"
        role="img"
        aria-label="Graf propagacije kašnjenja po stajalištima"
      >
        <Group left={CHART_MARGIN.left} top={CHART_MARGIN.top}>
          <ChartGrid yScale={yScale} innerW={innerW} />
          {minDelay < 0 && (
            <line
              x1={0}
              y1={yScale(0)}
              x2={innerW}
              y2={yScale(0)}
              stroke="#94a3b8"
              strokeWidth={1}
              strokeOpacity={0.4}
            />
          )}
          <LinePath
            data={points}
            x={(d) => xScale(d.stopName) ?? 0}
            y={(d) => yScale(d.p90Delay)}
            stroke="currentColor"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            className="text-slate-400 dark:text-slate-500"
          />
          <LinePath
            data={points}
            x={(d) => xScale(d.stopName) ?? 0}
            y={(d) => yScale(d.avgDelay)}
            stroke="currentColor"
            strokeWidth={2}
            className="text-slate-800 dark:text-slate-200"
          />
          <ChartDots
            points={points}
            xScale={xScale}
            yScale={yScale}
            jumpStops={jumpStops}
          />
          <ChartXLabels points={points} xScale={xScale} innerH={innerH} />
        </Group>
      </svg>
    </div>
  )
}

function ChartLegend() {
  return (
    <div className="mb-6 flex flex-wrap gap-6 text-[11px] font-medium tracking-widest text-slate-500 uppercase dark:text-slate-400">
      <span className="flex items-center gap-2">
        <span className="inline-block h-0.5 w-4 bg-slate-800 dark:bg-slate-200" />{" "}
        Prosječno kašnjenje
      </span>
      <span className="flex items-center gap-2">
        <span className="inline-block h-0.5 w-4 border-t border-dashed border-slate-400 dark:border-slate-500" />{" "}
        P90 kašnjenje
      </span>
      <span className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full border border-amber-500 bg-amber-500/20 dark:border-amber-400" />{" "}
        Nagli porast
      </span>
    </div>
  )
}

function DelayProfileBody({
  data,
  error,
  isLoading,
  selectedRoute,
}: {
  data: DelayProfileData | undefined
  error: Error | undefined
  isLoading: boolean
  selectedRoute: string
}) {
  if (error)
    return (
      <p className="text-[13px] text-slate-500 dark:text-slate-400">
        Podaci nisu dostupni
      </p>
    )
  if (isLoading || !data) {
    return (
      <div
        className="flex h-40 items-center justify-center"
        role="status"
        aria-label="Učitavanje"
      >
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
        <span className="sr-only">Učitavanje...</span>
      </div>
    )
  }
  if (data.points.length === 0) {
    return (
      <div className="rounded-[12px] bg-[#f9f9f9] p-8 text-center sm:p-12 dark:bg-[#1a1a1a]">
        <p className="text-[14px] text-slate-500 dark:text-slate-400">
          Nema podataka o kašnjenju za liniju {selectedRoute} u zadnjih 24h
        </p>
      </div>
    )
  }
  return (
    <div className="flex flex-col">
      <ChartLegend />
      <DelayChart data={data} />
    </div>
  )
}

function RouteSelector({
  routes,
  selectedRoute,
  onChange,
}: {
  routes: string[]
  selectedRoute: string
  onChange: (route: string) => void
}) {
  if (routes.length === 0) return null
  return (
    <select
      value={selectedRoute}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Linija"
      className="h-10 min-w-[160px] rounded-full border border-slate-100 bg-white/80 px-4 text-[14px] font-medium text-slate-700 transition-colors hover:border-slate-300 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none dark:border-white/10 dark:bg-zinc-900/80 dark:text-slate-200 dark:hover:border-white/20"
    >
      {routes.map((r) => (
        <option key={r} value={r}>
          Linija {r}
        </option>
      ))}
    </select>
  )
}

export default function DelayPropagationSection({
  routes,
}: {
  routes: string[]
}) {
  const [selectedRoute, setSelectedRoute] = useState(() =>
    pickPreferredRoute(routes)
  )
  const key = selectedRoute
    ? `/api/rt/delay-profile?route=${encodeURIComponent(selectedRoute)}`
    : null
  const { data, error, isLoading } = useSWR<DelayProfileData>(key, {
    keepPreviousData: true,
  })

  return (
    <section className="flex flex-col border-t border-slate-100 py-16 sm:py-24 dark:border-white/10">
      <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <StatModuleTitle>Propagacija kašnjenja</StatModuleTitle>
          <StatModuleLead>
            Kako se kašnjenje razvija duž linije - od prve do zadnje stanice.
            Crveni krugovi označavaju stanice s naglim porastom kašnjenja.
          </StatModuleLead>
        </div>
        <RouteSelector
          routes={routes}
          selectedRoute={selectedRoute}
          onChange={setSelectedRoute}
        />
      </div>
      <DelayProfileBody
        data={data}
        error={error}
        isLoading={isLoading}
        selectedRoute={selectedRoute}
      />
    </section>
  )
}
