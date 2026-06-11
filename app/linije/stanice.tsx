"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

import type { LineDirection } from "@/lib/generated/LineDirection"
import type { LineStop } from "@/lib/generated/LineStop"

import { SmjerToggle } from "./smjer-toggle"

/**
 * Stop lists per direction (Paper "Stanice — oba smjera"). Desktop shows both
 * directions side by side; mobile collapses to one column with a smjer toggle.
 * Rows form fixed lanes: 44px offset · 32px rail · name · interchange chip.
 * A tram chip marks where a connection FIRST appears along the route — the
 * tram running parallel for ten stops gets one chip, not ten.
 */

function StopRow({
  stop,
  newTrams,
  isFirst,
  isLast,
  fallbackChip,
}: {
  stop: LineStop
  newTrams: string[]
  isFirst: boolean
  isLast: boolean
  fallbackChip?: string
}) {
  const terminal = isFirst || isLast
  const chip =
    newTrams.length > 0 ? `tram ${newTrams.join(" · ")}` : terminal ? fallbackChip : undefined

  return (
    <li className="flex h-10 items-center">
      <span className="w-11 shrink-0 text-right font-mono text-[16px] leading-5 text-ink-faint">
        {stop.offsetMin}&apos;
      </span>
      <span className="relative h-10 w-8 shrink-0" aria-hidden>
        <span
          className={cn(
            "absolute left-3.5 w-1 bg-zg-blue",
            isFirst ? "top-5 h-5" : isLast ? "top-0 h-5" : "top-0 h-10"
          )}
        />
        {terminal ? (
          <span className="absolute left-[9px] top-[13px] size-3.5 rounded-full bg-zg-blue" />
        ) : (
          <span className="absolute left-[11px] top-[15px] size-2.5 rounded-full border-[3px] border-zg-blue bg-white" />
        )}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate pl-3 font-heros text-[16px] leading-5",
          terminal ? "font-bold text-ink" : "text-ink"
        )}
      >
        {stop.name}
      </span>
      {chip && (
        <span className="ml-2 shrink-0 border border-hairline-strong px-2.5 py-[3px] font-mono text-label text-ink-muted">
          {chip}
        </span>
      )}
    </li>
  )
}

function DirectionColumn({
  direction,
  terminalChip,
  className,
}: {
  direction: LineDirection
  terminalChip?: string
  className?: string
}) {
  const total = direction.stops.at(-1)?.offsetMin ?? 0
  // Chip = trams that weren't reachable at the previous stop.
  const tramSets = direction.stops.map((s) => s.tramInterchange)
  const newTramsPerStop = tramSets.map((trams, i) =>
    i === 0 ? trams : trams.filter((t) => !tramSets[i - 1].includes(t))
  )
  return (
    <div className={cn("min-w-0 flex-1", className)}>
      <p className="flex items-center gap-2 pb-4">
        <span className="font-mono text-[16px] leading-6 text-zg-blue">
          smjer {direction.headsign}
        </span>
        <span className="font-mono text-[16px] leading-6 text-ink-faint">
          · {total} min ukupno
        </span>
      </p>
      <ul>
        {direction.stops.map((stop, i) => (
          <StopRow
            key={`${stop.name}-${i}`}
            stop={stop}
            newTrams={newTramsPerStop[i]}
            isFirst={i === 0}
            isLast={i === direction.stops.length - 1}
            fallbackChip={i === direction.stops.length - 1 ? terminalChip : undefined}
          />
        ))}
      </ul>
    </div>
  )
}

export function Stanice({
  directions,
  terminalChips,
}: {
  directions: LineDirection[]
  /** Fallback chip per direction's end terminal (e.g. "bus 220 · 221"). */
  terminalChips: (string | undefined)[]
}) {
  const [active, setActive] = useState(0)

  return (
    <div>
      {/* Mobile smjer toggle */}
      {directions.length > 1 && (
        <div className="pb-5">
          <SmjerToggle
            labels={directions.map((d) => `smjer ${d.headsign}`)}
            active={active}
            onSelect={setActive}
          />
        </div>
      )}

      <div className="flex flex-col gap-10 sm:flex-row sm:gap-[60px]">
        {directions.map((d, i) => (
          <DirectionColumn
            key={d.headsign}
            direction={d}
            terminalChip={terminalChips[i]}
            className={cn(i !== active && "hidden sm:block")}
          />
        ))}
      </div>
    </div>
  )
}
