"use client"

import type { District as DistrictScore } from "@/lib/generated/District"

const LABEL_DARK = "#0f172a"
const LABEL_LIGHT = "#fafaf9"

/** Same grid positions as connectivity map; scores are static snapshot from district-scores. */
export const ZAGREB_DISTRICTS_GRID = [
  { id: "podsljeme", name: "Podsljeme", short: "POD", col: 2, row: 0, score: 13 },
  { id: "podsused-vrapce", name: "Podsused - Vrapče", short: "POV", col: 0, row: 1, score: 31 },
  { id: "crnomerec", name: "Črnomerec", short: "ČRN", col: 1, row: 1, score: 31 },
  { id: "gornji-grad", name: "Gornji grad - Medveščak", short: "GGM", col: 2, row: 1, score: 52 },
  { id: "maksimir", name: "Maksimir", short: "MAK", col: 3, row: 1, score: 40 },
  { id: "gornja-dubrava", name: "Gornja Dubrava", short: "GDU", col: 4, row: 1, score: 20 },
  { id: "sesvete", name: "Sesvete", short: "SES", col: 5, row: 1, score: 17 },
  { id: "stenjevec", name: "Stenjevec", short: "STE", col: 0, row: 2, score: 41 },
  { id: "tresnjevka-sjever", name: "Trešnjevka - sjever", short: "TSJ", col: 1, row: 2, score: 62 },
  { id: "donji-grad", name: "Donji grad", short: "DGR", col: 2, row: 2, score: 100 },
  { id: "pescenica", name: "Peščenica - Žitnjak", short: "PŠČ", col: 3, row: 2, score: 33 },
  { id: "donja-dubrava", name: "Donja Dubrava", short: "DDU", col: 4, row: 2, score: 42 },
  { id: "tresnjevka-jug", name: "Trešnjevka - jug", short: "TJU", col: 1, row: 3, score: 52 },
  { id: "trnje", name: "Trnje", short: "TRN", col: 2, row: 3, score: 83 },
  { id: "novi-zagreb-zapad", name: "Novi Zagreb - zapad", short: "NZZ", col: 1, row: 4, score: 36 },
  { id: "novi-zagreb-istok", name: "Novi Zagreb - istok", short: "NZI", col: 2, row: 4, score: 56 },
  { id: "brezovica", name: "Brezovica", short: "BRZ", col: 1, row: 5, score: 17 },
] as const

const NUM_COLS = 6
const NUM_ROWS = 6

function connectivityColor(score: number) {
  if (score >= 80) return "#398f71"
  if (score >= 60) return "#4ea586"
  if (score >= 40) return "#66bba1"
  if (score >= 30) return "#81d2bb"
  if (score >= 20) return "#a1e7d5"
  return "#c4f8ea"
}

/** Matches `bajsBoostColor` in scripts/build-district-map-svg.ts */
function bajsBoostColor(boostPct: number) {
  if (boostPct >= 40) return "#d97706"
  if (boostPct >= 25) return "#f59e0b"
  if (boostPct >= 10) return "#fbbf24"
  if (boostPct > 0) return "#fcd34d"
  return "#94a3b8"
}

function labelForBajs(boostPct: number) {
  return boostPct >= 25 ? LABEL_LIGHT : LABEL_DARK
}

export function ZagrebBlockMap() {
  return (
    <ZagrebDistrictGrid
      cells={ZAGREB_DISTRICTS_GRID.map((d) => ({
        key: d.id,
        short: d.short,
        name: d.name,
        col: d.col,
        row: d.row,
        bg: connectivityColor(d.score),
        label: LABEL_DARK,
        title: `${d.name} — ${d.score}/100`,
        tooltip: `${d.name}: ${d.score}/100`,
      }))}
    />
  )
}

export function ZagrebBajsBlockMap({ districts }: { districts: readonly DistrictScore[] }) {
  const byName = new Map(districts.map((d) => [d.name, d]))
  const cells = ZAGREB_DISTRICTS_GRID.map((g) => {
    const d = byName.get(g.name)
    const boost = d?.bajsBoostPct ?? 0
    const stations = d?.bajsStations ?? 0
    const bg = bajsBoostColor(boost)
    return {
      key: g.id,
      short: g.short,
      name: g.name,
      col: g.col,
      row: g.row,
      bg,
      label: labelForBajs(boost),
      title: `${g.name} — ${boost > 0 ? `+${boost}%` : "bez utjecaja"}`,
      tooltip:
        boost > 0
          ? `${g.name}: +${boost}% dosega · ${stations} st.`
          : `${g.name}: nema utjecaja BAJS-a`,
    }
  })
  return <ZagrebDistrictGrid cells={cells} />
}

type GridCell = {
  key: string
  short: string
  name: string
  col: number
  row: number
  bg: string
  label: string
  title: string
  tooltip: string
}

function ZagrebDistrictGrid({ cells }: { cells: GridCell[] }) {
  const byPos = new Map(cells.map((c) => [`${c.col},${c.row}`, c]))

  return (
    <div className="flex w-full justify-center overflow-hidden sm:overflow-visible rounded-xl bg-[#fbfbf9] py-8">
      <div
        className="grid gap-[3px]"
        style={{
          gridTemplateColumns: `repeat(${NUM_COLS}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${NUM_ROWS}, minmax(0, 1fr))`,
          width: "100%",
          maxWidth: "600px",
          aspectRatio: "1 / 1",
        }}
      >
        {Array.from({ length: NUM_ROWS * NUM_COLS }).map((_, i) => {
          const col = i % NUM_COLS
          const row = Math.floor(i / NUM_COLS)
          const cell = byPos.get(`${col},${row}`)
          if (!cell) {
            return <div key={`empty-${col}-${row}`} className="h-full w-full" />
          }
          const tooltipBelow = row === 0
          return (
            <div
              key={cell.key}
              className="group relative flex h-full w-full cursor-default flex-col items-center justify-center p-2 transition-transform hover:z-30 sm:cursor-pointer"
              style={{ backgroundColor: cell.bg, color: cell.label }}
              title={cell.title}
            >
              <span className="font-medium text-base tracking-wide sm:text-xl">{cell.short}</span>
              <div
                className={`pointer-events-none absolute left-1/2 z-30 w-max max-w-[min(280px,85vw)] -translate-x-1/2 rounded bg-gray-900 px-3 py-1.5 text-center text-xs leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 ${
                  tooltipBelow ? "top-full mt-1.5" : "bottom-full mb-1.5"
                }`}
              >
                {tooltipBelow ? (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-900" />
                ) : (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                )}
                {cell.tooltip}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
