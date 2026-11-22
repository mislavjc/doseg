"use client"

import { useState } from "react"
import { IconChevronDownSmall } from "@central-icons-react/square-outlined-radius-0-stroke-2/IconChevronDownSmall"
import { IconChevronTopSmall } from "@central-icons-react/square-outlined-radius-0-stroke-2/IconChevronTopSmall"

import type { TramMapLine } from "@/lib/tram-map-data"
import { cn } from "@/lib/utils"
import { tramLineColor } from "@/lib/tram-lines"
import { LineBadge, lineName } from "./line-badge"

interface LegendProps {
  lines: Array<TramMapLine>
  activeLine: string | null
  onToggleLine: (broj: string) => void
}

function LegendRow({
  line,
  activeLine,
  onToggle,
}: {
  line: TramMapLine
  activeLine: string | null
  onToggle: () => void
}) {
  const active = activeLine === line.broj
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-3 px-4 py-1.5 text-left text-body text-ink-2 transition-opacity",
        active && "bg-row-tint shadow-[inset_2px_0_0_var(--zg-blue)]",
        activeLine !== null && !active && "opacity-35 hover:opacity-60",
        activeLine === null && "hover:bg-row-tint"
      )}
    >
      <LineBadge broj={line.broj} />
      <span className="truncate">{lineName(line.terminals)}</span>
    </button>
  )
}

export function DesktopLegend({
  lines,
  activeLine,
  onToggleLine,
  onReset,
  showReset,
}: LegendProps & { onReset: () => void; showReset: boolean }) {
  const day = lines.filter((l) => !l.isNight)
  const night = lines.filter((l) => l.isNight)
  return (
    <div
      data-ui
      className="absolute bottom-4 left-4 z-10 hidden max-h-[calc(100svh-104px)] w-80 overflow-y-auto border border-hairline-strong bg-ground py-3 sm:block"
    >
      <div className="flex items-center justify-between px-4 pb-2">
        <h2 className="font-mono text-label text-ink-faint">
          tramvajske linije
        </h2>
        {showReset && (
          <button
            type="button"
            onClick={onReset}
            className="font-mono text-label text-zg-blue hover:text-navy"
          >
            resetiraj
          </button>
        )}
      </div>
      <div className="flex flex-col">
        {day.map((l) => (
          <LegendRow
            key={l.broj}
            line={l}
            activeLine={activeLine}
            onToggle={() => onToggleLine(l.broj)}
          />
        ))}
      </div>
      <h2 className="px-4 pt-3 pb-2 font-mono text-label text-ink-faint">
        noćne linije
      </h2>
      <div className="flex flex-col">
        {night.map((l) => (
          <LegendRow
            key={l.broj}
            line={l}
            activeLine={activeLine}
            onToggle={() => onToggleLine(l.broj)}
          />
        ))}
      </div>
    </div>
  )
}

export function MobileLegend({ lines, activeLine, onToggleLine }: LegendProps) {
  const [open, setOpen] = useState(true)
  const active = lines.find((l) => l.broj === activeLine)
  return (
    <div
      data-ui
      className="absolute right-3 bottom-3 left-3 z-10 border border-hairline-strong bg-ground sm:hidden"
    >
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3"
      >
        <span className="truncate font-mono text-label text-ink-faint">
          {active ? lineName(active.terminals) : "tramvajske linije"}
        </span>
        {open ? (
          <IconChevronDownSmall size={16} className="text-ink-muted" />
        ) : (
          <IconChevronTopSmall size={16} className="text-ink-muted" />
        )}
      </button>
      {open && (
        <div className="grid grid-cols-8 gap-1.5 px-4 pb-4">
          {lines.map((l) => (
            <button
              type="button"
              key={l.broj}
              onClick={() => onToggleLine(l.broj)}
              aria-pressed={activeLine === l.broj}
              aria-label={`${l.broj} ${lineName(l.terminals)}`}
              className="flex h-8 items-center justify-center font-mono text-label font-bold text-ground transition-opacity"
              style={{
                backgroundColor: tramLineColor(l.broj),
                opacity: activeLine !== null && activeLine !== l.broj ? 0.3 : 1,
              }}
            >
              {l.broj}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
