"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { IconArrowLeft } from "@central-icons-react/square-outlined-radius-0-stroke-2/IconArrowLeft"
import { IconMinusSmall } from "@central-icons-react/square-outlined-radius-0-stroke-2/IconMinusSmall"
import { IconPlusSmall } from "@central-icons-react/square-outlined-radius-0-stroke-2/IconPlusSmall"

import type { TramMapData } from "@/lib/tram-map-data"
import { DesktopLegend, MobileLegend } from "./legend"
import { MapSvg } from "./map-svg"
import { StopPanel } from "./stop-panel"
import type { View } from "./use-pan-zoom"
import { usePanZoom } from "./use-pan-zoom"

/**
 * Desktop opens on the network's west-east extent, Prečko to Dubec, below
 * the header and above the collapsed legend; only the Gračani spur (line 15
 * alone) may run off the top. Mobile opens on the city centre, the ring from
 * Trg dr. Franje Tuđmana to Šubićeva with every label whole, framed below
 * the header and zoom buttons and above the collapsed legend.
 */
const CORE = new Set([
  "Trg dr. Franje Tuđmana",
  "Draškovićeva",
  "Šubićeva",
  "Studentski centar",
  "Glavni kolodvor",
])
const MOBILE_MAX = 640
const SPUR = "15"
const ZOOM_W = 60
const PAD = 24
const DESKTOP_TOP = 96
const DESKTOP_BOTTOM = 88
const MOBILE_TOP = 118
const MOBILE_BOTTOM = 150

function frame(width: number, height: number) {
  return width < MOBILE_MAX
    ? { x0: 12, y0: MOBILE_TOP, x1: width - 12, y1: height - MOBILE_BOTTOM }
    : {
        x0: PAD,
        y0: DESKTOP_TOP,
        x1: width - ZOOM_W - PAD,
        y1: height - DESKTOP_BOTTOM,
      }
}

/** The map-unit box to open on: the centre ring on mobile, else all but the spur. */
function subject(data: TramMapData, mobile: boolean) {
  const core = data.stations.filter((s) =>
    mobile ? CORE.has(s.name) : s.lines.some((l) => l !== SPUR)
  )
  return {
    x0: Math.min(...core.map((s) => Math.min(s.x, s.label.x))),
    y0: Math.min(...core.map((s) => Math.min(s.y, s.label.y - 12))),
    x1: Math.max(...core.map((s) => Math.max(s.x, s.label.x + s.label.w))),
    y1: Math.max(...core.map((s) => Math.max(s.y, s.label.y + 4))),
  }
}

function openingView(data: TramMapData) {
  return (width: number, height: number): View => {
    const [vx, vy, vw, vh] = data.viewBox
    const k = Math.min(width / vw, height / vh)
    const box = frame(width, height)
    const area = subject(data, width < MOBILE_MAX)
    const s = Math.min(
      (box.x1 - box.x0) / ((area.x1 - area.x0) * k),
      (box.y1 - box.y0) / ((area.y1 - area.y0) * k)
    )
    const cx = (width - vw * k) / 2 + ((area.x0 + area.x1) / 2 - vx) * k
    const cy = (height - vh * k) / 2 + ((area.y0 + area.y1) / 2 - vy) * k
    return {
      x: (box.x0 + box.x1) / 2 - s * cx,
      y: (box.y0 + box.y1) / 2 - s * cy,
      s,
    }
  }
}

function ZoomControls({ onZoom }: { onZoom: (factor: number) => void }) {
  const button =
    "flex size-11 items-center justify-center text-ink-2 hover:bg-row-tint"
  return (
    <div
      data-ui
      className="absolute top-4 right-3 z-10 flex flex-col border border-hairline-strong bg-ground sm:right-4"
    >
      <button
        type="button"
        onClick={() => onZoom(1.3)}
        className={button}
        aria-label="Povećaj"
      >
        <IconPlusSmall size={16} />
      </button>
      <div className="h-px bg-hairline-strong" />
      <button
        type="button"
        onClick={() => onZoom(1 / 1.3)}
        className={button}
        aria-label="Smanji"
      >
        <IconMinusSmall size={16} />
      </button>
    </div>
  )
}

function Header() {
  return (
    <header
      data-ui
      className="absolute top-4 left-3 z-10 flex h-[54px] items-center gap-4 border border-hairline-strong bg-ground px-4 sm:left-4"
    >
      <Link
        href="/"
        className="flex items-center gap-1.5 font-mono text-label text-zg-blue hover:text-navy"
      >
        <IconArrowLeft size={16} />
        doseg
      </Link>
      <span className="h-5 w-px bg-hairline-strong" />
      <h1 className="text-head font-bold text-ink">Karta tramvajskih linija</h1>
    </header>
  )
}

function useEscape(onEscape: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onEscape()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onEscape])
}

export function TramMap({ data }: { data: TramMapData }) {
  const { containerRef, view, onDown, onMove, onUp, zoomBy, home } = usePanZoom(
    openingView(data)
  )
  const [activeLine, setActiveLine] = useState<string | null>(null)
  const [activeStop, setActiveStop] = useState<string | null>(null)
  const clear = useCallback(() => {
    setActiveStop(null)
    setActiveLine(null)
  }, [])
  useEscape(clear)
  const toggleLine = useCallback((broj: string) => {
    setActiveLine((p) => (p === broj ? null : broj))
  }, [])
  const select = useCallback(
    (id: string) => setActiveStop((p) => (p === id ? null : id)),
    []
  )
  const station = data.stations.find((s) => s.id === activeStop)

  return (
    <div
      ref={containerRef}
      className="relative h-svh min-h-0 w-full cursor-grab touch-none overflow-hidden bg-ground select-none active:cursor-grabbing"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={(e) => {
        if (onUp(e)) {
          setActiveStop(null)
        }
      }}
      onPointerCancel={(e) => {
        onUp(e)
      }}
    >
      <MapSvg
        view={view}
        data={data}
        activeLine={activeLine}
        activeStop={activeStop}
        onSelect={select}
      />
      <Header />
      <ZoomControls onZoom={zoomBy} />
      <DesktopLegend
        lines={data.lines}
        activeLine={activeLine}
        onToggleLine={toggleLine}
        showReset={activeLine !== null || activeStop !== null}
        onReset={() => {
          clear()
          home()
        }}
      />
      <MobileLegend
        lines={data.lines}
        activeLine={activeLine}
        onToggleLine={toggleLine}
      />
      {station && (
        <StopPanel
          station={station}
          lines={data.lines}
          slug={data.slugs[station.id]}
          onClose={() => setActiveStop(null)}
          onToggleLine={toggleLine}
        />
      )}
    </div>
  )
}
