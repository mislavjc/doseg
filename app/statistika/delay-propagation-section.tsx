"use client"

import { useState } from "react"
import { StatModuleLead, StatModuleTitle } from "./stat-typography"
import useSWR from "swr"
import { fmtDelaySec, pickPreferredRoute } from "@/lib/format"
import { scaleLinear, scalePoint } from "@visx/scale"
import { Group } from "@visx/group"
import { LinePath } from "@visx/shape"
import { curveStepAfter } from "@visx/curve"
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

const DELAY_CHART_MARGIN = { top: 30, right: 20, bottom: 80, left: 50 }

function useDelayProfileScales(points: DelayProfilePoint[]) {
  const width = Math.max(720, points.length * 32 + 80)
  const height = 240
  const innerW = width - DELAY_CHART_MARGIN.left - DELAY_CHART_MARGIN.right
  const innerH = height - DELAY_CHART_MARGIN.top - DELAY_CHART_MARGIN.bottom

  const xScale = scalePoint<string>({
    domain: points.map((p) => p.stopName),
    range: [0, innerW],
    padding: 0.5,
  })
  const maxDelay = Math.max(...points.map((p) => Math.max(p.avgDelay, p.p90Delay)), 10)
  const minDelay = Math.min(...points.map((p) => Math.min(p.avgDelay, p.p90Delay)), 0)
  const yScale = scaleLinear<number>({
    domain: [minDelay < 0 ? minDelay * 1.15 : 0, maxDelay * 1.15],
    range: [innerH, 0],
    nice: true,
  })

  return { width, height, innerW, innerH, xScale, yScale, minDelay }
}

function StopXLabels({
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
      {points.map((p, i) => {
        if (i % 2 !== 0 && points.length > 20) return null
        const x = xScale(p.stopName) ?? 0
        const label = p.stopName.length > 12 ? p.stopName.slice(0, 11) + "\u2026" : p.stopName
        return (
          <text key={p.seq} x={x} y={innerH + 16} textAnchor="end" transform={`rotate(-45 ${x} ${innerH + 16})`} className="fill-slate-500 text-[10px] dark:fill-slate-400">
            {label}
          </text>
        )
      })}
    </>
  )
}

function DelayChart({ data }: { data: DelayProfileData }) {
  const points = data.points
  const { width, height, innerW, innerH, xScale, yScale, minDelay } =
    useDelayProfileScales(points)

  const lastPoint = points[points.length - 1]
  const lastX = xScale(lastPoint.stopName) ?? 0
  const lastY = yScale(lastPoint.avgDelay)

  return (
    <div className="flex flex-col gap-3 rounded-[12px] bg-[#f9f9f9] p-5 sm:p-6 dark:bg-[#1a1a1a]">
      <div className="overflow-x-auto">
        <svg width={width} height={height} className="block overflow-visible" role="img" aria-label="Graf propagacije kašnjenja">
          <Group left={DELAY_CHART_MARGIN.left} top={DELAY_CHART_MARGIN.top}>
            <GridRows scale={yScale} width={innerW} stroke="#cbd5e1" strokeOpacity={0.4} strokeWidth={1} className="dark:stroke-slate-700" />
            {minDelay < 0 && (
              <line x1={0} y1={yScale(0)} x2={innerW} y2={yScale(0)} stroke="#94a3b8" strokeWidth={1} strokeOpacity={0.6} strokeDasharray="4 4" />
            )}
            {yScale.ticks(4).map(t => (
              <text key={t} x={-8} y={yScale(t)} textAnchor="end" fontSize={11} dominantBaseline="central" className="fill-slate-600 dark:fill-slate-400">
                {fmtDelaySec(t)}
              </text>
            ))}
            <StopXLabels points={points} xScale={xScale} innerH={innerH} />
            <LinePath data={points} x={d => xScale(d.stopName) ?? 0} y={d => yScale(d.p90Delay)} stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 4" curve={curveStepAfter} />
            <LinePath data={points} x={d => xScale(d.stopName) ?? 0} y={d => yScale(d.avgDelay)} stroke="#0072CE" strokeWidth={2} curve={curveStepAfter} />
            <circle cx={lastX} cy={lastY} r={3} fill="#0072CE" stroke="#fff" strokeWidth={1.5} className="dark:stroke-zinc-900" />
            <text x={lastX + 12} y={lastY - 12} fill="#0072CE" fontSize={12} fontWeight="bold" className="dark:fill-sky-400">
              {fmtDelaySec(lastPoint.avgDelay)}
            </text>
          </Group>
        </svg>
      </div>
    </div>
  )
}

function ChartLegend() {
  return (
    <div className="mb-6 flex flex-wrap gap-6 text-[13px] font-medium text-slate-500 dark:text-slate-400">
      <span className="flex items-center gap-2">
        <span className="inline-block h-0.5 w-4 bg-blue-500" />{" "}
        Prosječno kašnjenje
      </span>
      <span className="flex items-center gap-2">
        <span className="inline-block h-0.5 w-4 border-t border-dashed border-slate-400 dark:border-slate-500" />{" "}
        P90 kašnjenje
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
        <p className="text-[15px] text-slate-500 dark:text-slate-400">
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
      className="h-10 min-w-[160px] rounded-full border border-slate-100 bg-white/80 px-4 text-[15px] font-medium text-slate-700 transition-colors hover:border-slate-300 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none dark:border-white/10 dark:bg-zinc-900/80 dark:text-slate-200 dark:hover:border-white/20"
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
            Kako se kašnjenje razvija duž linije, od prve do zadnje stanice.
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
