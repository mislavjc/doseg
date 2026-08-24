"use client"

import dynamic from "next/dynamic"
import { useState } from "react"

import { MonoLabel } from "@/app/statistika/editorial/primitives"
import type { KvartRides } from "@/lib/bajs-terrain"
import { scoreColor, scoreTextColor } from "@/lib/score-color"

/**
 * Rides per kvart as the city standing up: the /statistika terrain, extruded by
 * bikes instead of connectivity, beside the ranked list. Hovering either side
 * lights the other, so a block you notice on the map has a name and a number.
 */

// Heavy and client-only; the list carries the section until three.js lands.
const TerrainView = dynamic(
  () => import("@/app/statistika/editorial/terrain-view").then((m) => m.TerrainView),
  { ssr: false, loading: () => <div className="w-full [aspect-ratio:1300/980]" /> }
)

const RIDES = new Intl.NumberFormat("hr-HR", { maximumFractionDigits: 0 })

function Row({
  kvart,
  active,
  onEnter,
  onLeave,
}: {
  kvart: KvartRides
  active: boolean
  onEnter: () => void
  onLeave: () => void
}) {
  const textColor = active ? "var(--ground)" : scoreTextColor(kvart.value)
  return (
    <div
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      className="flex items-baseline gap-3 px-3.5 py-1.5 transition-colors duration-150"
      style={{
        backgroundColor: active ? "var(--highlight)" : scoreColor(kvart.value),
      }}
    >
      <span className="grow font-mono text-label" style={{ color: textColor }}>
        {kvart.name}
      </span>
      <span
        className="shrink-0 font-mono text-label tabular-nums opacity-70"
        style={{ color: textColor }}
      >
        {kvart.stations}
      </span>
      <span
        className="w-14 shrink-0 text-right font-mono text-label tabular-nums"
        style={{ color: textColor }}
      >
        {RIDES.format(kvart.rides)}
      </span>
    </div>
  )
}

/**
 * Fills the column under the map and reads as the caption to the shape. Only
 * facts this section owns: a city-wide ride total or station count here would
 * be a second, slightly different answer to what the hero already states.
 */
function Summary({ kvartovi }: { kvartovi: KvartRides[] }) {
  const topThree = kvartovi.slice(0, 3).reduce((n, k) => n + k.share, 0)
  const quietest = kvartovi[kvartovi.length - 1]
  const rows: [string, string][] = [
    ["kvartova sa stanicom", `${kvartovi.length} / 17`],
    ["u tri najveća", `${Math.round(topThree * 100)}%`],
    ["najtiši kvart", quietest?.name ?? "-"],
  ]
  return (
    <dl className="flex flex-col gap-1.5">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between border-t border-hairline pt-1.5">
          <dt className="font-mono text-label text-ink-faint">{k}</dt>
          <dd className="font-mono text-label tabular-nums text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function KvartTerrain({
  kvartovi,
  values,
}: {
  kvartovi: KvartRides[]
  values: Record<string, number>
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const lit = kvartovi.find((k) => k.name === hovered)

  return (
    <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
      <div className="flex flex-col gap-4 md:w-[400px] md:shrink-0">
        <TerrainView
          hovered={hovered}
          onHover={setHovered}
          values={values}
          ariaLabel="3D karta zagrebačkih kvartova, visina označava vožnje javnim biciklom"
        />
        <MonoLabel className="text-ink">
          {lit
            ? `${lit.name} · ${RIDES.format(lit.rides)} vožnji, ${Math.round(lit.share * 100)}% grada`
            : "visina = vožnje dnevno u kvartu"}
        </MonoLabel>
        <Summary kvartovi={kvartovi} />
      </div>

      <div className="grow">
        <div className="flex items-baseline gap-3 px-3.5 pb-2">
          <MonoLabel className="grow">kvart</MonoLabel>
          <MonoLabel className="shrink-0">stanica</MonoLabel>
          <MonoLabel className="w-14 shrink-0 text-right">vožnji/dan</MonoLabel>
        </div>
        {kvartovi.map((k) => (
          <Row
            key={k.name}
            kvart={k}
            active={hovered === k.name}
            onEnter={() => setHovered(k.name)}
            onLeave={() => setHovered(null)}
          />
        ))}
      </div>
    </div>
  )
}
