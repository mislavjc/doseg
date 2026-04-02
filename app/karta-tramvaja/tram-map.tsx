"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import Link from "next/link"
import {
  TRAM_LINES,
  STATIONS,
  linesAtStation,
  isInterchange,
  LINE_W,
  SPACING,
  EDGES,
  edgeKey,
  type TramLine,
} from "@/lib/zagreb-tram-network"
import { LineBadges } from "./line-badges"

const INTERCHANGE_R = 7
const STOP_R = 3.5
const MIN_ZOOM = 0.3
const MAX_ZOOM = 6

type View = { x: number; y: number; s: number }

/** Zoom toward/away from a point, clamping scale to [MIN_ZOOM, MAX_ZOOM]. */
function zoomAtPoint(v: View, factor: number, px: number, py: number): View {
  const ns = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.s * factor))
  return { x: px - (px - v.x) * (ns / v.s), y: py - (py - v.y) * (ns / v.s), s: ns }
}

interface Seg {
  x1: number
  y1: number
  x2: number
  y2: number
  line: string
  color: string
}

const allSegments: Seg[] = TRAM_LINES.flatMap((line) =>
  line.stationIds.slice(0, -1).map((aId, i) => {
    const bId = line.stationIds[i + 1]
    const key = edgeKey(aId, bId)
    const e = EDGES.get(key)!
    const idx = e.lines.indexOf(line.number)
    const off = (idx - (e.lines.length - 1) / 2) * SPACING
    const sA = STATIONS[aId],
      sB = STATIONS[bId]
    return {
      x1: sA.x + e.px * off,
      y1: sA.y + e.py * off,
      x2: sB.x + e.px * off,
      y2: sB.y + e.py * off,
      line: line.number,
      color: line.color,
    }
  }),
)

interface StopInfo {
  id: string
  name: string
  x: number
  y: number
  interchange: boolean
  lines: TramLine[]
}

const stops: StopInfo[] = Object.values(STATIONS).map((s) => ({
  id: s.id,
  name: s.name,
  x: s.x,
  y: s.y,
  interchange: isInterchange(s.id),
  lines: linesAtStation(s.id),
}))

// Hand-tuned label offsets per station. On horizontal segments, 45deg rotated
// labels are used (tube-map style) to avoid overlapping neighbouring labels.

interface LabelLayout {
  dx: number
  dy: number
  anchor: "start" | "middle" | "end"
  rotate?: number
}

const LABEL_POSITIONS: Record<string, LabelLayout> = {
  "crnomerec":        { dx: 0,  dy: -14, anchor: "middle" },
  "trg-tudjmana":     { dx: 4,  dy: -14, anchor: "start", rotate: -45 },
  "frankopanska":     { dx: 4,  dy: -14, anchor: "start", rotate: -45 },
  "trg-jelacica":     { dx: 0,  dy: -16, anchor: "middle" },
  "draskovic":        { dx: 4,  dy: -14, anchor: "start", rotate: -45 },
  "kvaternikov-trg":  { dx: 4,  dy: -14, anchor: "start", rotate: -45 },
  "park-maksimir":    { dx: 4,  dy: -14, anchor: "start", rotate: -45 },
  "ravnice":          { dx: 4,  dy: -14, anchor: "start", rotate: -45 },
  "dubrava":          { dx: 4,  dy: -14, anchor: "start", rotate: -45 },
  "dubec":            { dx: 0,  dy: -14, anchor: "middle" },
  "trg-zrtava-fasizma": { dx: 4,  dy: -14, anchor: "start", rotate: -45 },
  "subiceva":           { dx: 4,  dy: -14, anchor: "start", rotate: -45 },
  "heinzelova-sjever":  { dx: 4,  dy: -14, anchor: "start", rotate: -45 },
  "svetice":            { dx: 4,  dy: -14, anchor: "start", rotate: -45 },
  "borongaj":           { dx: 0,  dy: -14, anchor: "middle" },
  "gupceva-zvijezda": { dx: -12, dy: 4, anchor: "end" },
  "mihaljevac":       { dx: -12, dy: 4, anchor: "end" },
  "gracansko-dolje":  { dx: 0,  dy: -12, anchor: "middle" },
  "zrinjevac":        { dx: -12, dy: 4, anchor: "end" },
  "sheraton":         { dx: 12,  dy: 4, anchor: "start" },
  "ljubljanica":        { dx: 0,   dy: 16, anchor: "middle" },
  "tehnicki-muzej":     { dx: 4,   dy: 16, anchor: "start", rotate: 45 },
  "studentski-centar":  { dx: 4,   dy: 16, anchor: "start", rotate: 45 },
  "vodnikova":          { dx: 4,   dy: 16, anchor: "start", rotate: 45 },
  "botanicki-vrt":      { dx: 4,   dy: 16, anchor: "start", rotate: 45 },
  "glavni-kolodvor":    { dx: 0,   dy: -16, anchor: "middle" }, // above, to avoid botanicki-vrt collision
  "branimir-centar":    { dx: 4,   dy: 16, anchor: "start", rotate: 45 },
  "autobusni-kolodvor": { dx: 4,   dy: 16, anchor: "start", rotate: 45 },
  "drziceva":           { dx: 0,   dy: -16, anchor: "middle" }, // above, lines go south from here
  "heinzelova":         { dx: 4,   dy: 16, anchor: "start", rotate: 45 },
  "getaldic":           { dx: 4,   dy: 16, anchor: "start", rotate: 45 },
  "zitnjak":            { dx: 4,   dy: 16, anchor: "start", rotate: 45 },
  "savisce":            { dx: 0,   dy: 16, anchor: "middle" },
  "precko":         { dx: 0,   dy: -14, anchor: "middle" },
  "knezija":        { dx: 0,   dy: -14, anchor: "middle" },
  "st-dom-radic":   { dx: 0,   dy: -14, anchor: "middle" },
  "zagrepčanka":    { dx: 12,  dy: -4, anchor: "start" },
  "savski-most":    { dx: 0,   dy: 16, anchor: "middle" },
  "drziceva-petlja": { dx: 12, dy: 4, anchor: "start" },
  "most-mladosti":   { dx: 12, dy: 4, anchor: "start" },
  "zaprudje":        { dx: 12, dy: -4, anchor: "start" },
  "sredisce":   { dx: 0, dy: 18, anchor: "middle" },
  "sopot":      { dx: 0, dy: 18, anchor: "middle" },
  "trnsko":     { dx: 0, dy: 18, anchor: "middle" },
  "savski-gaj": { dx: 0, dy: 18, anchor: "middle" },
  "zapadni-kolodvor": { dx: 12, dy: 4, anchor: "start" },
}

function labelPos(s: StopInfo): LabelLayout {
  return LABEL_POSITIONS[s.id] ?? { dx: 0, dy: 18, anchor: "middle" }
}

// ---------------------------------------------------------------------------
// Extracted sub-components
// ---------------------------------------------------------------------------

function ZoomControls({ onZoomIn, onZoomOut }: { onZoomIn: () => void; onZoomOut: () => void }) {
  return (
    <div
      data-ui
      className="island absolute top-4 right-4 z-10 flex flex-col gap-0 rounded-xl p-0 overflow-hidden"
    >
      <button
        onClick={onZoomIn}
        className="px-3 py-2 text-lg font-medium text-slate-600 hover:bg-slate-100 transition-colors leading-none"
        aria-label="Zoom in"
      >
        +
      </button>
      <div className="h-px bg-slate-100" />
      <button
        onClick={onZoomOut}
        className="px-3 py-2 text-lg font-medium text-slate-600 hover:bg-slate-100 transition-colors leading-none"
        aria-label="Zoom out"
      >
        &minus;
      </button>
    </div>
  )
}

function LegendRow({ line, activeLine, onToggle }: { line: TramLine; activeLine: string | null; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-all ${
        activeLine === line.number
          ? "bg-slate-100 ring-1 ring-slate-200"
          : activeLine ? "opacity-35 hover:opacity-60" : "hover:bg-slate-50"
      }`}
    >
      <span
        className="inline-flex h-5 w-7 shrink-0 items-center justify-center rounded text-[11px] font-bold text-white"
        style={{ backgroundColor: line.color }}
      >
        {line.number}
      </span>
      <span className="text-slate-700">{line.label}</span>
    </button>
  )
}

function DesktopLegend({
  activeLine, showReset, onToggleLine, onReset,
}: {
  activeLine: string | null; showReset: boolean; onToggleLine: (n: string) => void; onReset: () => void
}) {
  return (
    <div data-ui className="island absolute bottom-4 left-4 z-10 hidden sm:block max-h-[70vh] overflow-y-auto rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tramvajske linije</h2>
        {showReset && (
          <button onClick={onReset} className="text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors">
            Resetiraj
          </button>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        {TRAM_LINES.map((line) => (
          <LegendRow key={line.number} line={line} activeLine={activeLine} onToggle={() => onToggleLine(line.number)} />
        ))}
      </div>
    </div>
  )
}

function MobileLegend({
  activeLine,
  onToggleLine,
}: {
  activeLine: string | null
  onToggleLine: (n: string) => void
}) {
  const [open, setOpen] = useState(true)
  return (
    <div
      data-ui
      className="island absolute bottom-4 left-3 right-3 z-10 sm:hidden rounded-2xl"
    >
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between px-4 py-2.5"
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Tramvajske linije
        </span>
        <span className="text-xs text-slate-400">
          {open ? "\u25BE" : "\u25B4"}
        </span>
      </button>
      {open && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-3">
          {TRAM_LINES.map((line) => (
            <button
              key={line.number}
              onClick={() => onToggleLine(line.number)}
              className="rounded-md px-2 py-1 text-xs font-bold text-white transition-opacity"
              style={{
                backgroundColor: line.color,
                opacity: activeLine && activeLine !== line.number ? 0.3 : 1,
              }}
            >
              {line.number}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function LineProgressRow({ line, stopId, onToggle }: { line: TramLine; stopId: string; onToggle: () => void }) {
  const idx = line.stationIds.indexOf(stopId)
  const total = line.stationIds.length
  const pct = total > 1 ? (idx / (total - 1)) * 100 : 50
  return (
    <button onClick={onToggle} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-slate-50">
      <span className="inline-flex h-6 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white shadow-sm" style={{ backgroundColor: line.color }}>
        {line.number}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-slate-700">
          {STATIONS[line.stationIds[0]].name} &rarr; {STATIONS[line.stationIds[total - 1]].name}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <div className="relative h-1 flex-1 rounded-full bg-slate-100">
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, backgroundColor: line.color }} />
            <div className="absolute top-1/2 h-2.5 w-2.5 rounded-full border-2 border-white shadow-sm" style={{ left: `${pct}%`, backgroundColor: line.color, transform: "translate(-50%,-50%)" }} />
          </div>
          <span className="shrink-0 text-[10px] tabular-nums text-slate-400">{idx + 1}/{total}</span>
        </div>
      </div>
    </button>
  )
}

function StationInfoPanel({ stop, onClose, onToggleLine }: { stop: StopInfo; onClose: () => void; onToggleLine: (n: string) => void }) {
  const lineCount = stop.lines.length
  return (
    <div data-ui className="island island-expanded absolute top-4 right-16 z-20 w-80 overflow-hidden p-0">
      <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-800">{stop.name}</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {stop.interchange ? "Presjedanje" : "Stajalište"} &middot; {lineCount} {lineCount === 1 ? "linija" : lineCount < 5 ? "linije" : "linija"}
            </p>
          </div>
          <button onClick={onClose} className="mt-0.5 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600" aria-label="Zatvori">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        {stop.lines.map((line) => (
          <LineProgressRow key={line.number} line={line} stopId={stop.id} onToggle={() => onToggleLine(line.number)} />
        ))}
      </div>
    </div>
  )
}

const SAVA_PATH = "M -10 590 C 150 590, 250 600, 400 598 S 620 588, 820 593 S 1020 600, 1300 596"

function MapSvgSegments({ activeLine }: { activeLine: string | null }) {
  return (
    <g>
      {allSegments.map((seg, i) => (
        <line
          key={i}
          x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2}
          stroke={seg.color} strokeWidth={LINE_W} strokeLinecap="round"
          opacity={activeLine ? (seg.line === activeLine ? 1 : 0.1) : 1}
          className="transition-opacity duration-200"
        />
      ))}
    </g>
  )
}

function isOnActiveLine(activeLine: string | null, stopId: string) {
  return !activeLine || TRAM_LINES.find((l) => l.number === activeLine)?.stationIds.includes(stopId)
}

function StationCircles({
  activeLine, activeStop, hoverStop, onHover, onSelect,
}: {
  activeLine: string | null; activeStop: string | null; hoverStop: string | null
  onHover: (id: string | null) => void; onSelect: (id: string) => void
}) {
  return (
    <g>
      {stops.map((s) => {
        const r = s.interchange ? INTERCHANGE_R : STOP_R
        return (
          <circle
            key={s.id} cx={s.x} cy={s.y}
            r={hoverStop === s.id || activeStop === s.id ? r + 2 : r}
            fill="white"
            stroke={activeStop === s.id ? "#0f172a" : s.interchange ? "#334155" : "#94a3b8"}
            strokeWidth={s.interchange ? 2.5 : 1.5}
            opacity={isOnActiveLine(activeLine, s.id) ? 1 : 0.25}
            className="cursor-pointer transition-all duration-150"
            data-ui
            onPointerEnter={() => onHover(s.id)}
            onPointerLeave={() => onHover(null)}
            onClick={(e) => { e.stopPropagation(); onSelect(s.id) }}
          />
        )
      })}
    </g>
  )
}

function StationLabels({ activeLine }: { activeLine: string | null }) {
  return (
    <g>
      {stops.map((s) => {
        const lp = labelPos(s)
        const tx = s.x + lp.dx, ty = s.y + lp.dy
        return (
          <text
            key={s.id} x={tx} y={ty} textAnchor={lp.anchor}
            fontSize={s.interchange ? 11 : 9} fontWeight={s.interchange ? 700 : 400}
            fontFamily="var(--font-sans), system-ui, sans-serif"
            fill={s.interchange ? "#0f172a" : "#334155"}
            opacity={isOnActiveLine(activeLine, s.id) ? 0.9 : 0.15}
            className="pointer-events-none select-none transition-opacity duration-200"
            style={{ paintOrder: "stroke fill" }}
            stroke="white" strokeWidth={3} strokeLinejoin="round"
            {...(lp.rotate ? { transform: `rotate(${lp.rotate} ${tx} ${ty})` } : {})}
          >
            {s.name}
          </text>
        )
      })}
    </g>
  )
}

function HoverTooltip({ stopId }: { stopId: string }) {
  const s = stops.find((st) => st.id === stopId)
  if (!s) return null
  return (
    <g className="pointer-events-none">
      <rect x={s.x - 4} y={s.y - 28} width={s.name.length * 7.5 + 12} height={22} rx={6} fill="rgba(15,23,42,0.88)" />
      <text x={s.x + 2} y={s.y - 13} fontSize={11} fontWeight={600} fontFamily="var(--font-sans), system-ui, sans-serif" fill="white">
        {s.name}
      </text>
    </g>
  )
}

function usePanZoom() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, s: 1 })
  const ptrs = useRef(new Map<number, { x: number; y: number }>())
  const pinchDist = useRef<number | null>(null), dragStart = useRef<{ x: number; y: number } | null>(null)

  const onDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as Element).closest("[data-ui]")) return
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    dragStart.current = { x: e.clientX, y: e.clientY }
    containerRef.current?.setPointerCapture(e.pointerId)
  }, [])

  const onMove = useCallback((e: React.PointerEvent) => {
    const prev = ptrs.current.get(e.pointerId)
    if (!prev) return
    if (ptrs.current.size === 1) {
      setView((v) => ({ ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y }))
      ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    } else if (ptrs.current.size === 2) {
      ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const pts = [...ptrs.current.values()]
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      if (pinchDist.current !== null) {
        const rect = containerRef.current!.getBoundingClientRect()
        setView((v) => zoomAtPoint(v, dist / pinchDist.current!, (pts[0].x + pts[1].x) / 2 - rect.left, (pts[0].y + pts[1].y) / 2 - rect.top))
      }
      pinchDist.current = dist
    }
  }, [])

  const onUp = useCallback((e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId)
    if (ptrs.current.size < 2) pinchDist.current = null
    const ds = dragStart.current; dragStart.current = null
    return ds && Math.hypot(e.clientX - ds.x, e.clientY - ds.y) < 4
  }, [])

  useEffect(() => { // passive: false required to prevent page scroll
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      setView((v) => zoomAtPoint(v, e.deltaY > 0 ? 0.92 : 1.08, e.clientX - rect.left, e.clientY - rect.top))
    }
    el.addEventListener("wheel", handler, { passive: false })
    return () => el.removeEventListener("wheel", handler)
  }, [])

  const zoomIn = useCallback(() => setView((v) => ({ ...v, s: Math.min(MAX_ZOOM, v.s * 1.3) })), [])
  const zoomOut = useCallback(() => setView((v) => ({ ...v, s: Math.max(MIN_ZOOM, v.s / 1.3) })), [])
  const reset = useCallback(() => setView({ x: 0, y: 0, s: 1 }), [])
  return { containerRef, view, onDown, onMove, onUp, zoomIn, zoomOut, reset }
}

function MapSvg({
  view, activeLine, activeStop, hoverStop, onHover, onSelect,
}: {
  view: View; activeLine: string | null; activeStop: string | null; hoverStop: string | null
  onHover: (id: string | null) => void; onSelect: (id: string) => void
}) {
  return (
    <svg
      viewBox="0 10 1280 790" preserveAspectRatio="xMidYMid meet" className="h-full w-full"
      style={{ transform: `translate(${view.x}px,${view.y}px) scale(${view.s})`, transformOrigin: "0 0", willChange: "transform" }}
    >
      <defs>
        <pattern id="dot-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="10" cy="10" r="0.5" fill="#94a3b8" opacity="0.25" />
        </pattern>
      </defs>
      <rect x="0" y="10" width="1280" height="790" fill="url(#dot-grid)" />
      <path d={SAVA_PATH} fill="none" stroke="#4BA3D4" strokeWidth={28} strokeLinecap="round" opacity={0.13} />
      <path d={SAVA_PATH} fill="none" stroke="#4BA3D4" strokeWidth={12} strokeLinecap="round" opacity={0.18} />
      <text x={1120} y={585} fontSize={14} fontWeight={700} fontFamily="var(--font-sans), system-ui, sans-serif" fill="#4BA3D4" opacity={0.4} letterSpacing="0.25em" className="pointer-events-none select-none">SAVA</text>
      <MapSvgSegments activeLine={activeLine} />
      <StationCircles activeLine={activeLine} activeStop={activeStop} hoverStop={hoverStop} onHover={onHover} onSelect={onSelect} />
      <StationLabels activeLine={activeLine} />
      <LineBadges activeLine={activeLine} />
      {hoverStop && !activeStop && <HoverTooltip stopId={hoverStop} />}
    </svg>
  )
}

export function TramMap() {
  const { containerRef, view, onDown, onMove, onUp, zoomIn, zoomOut, reset } = usePanZoom()
  const [activeLine, setActiveLine] = useState<string | null>(null)
  const [activeStop, setActiveStop] = useState<string | null>(null)
  const [hoverStop, setHoverStop] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setActiveStop(null); setActiveLine(null) } }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const resetView = () => { reset(); setActiveLine(null); setActiveStop(null) }
  const toggleLine = (n: string) => { setActiveLine((p) => (p === n ? null : n)); setActiveStop(null) }
  const stopInfo = activeStop ? stops.find((s) => s.id === activeStop) : null

  return (
    <div
      ref={containerRef}
      className="relative h-svh min-h-0 w-full cursor-grab overflow-hidden bg-background select-none active:cursor-grabbing"
      style={{ touchAction: "none" }}
      onPointerDown={onDown} onPointerMove={onMove}
      onPointerUp={(e) => { if (onUp(e)) setActiveStop(null) }}
      onPointerCancel={onUp}
    >
      <MapSvg view={view} activeLine={activeLine} activeStop={activeStop} hoverStop={hoverStop} onHover={setHoverStop} onSelect={(id) => setActiveStop((p) => (p === id ? null : id))} />
      <header data-ui className="island island-compact absolute top-4 left-4 z-10 flex items-center gap-3">
        <Link href="/" className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-800">&larr; Doseg</Link>
        <span className="text-slate-200">|</span>
        <h1 className="text-sm font-semibold text-slate-800">Karta tramvajskih linija</h1>
      </header>
      <ZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} />
      <DesktopLegend activeLine={activeLine} showReset={!!activeLine || view.s !== 1} onToggleLine={toggleLine} onReset={resetView} />
      <MobileLegend activeLine={activeLine} onToggleLine={toggleLine} />
      {stopInfo && <StationInfoPanel stop={stopInfo} onClose={() => setActiveStop(null)} onToggleLine={toggleLine} />}
    </div>
  )
}
