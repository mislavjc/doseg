"use client"

import { memo } from "react"

import type { TramMapData } from "@/lib/tram-map-data"
import { tramLineColor } from "@/lib/tram-lines"
import type { View } from "./use-pan-zoom"

const DIM = 0.12
const FADE = 0.25

type Station = TramMapData["stations"][number]

function StationMark({ s, lw }: { s: Station; lw: number }) {
  const { x1, y1, x2, y2, broj } = s.mark
  if (s.kind === "interchange") {
    return (
      <g>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="var(--ink)"
          strokeWidth={lw + 6}
          strokeLinecap="round"
        />
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="var(--ground)"
          strokeWidth={lw + 1}
          strokeLinecap="round"
        />
      </g>
    )
  }
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={broj === null ? "var(--ink)" : tramLineColor(broj)}
      strokeWidth={s.kind === "terminal" ? lw : lw - 1}
    />
  )
}

interface LayerProps {
  data: TramMapData
  activeLine: string | null
  activeStop: string | null
  onSelect: (id: string) => void
}

function Lines({ data, activeLine }: Pick<LayerProps, "data" | "activeLine">) {
  const night = data.lines.find((l) => l.isNight && l.broj === activeLine)
  return (
    <g fill="none" strokeLinejoin="round">
      {data.lines
        .filter((l) => !l.isNight)
        .map((l) => (
          <path
            key={l.broj}
            d={l.d}
            stroke={tramLineColor(l.broj)}
            strokeWidth={data.lineWidth - 1}
            opacity={activeLine === null || activeLine === l.broj ? 1 : DIM}
            className="transition-opacity duration-200"
          />
        ))}
      {night && (
        <path d={night.d} stroke="var(--navy)" strokeWidth={data.lineWidth} />
      )}
    </g>
  )
}

function Stations({ data, activeLine, activeStop, onSelect }: LayerProps) {
  const onLine = (s: Station) =>
    activeLine === null || s.lines.includes(activeLine)
  return (
    <g>
      {data.stations.map((s) => (
        <g
          key={s.id}
          opacity={onLine(s) ? 1 : FADE}
          className="transition-opacity duration-200"
        >
          <StationMark s={s} lw={data.lineWidth} />
          <text
            x={s.label.x}
            y={s.label.y}
            fontFamily="var(--font-mono)"
            fontSize={12}
            fontWeight={s.kind === "tick" ? 400 : 700}
            fill="var(--ink)"
            className="pointer-events-none select-none"
          >
            {s.name}
          </text>
        </g>
      ))}
      {data.stations.map((s) => (
        <circle
          key={s.id}
          data-ui
          cx={s.x}
          cy={s.y}
          r={activeStop === s.id ? 13 : 11}
          fill="transparent"
          stroke={activeStop === s.id ? "var(--zg-blue)" : "none"}
          strokeWidth={2}
          className="cursor-pointer"
          aria-label={s.name}
          onClick={(e) => {
            e.stopPropagation()
            onSelect(s.id)
          }}
        />
      ))}
    </g>
  )
}

const Layers = memo(function Layers(props: LayerProps) {
  const { data } = props
  return (
    <>
      <path
        d={data.river.d}
        fill="none"
        stroke="var(--sava)"
        strokeWidth={data.river.width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Lines data={data} activeLine={props.activeLine} />
      <Stations {...props} />
    </>
  )
})

export function MapSvg({ view, ...props }: LayerProps & { view: View }) {
  const [x, y, w, h] = props.data.viewBox
  return (
    <svg
      viewBox={`${x} ${y} ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      role="img"
      aria-label="Shematska karta tramvajskih linija"
      style={{
        transform: `translate(${view.x}px,${view.y}px) scale(${view.s})`,
        transformOrigin: "0 0",
        willChange: "transform",
      }}
    >
      <Layers {...props} />
    </svg>
  )
}
