"use client"

import Link from "next/link"
import { IconArrowRight } from "@central-icons-react/square-outlined-radius-0-stroke-2/IconArrowRight"
import { IconCrossSmall } from "@central-icons-react/square-outlined-radius-0-stroke-2/IconCrossSmall"

import { plural } from "@/app/linije/copy"
import type { TramMapData, TramMapLine } from "@/lib/tram-map-data"
import { tramLineColor } from "@/lib/tram-lines"
import { LineBadge } from "./line-badge"

type Station = TramMapData["stations"][number]

function LineProgressRow({
  line,
  station,
  onToggle,
}: {
  line: TramMapLine
  station: Station
  onToggle: () => void
}) {
  const idx = line.stations.indexOf(station.id)
  const total = line.stations.length
  const pct = total > 1 ? (idx / (total - 1)) * 100 : 50
  const oneWay = station.oneWay.find((o) => o.broj === line.broj)
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-start gap-3 px-5 py-3 text-left hover:bg-row-tint"
    >
      <LineBadge broj={line.broj} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-body text-ink">
          {line.terminals[0]} &rarr; {line.terminals[1]}
        </div>
        <div className="mt-1.5 flex items-center gap-3">
          <div className="relative h-0.5 flex-1 bg-track">
            <div
              className="absolute inset-y-0 left-0"
              style={{
                width: `${pct}%`,
                backgroundColor: tramLineColor(line.broj),
              }}
            />
            <div
              className="absolute top-1/2 size-2"
              style={{
                left: `${pct}%`,
                backgroundColor: tramLineColor(line.broj),
                transform: "translate(-50%,-50%)",
              }}
            />
          </div>
          <span className="shrink-0 font-mono text-label text-ink-faint tabular-nums">
            {idx + 1}/{total}
          </span>
        </div>
        {oneWay && (
          <p className="mt-1 font-mono text-label text-ink-muted">
            samo prema: {oneWay.towards}
          </p>
        )}
      </div>
    </button>
  )
}

export function StopPanel({
  station,
  lines,
  slug,
  onClose,
  onToggleLine,
}: {
  station: Station
  lines: Array<TramMapLine>
  slug: string | undefined
  onClose: () => void
  onToggleLine: (broj: string) => void
}) {
  const served = lines.filter((l) => station.lines.includes(l.broj))
  const count = served.length
  return (
    <div
      data-ui
      className="absolute top-20 right-3 left-3 z-20 max-h-[calc(100svh-200px)] overflow-y-auto border border-hairline-strong bg-ground sm:top-4 sm:right-[72px] sm:left-auto sm:w-80"
    >
      <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-head font-bold text-ink">{station.name}</h3>
          <p className="mt-1 font-mono text-label text-ink-faint">
            {station.kind === "interchange" ? "presjedanje" : "stanica"}{" "}
            &middot; {count} {plural(count, "linija", "linije", "linija")}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Zatvori"
          className="p-1 text-ink-muted hover:text-ink"
        >
          <IconCrossSmall size={16} />
        </button>
      </div>
      <div className="flex flex-col py-1">
        {served.map((l) => (
          <LineProgressRow
            key={l.broj}
            line={l}
            station={station}
            onToggle={() => onToggleLine(l.broj)}
          />
        ))}
      </div>
      {slug !== undefined && (
        <Link
          href={`/stanice/${slug}`}
          className="flex items-center justify-between border-t border-hairline px-5 py-3 font-mono text-label text-zg-blue hover:bg-row-tint"
        >
          polasci sa stanice
          <IconArrowRight size={16} />
        </Link>
      )}
    </div>
  )
}
