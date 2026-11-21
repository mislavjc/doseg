import type { scaleLinear, scaleTime } from "@visx/scale"
import { Group } from "@visx/group"
import { BarRounded } from "@visx/shape"
import { GridRows } from "@visx/grid"
import { cn } from "@/lib/utils"

type XScale = ReturnType<typeof scaleTime<number>>
type YScale = ReturnType<typeof scaleLinear<number>>

const CHART_HEIGHT = 240
export const MARGIN = { top: 16, right: 48, bottom: 40, left: 16 }
export const INNER_HEIGHT = CHART_HEIGHT - MARGIN.top - MARGIN.bottom

export function computeBarLayout(
  points: Array<{ ts: number }>,
  xScale: XScale,
  minWidth: number,
  factor: number
) {
  const gap =
    points.length > 1
      ? Math.abs(
          (xScale(new Date(points[1].ts * 1000)) ?? 0) -
            (xScale(new Date(points[0].ts * 1000)) ?? 0)
        )
      : 8
  return { gap, barWidth: Math.max(minWidth, gap * factor) }
}

export function ChartSvg({
  width,
  clip,
  label,
  children,
}: {
  width: number
  clip?: boolean
  label: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("relative mx-auto w-full", clip && "overflow-hidden")}>
      <svg
        viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
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

export function ChartGrid({
  yScale,
  yTicks,
  innerWidth,
}: {
  yScale: YScale
  yTicks: Array<number>
  innerWidth: number
}) {
  return (
    <GridRows
      scale={yScale}
      width={innerWidth}
      tickValues={yTicks}
      stroke="#e2e8f0"
      strokeOpacity={0.5}
      strokeWidth={1}
      strokeDasharray="4 4"
      className="dark:stroke-slate-700"
    />
  )
}

export function TimeBars<P extends { ts: number }>({
  points,
  xScale,
  yScale,
  barWidth,
  hovered,
  value,
  color,
}: {
  points: Array<P>
  xScale: XScale
  yScale: YScale
  barWidth: number
  hovered: P | null
  value: (p: P) => number
  color: (v: number) => string
}) {
  return (
    <>
      {points.map((p) => {
        const v = value(p)
        const barHeight = Math.max(
          INNER_HEIGHT - (yScale(v) ?? INNER_HEIGHT),
          4
        )
        return (
          <BarRounded
            key={p.ts}
            x={(xScale(new Date(p.ts * 1000)) ?? 0) - barWidth / 2}
            y={INNER_HEIGHT - barHeight}
            width={barWidth}
            height={barHeight}
            fill={color(v)}
            fillOpacity={hovered === p ? 1 : 0.85}
            radius={Math.min(barWidth / 2, 4)}
            top
            bottom={false}
          />
        )
      })}
    </>
  )
}

export function HitAreas<P extends { ts: number }>({
  points,
  xScale,
  gap,
  onHover,
}: {
  points: Array<P>
  xScale: XScale
  gap: number
  onHover: (p: P | null) => void
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

export function ChartYLabels({
  ticks,
  yScale,
  innerWidth,
  format,
}: {
  ticks: Array<number>
  yScale: YScale
  innerWidth: number
  format: (v: number) => string
}) {
  return (
    <>
      {ticks.map((v) => (
        <text
          key={v}
          x={innerWidth + 8}
          y={(yScale(v) ?? 0) + 1}
          textAnchor="start"
          dominantBaseline="middle"
          className="fill-slate-500 font-mono text-label dark:fill-slate-400"
        >
          {format(v)}
        </text>
      ))}
    </>
  )
}

export function SvgTooltip({
  x,
  y,
  innerWidth,
  title,
  value,
  subtitle,
  color,
}: {
  x: number
  y: number
  innerWidth: number
  title: string
  value: string
  subtitle?: string
  color: string
}) {
  const width = 156
  const height = subtitle ? 72 : 52
  const adjustedX = Math.max(0, Math.min(x - width / 2, innerWidth - width))
  const adjustedY = Math.max(0, y - height - 12)

  return (
    <g className="pointer-events-none transition-all duration-200 ease-out">
      <g transform={`translate(${adjustedX}, ${adjustedY})`}>
        <rect
          width={width}
          height={height}
          rx={8}
          className="fill-white stroke-slate-200 dark:fill-[#262626] dark:stroke-white/10"
          strokeWidth={1}
          style={{
            filter:
              "drop-shadow(0 4px 12px rgba(0,0,0,0.08)) drop-shadow(0 1px 3px rgba(0,0,0,0.05))",
          }}
        />
        <text
          x={14}
          y={22}
          fontSize={11}
          fontWeight={500}
          className="fill-slate-400 dark:fill-slate-500"
        >
          {title}
        </text>
        <circle cx={18} cy={37} r={3.5} fill={color} />
        <text
          x={28}
          y={41}
          fontSize={14}
          fontWeight={600}
          className="fill-slate-900 dark:fill-slate-100"
        >
          {value}
        </text>
        {subtitle && (
          <text
            x={14}
            y={58}
            fontSize={11}
            fontWeight={400}
            className="fill-slate-500 dark:fill-slate-400"
          >
            {subtitle}
          </text>
        )}
      </g>
    </g>
  )
}
