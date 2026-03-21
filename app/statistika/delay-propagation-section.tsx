"use client"

import { useMemo, useState } from "react"
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

function ChartGrid({ yScale, innerW }: { yScale: ReturnType<typeof scaleLinear<number>>; innerW: number }) {
  const ticks = yScale.ticks(5)
  return (
    <>
      <GridRows scale={yScale} width={innerW} stroke="currentColor" className="text-slate-100 dark:text-slate-800" numTicks={5} />
      {ticks.map((t) => (
        <text key={t} x={-8} y={yScale(t)} textAnchor="end" dominantBaseline="central" className="fill-slate-500 text-[10px] dark:fill-slate-400">
          {fmtDelaySec(t)}
        </text>
      ))}
    </>
  )
}

function ChartDots({
  points, xScale, yScale, jumpStops,
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
            {isJump && <circle cx={cx} cy={cy} r={8} className="fill-red-100 dark:fill-red-900/40" />}
            <circle cx={cx} cy={cy} r={3} className={isJump ? "fill-red-500 dark:fill-red-400" : "fill-emerald-600 dark:fill-emerald-400"} />
          </g>
        )
      })}
    </>
  )
}

function ChartXLabels({ points, xScale, innerH }: {
  points: DelayProfilePoint[]
  xScale: ReturnType<typeof scalePoint<string>>
  innerH: number
}) {
  return (
    <>
      {points.map((p) => {
        const x = xScale(p.stopName) ?? 0
        const label = p.stopName.length > 16 ? p.stopName.slice(0, 15) + "\u2026" : p.stopName
        return (
          <text key={p.seq} x={x} y={innerH + 12} textAnchor="end" transform={`rotate(-45 ${x} ${innerH + 12})`} className="fill-slate-500 text-[9px] dark:fill-slate-400">
            {label}
          </text>
        )
      })}
    </>
  )
}

function DelayChart({ data }: { data: DelayProfileData }) {
  const points = data.points
  const width = Math.max(720, points.length * 28 + CHART_MARGIN.left + CHART_MARGIN.right)
  const height = 340
  const innerW = width - CHART_MARGIN.left - CHART_MARGIN.right
  const innerH = height - CHART_MARGIN.top - CHART_MARGIN.bottom
  const jumpStops = useJumpStops(points)

  const xScale = scalePoint<string>({ domain: points.map((p) => p.stopName), range: [0, innerW], padding: 0.5 })
  const maxDelay = Math.max(...points.map((p) => Math.max(p.avgDelay, p.p90Delay)), 10)
  const minDelay = Math.min(...points.map((p) => Math.min(p.avgDelay, p.p90Delay)), 0)
  const yScale = scaleLinear<number>({ domain: [minDelay < 0 ? minDelay * 1.15 : 0, maxDelay * 1.15], range: [innerH, 0], nice: true })

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
        <Group left={CHART_MARGIN.left} top={CHART_MARGIN.top}>
          <ChartGrid yScale={yScale} innerW={innerW} />
          {minDelay < 0 && (
            <line x1={0} y1={yScale(0)} x2={innerW} y2={yScale(0)} stroke="#94a3b8" strokeWidth={1} strokeOpacity={0.4} />
          )}
          <LinePath data={points} x={(d) => xScale(d.stopName) ?? 0} y={(d) => yScale(d.p90Delay)} stroke="currentColor" strokeWidth={1.5} strokeDasharray="4 3" className="text-rose-300 dark:text-rose-500/60" />
          <LinePath data={points} x={(d) => xScale(d.stopName) ?? 0} y={(d) => yScale(d.avgDelay)} stroke="currentColor" strokeWidth={2} className="text-emerald-600 dark:text-emerald-400" />
          <ChartDots points={points} xScale={xScale} yScale={yScale} jumpStops={jumpStops} />
          <ChartXLabels points={points} xScale={xScale} innerH={innerH} />
        </Group>
      </svg>
    </div>
  )
}

function ChartLegend() {
  return (
    <div className="mb-3 flex gap-6 text-[10px] text-slate-500 dark:text-slate-400">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-4 bg-emerald-600 dark:bg-emerald-400" /> prosječno kašnjenje
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-4 border-t border-dashed border-rose-300 dark:border-rose-500/60" /> p90 kašnjenje
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-red-500 dark:bg-red-400" /> nagli porast
      </span>
    </div>
  )
}

function DelayProfileBody({ data, error, isLoading, selectedRoute }: {
  data: DelayProfileData | undefined
  error: Error | undefined
  isLoading: boolean
  selectedRoute: string
}) {
  if (error) return <p className="text-[13px] text-slate-500 dark:text-slate-400">Podaci nisu dostupni</p>
  if (isLoading || !data) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-500" />
      </div>
    )
  }
  if (data.points.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
        <p className="text-[13px] text-slate-400">
          Nema podataka o kašnjenju za liniju {selectedRoute} u zadnjih 24h
        </p>
      </div>
    )
  }
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
      <ChartLegend />
      <DelayChart data={data} />
    </div>
  )
}

function RouteSelector({ routes, selectedRoute, onChange }: {
  routes: string[]
  selectedRoute: string
  onChange: (route: string) => void
}) {
  if (routes.length === 0) return null
  return (
    <select
      value={selectedRoute}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] text-slate-700 shadow-sm dark:border-slate-700 dark:bg-zinc-900 dark:text-slate-300"
    >
      {routes.map((r) => (
        <option key={r} value={r}>Linija {r}</option>
      ))}
    </select>
  )
}

export default function DelayPropagationSection({ routes }: { routes: string[] }) {
  const [selectedRoute, setSelectedRoute] = useState(() => pickPreferredRoute(routes))
  const key = selectedRoute ? `/api/rt/delay-profile?route=${encodeURIComponent(selectedRoute)}` : null
  const { data, error, isLoading } = useSWR<DelayProfileData>(key, { keepPreviousData: true })

  return (
    <section className="mt-24">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-serif text-[24px] text-slate-900 dark:text-slate-100">
          Propagacija kašnjenja
        </h2>
        <RouteSelector routes={routes} selectedRoute={selectedRoute} onChange={setSelectedRoute} />
      </div>
      <p className="mb-8 max-w-xl text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
        Kako se kašnjenje razvija duž linije - od prve do zadnje stanice.
        Crveni krugovi označavaju stanice s naglim porastom kašnjenja.
      </p>
      <DelayProfileBody data={data} error={error} isLoading={isLoading} selectedRoute={selectedRoute} />
    </section>
  )
}
