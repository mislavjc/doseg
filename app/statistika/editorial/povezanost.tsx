"use client"

import dynamic from "next/dynamic"
import Image from "next/image"
import { useState } from "react"
import { isDarkScore, scoreColor, scoreTextColor } from "@/lib/score-color"
import { cn } from "@/lib/utils"
import type { PovezanostData } from "./facts"
import { Eyebrow, MonoLabel, Section } from "./primitives"

/**
 * Povezanost (Paper node 1YV-0) — the ranking flagship. Interactive 3D dither
 * terrain (real Floyd–Steinberg, see ./terrain-view.tsx) beside the 17-row
 * ljestvica, hover-linked both ways. Row fills/text come from the shared
 * scoreColor ramp (data-viz), not hardcoded.
 */

const BAR_W = 84 // px, the "raspon iznutra" column (w-21)
const BAR_MAX_HALF = 38
const BAR_CENTER = BAR_W / 2

// Heavy + client-only — lazy-load, baked render as the instant fallback.
const TerrainView = dynamic(
  () => import("./terrain-view").then((m) => m.TerrainView),
  { ssr: false, loading: () => <BakedTerrain /> }
)

function BakedTerrain() {
  return (
    <Image
      src="/povezanost-terrain.png"
      alt="3D karta zagrebačkih kvartova, visina označava doseg"
      width={336}
      height={248}
      className="h-auto w-full"
    />
  )
}

/** Centered error bar: caps + connecting line + bold median tick. */
function Whisker({ spread, onDark }: { spread: number; onDark: boolean }) {
  const half = spread * BAR_MAX_HALF
  const left = BAR_CENTER - half
  const color = onDark ? "bg-white" : "bg-navy"
  return (
    <div className="relative h-3.5 shrink-0" style={{ width: BAR_W }}>
      <div
        className={cn("absolute top-1.5 h-0.5 opacity-[0.55]", color)}
        style={{ left, width: half * 2 }}
      />
      <div
        className={cn("absolute top-0.75 h-2 w-px opacity-70", color)}
        style={{ left }}
      />
      <div
        className={cn("absolute top-0.75 h-2 w-px opacity-70", color)}
        style={{ left: BAR_CENTER + half }}
      />
      <div
        className={cn("absolute top-0.5 h-2.5 w-0.5", color)}
        style={{ left: BAR_CENTER - 1 }}
      />
    </div>
  )
}

function BoardRow({
  row,
  active,
  onEnter,
  onLeave,
}: {
  row: PovezanostData["rows"][number]
  active: boolean
  onEnter: () => void
  onLeave: () => void
}) {
  const { rank, name, score, spread } = row
  // Selected row fills with the shared highlight blue (same as the map) — white
  // content, unmistakable, and consistent across both directions.
  const onDark = active || isDarkScore(score)
  const textColor = active ? "var(--ground)" : scoreTextColor(score)
  return (
    <div
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      className="flex items-center gap-3 px-3.5 py-1 transition-colors duration-150 ease-out-strong"
      style={{ backgroundColor: active ? "var(--highlight)" : scoreColor(score) }}
    >
      <span
        className="grow font-heros text-xs leading-4 tabular-nums"
        style={{ color: textColor }}
      >
        {String(rank).padStart(2, "0")}
        {"  "}
        {name}
      </span>
      <Whisker spread={spread} onDark={onDark} />
      <span
        className="w-6.5 shrink-0 text-right font-mono text-xs leading-4 tabular-nums"
        style={{ color: textColor }}
      >
        {score}
      </span>
    </div>
  )
}

function RankingBoard({
  rows,
  hovered,
  setHovered,
}: {
  rows: PovezanostData["rows"]
  hovered: string | null
  setHovered: (name: string | null) => void
}) {
  return (
    <div className="grow">
      <div className="flex items-center gap-3 px-3.5 pt-1 pb-2">
        <MonoLabel className="grow text-[11px] leading-[14px]">
          ljestvica dosega
        </MonoLabel>
        <MonoLabel
          className="shrink-0 text-center text-[11px] leading-[14px]"
          style={{ width: BAR_W }}
        >
          raspon iznutra
        </MonoLabel>
        <MonoLabel className="w-6.5 shrink-0 text-right text-[11px] leading-[14px]">
          bod
        </MonoLabel>
      </div>
      {rows.map((r) => (
        <BoardRow
          key={r.name}
          row={r}
          active={hovered === r.name}
          onEnter={() => setHovered(r.name)}
          onLeave={() => setHovered(null)}
        />
      ))}
    </div>
  )
}

function Stats({ data }: { data: PovezanostData }) {
  const rows: [string, string][] = [
    ["iznad 50", `${data.good} / ${data.total}`],
    ["prosjek", `${data.avg} / 100`],
    ["slab doseg", `${data.poorPct}%`],
    ["ažurirano", data.updated],
  ]
  return (
    <dl className="flex flex-col gap-1.5">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between">
          <dt className="font-mono text-xs text-ink-faint">{k}</dt>
          <dd className="font-mono text-xs tabular-nums text-ink-2">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Povezanost({ data }: { data: PovezanostData }) {
  const [hovered, setHovered] = useState<string | null>(null)
  return (
    <Section id="povezanost" width="wide">
      <div className="flex flex-col gap-10 md:flex-row md:items-start md:gap-12">
        <div className="flex flex-col gap-5 md:w-[336px] md:shrink-0">
          <Eyebrow>povezanost · {data.total} kvartova</Eyebrow>
          <TerrainView hovered={hovered} onHover={setHovered} />
          <Stats data={data} />
        </div>
        <RankingBoard rows={data.rows} hovered={hovered} setHovered={setHovered} />
      </div>
    </Section>
  )
}
