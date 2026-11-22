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
 * The map opens at 1 CSS px per map unit, so station labels render at the
 * system's 12px, centred on the main square; on desktop the centre shifts
 * right to clear the legend. Zoom out to see the whole network.
 */
const CENTRE = "Trg bana J. Jelačića"
const MOBILE_MAX = 640
const LEGEND_W = 336

function openingView(data: TramMapData) {
  return (width: number, height: number): View => {
    const [vx, vy, vw, vh] = data.viewBox
    const k = Math.min(width / vw, height / vh)
    const centre = data.stations.find((s) => s.name === CENTRE) ?? {
      x: vx + vw / 2,
      y: vy + vh / 2,
    }
    const sx = (width - vw * k) / 2 + (centre.x - vx) * k
    const sy = (height - vh * k) / 2 + (centre.y - vy) * k
    const s = Math.max(1, 1 / k)
    const left = width >= MOBILE_MAX ? LEGEND_W : 0
    return { x: left + (width - left) / 2 - s * sx, y: height / 2 - s * sy, s }
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
