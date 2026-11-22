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
  points: Array<DelayProfilePoint>
}

const DELAY_CHART_MARGIN = { top: 30, right: 20, bottom: 80, left: 50 }

function useDelayProfileScales(points: Array<DelayProfilePoint>) {
  const width = Math.max(720, points.length * 32 + 80)
  const height = 240
  const innerW = width - DELAY_CHART_MARGIN.left - DELAY_CHART_MARGIN.right
  const innerH = height - DELAY_CHART_MARGIN.top - DELAY_CHART_MARGIN.bottom

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

  return { width, height, innerW, innerH, xScale, yScale, minDelay }
}

function StopXLabels({
  points,
  xScale,
  innerH,
}: {
  points: Array<DelayProfilePoint>
  xScale: ReturnType<typeof scalePoint<string>>
  innerH: number
}) {
  return (
    <>
      {points.map((p, i) => {
        if (i % 2 !== 0 && points.length > 20) {
          return null
        }
        const x = xScale(p.stopName) ?? 0
        const label =
          p.stopName.length > 12
            ? p.stopName.slice(0, 11) + "\u2026"
            : p.stopName
        return (
          <text
            key={p.seq}
            x={x}
            y={innerH + 16}
            textAnchor="end"
            transform={`rotate(-45 ${x} ${innerH + 16})`}
            className="fill-ink-muted font-mono text-label"
          >
            {label}
          </text>
        )
      })}
    </>
  )
}

function LastPointMarker({
  x,
  y,
  delay,
}: {
  x: number
  y: number
  delay: number
}) {
  return (
    <>
      <circle
        cx={x}
        cy={y}
        r={3}
        fill="var(--zg-blue)"
        stroke="var(--ground)"
        strokeWidth={1.5}
        className=""
      />
      <text
        x={x + 12}
        y={y - 12}
        fill="var(--zg-blue)"
        fontSize={12}
        fontWeight="bold"
        className=""
      >
        {fmtDelaySec(delay)}
      </text>
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
    <div className="flex flex-col gap-3 bg-surface p-5 sm:p-6">
      <div className="overflow-x-auto">
        <svg
          width={width}
          height={height}
          className="block overflow-visible"
          role="img"
          aria-label="Graf propagacije kašnjenja"
        >
          <Group left={DELAY_CHART_MARGIN.left} top={DELAY_CHART_MARGIN.top}>
            <GridRows
              scale={yScale}
              width={innerW}
              stroke="var(--ink-ghost)"
              strokeOpacity={0.4}
              strokeWidth={1}
              className=""
            />
            {minDelay < 0 && (
              <line
                x1={0}
                y1={yScale(0)}
                x2={innerW}
                y2={yScale(0)}
                stroke="var(--ink-faint)"
                strokeWidth={1}
                strokeOpacity={0.6}
                strokeDasharray="4 4"
              />
            )}
            {yScale.ticks(4).map((t) => (
              <text
                key={t}
                x={-8}
                y={yScale(t)}
                textAnchor="end"
                fontSize={11}
                dominantBaseline="central"
                className="fill-ink-muted"
              >
                {fmtDelaySec(t)}
              </text>
            ))}
            <StopXLabels points={points} xScale={xScale} innerH={innerH} />
            <LinePath
              data={points}
              x={(d) => xScale(d.stopName) ?? 0}
              y={(d) => yScale(d.p90Delay)}
              stroke="var(--ink-faint)"
              strokeWidth={1}
              strokeDasharray="4 4"
              curve={curveStepAfter}
            />
            <LinePath
              data={points}
              x={(d) => xScale(d.stopName) ?? 0}
              y={(d) => yScale(d.avgDelay)}
              stroke="var(--zg-blue)"
              strokeWidth={2}
              curve={curveStepAfter}
            />
            <LastPointMarker x={lastX} y={lastY} delay={lastPoint.avgDelay} />
          </Group>
        </svg>
      </div>
    </div>
  )
}

function ChartLegend() {
  return (
    <div className="mb-6 flex flex-wrap gap-6 text-body text-ink-muted">
      <span className="flex items-center gap-2">
        <span className="inline-block h-0.5 w-4 bg-zg-blue" /> Prosječno
        kašnjenje
      </span>
      <span className="flex items-center gap-2">
        <span className="inline-block h-0.5 w-4 border-t border-dashed border-ink-ghost" />{" "}
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
  if (error) {
    return <p className="text-body text-ink-muted">Podaci nisu dostupni</p>
  }
  if (isLoading || !data) {
    return (
      <div
        className="flex h-40 items-center justify-center"
        role="status"
        aria-label="Učitavanje"
      >
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-hairline-strong border-t-zg-blue" />
        <span className="sr-only">Učitavanje...</span>
      </div>
    )
  }
  if (data.points.length === 0) {
    return (
      <div className="bg-surface p-8 text-center sm:p-12">
        <p className="text-body text-ink-muted">
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
  routes: Array<string>
  selectedRoute: string
  onChange: (route: string) => void
}) {
  if (routes.length === 0) {
    return null
  }
  return (
    <select
      value={selectedRoute}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Linija"
      className="h-9 min-w-[160px] border border-hairline-strong bg-white px-3 font-mono text-label text-ink transition-colors focus-visible:ring-2 focus-visible:ring-zg-blue focus-visible:outline-none"
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
  routes: Array<string>
}) {
  const [selectedRoute, setSelectedRoute] = useState(() =>
    pickPreferredRoute(routes)
  )
  const key = selectedRoute
    ? `/api/rt/delay-profile?route=${encodeURIComponent(selectedRoute)}`
    : null
  const { data, error, isLoading } = useSWR<DelayProfileData, Error>(key, {
    keepPreviousData: true,
  })

  return (
    <section className="flex flex-col border-t border-hairline py-16 sm:py-24">
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
