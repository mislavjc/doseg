import { useState } from "react"
import { m, AnimatePresence } from "motion/react"

import type { Itinerary } from "@/lib/otp"
import { modeColor, modeLabel } from "@/lib/transit"

function formatDuration(seconds: number): string {
  const mins = Math.round(Math.max(0, seconds) / 60)
  if (mins < 60) return `${mins} min`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

const DELAY_THRESHOLD = 30 // seconds; below this is "on time"

function delayBadge(delay: number): { label: string; color: string } {
  if (delay > DELAY_THRESHOLD)
    return { label: `+${Math.round(delay / 60)}m`, color: "text-amber-400" }
  if (delay < -DELAY_THRESHOLD)
    return { label: `${Math.round(delay / 60)}m`, color: "text-sky-400" }
  return { label: "na vrijeme", color: "text-emerald-400" }
}

function formatArrivalTime(departureTime: string, durationSeconds: number): string {
  const [h, m] = departureTime.split(":").map(Number)
  const depMinutes = h * 60 + m
  const arrMinutes = depMinutes + Math.round(durationSeconds / 60)
  const arrH = Math.floor(arrMinutes / 60) % 24
  const arrM = arrMinutes % 60
  return `${String(arrH).padStart(2, "0")}:${String(arrM).padStart(2, "0")}`
}

interface RouteDetailsProps {
  itinerary: Itinerary | null
  loading: boolean
  departureTime?: string
  className?: string
  onShare?: () => void
  onExport?: () => void
  onReset?: () => void
  shareConfirm?: boolean
}

const ease = [0.23, 1, 0.32, 1] as const
const easeCss = `cubic-bezier(${ease.join(", ")})`

function legDescription(leg: Itinerary["legs"][number]): string {
  const from = leg.from.name || "Početak"
  const to = leg.to.name || "Kraj"

  if (
    leg.mode === "WALK" &&
    leg.from.name &&
    leg.to.name &&
    leg.from.name === leg.to.name
  ) {
    return `Presjedanje kod ${to}`
  }

  return `${from} → ${to}`
}

function WalkIcon() {
  return (
    <div
      className="flex h-5 w-5 items-center justify-center rounded bg-white/5"
      title="Hodanje"
    >
      <svg
        className="h-3.5 w-3.5 text-slate-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="5" r="1.5" />
        <path d="M12 7.5v4.5" />
        <path d="M12 12l-2.5 5M12 12l2.5 5" />
        <path d="M12 7.5L9.5 10M12 7.5l2.5 2.5" />
      </svg>
    </div>
  )
}

function ShareButton({ onShare, shareConfirm }: { onShare: () => void; shareConfirm?: boolean }) {
  return (
    <button
      type="button"
      className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
      onClick={(e) => { e.stopPropagation(); onShare() }}
      aria-label="Dijeli"
      title="Kopiraj poveznicu"
    >
      {shareConfirm ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
      )}
    </button>
  )
}

function ResetButton({ onReset }: { onReset: () => void }) {
  return (
    <div className="mt-3 flex flex-col items-center gap-2">
      <span className="text-[12px] text-slate-400">Klikni drugdje na karti za novu rutu</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onReset() }}
        className="w-full rounded-md bg-white/[0.07] py-1.5 text-[12px] font-medium text-slate-400 transition-[background-color,transform] duration-160 ease-out hover:bg-white/[0.12] hover:text-slate-200 active:scale-[0.97]"
      >
        Novo polazište
      </button>
    </div>
  )
}

function ExportButton({ onExport }: { onExport: () => void }) {
  return (
    <button
      type="button"
      className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
      onClick={(e) => { e.stopPropagation(); onExport() }}
      aria-label="Spremi kartu"
      title="Spremi kao sliku"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
    </button>
  )
}

function ActionButtons({
  loading,
  isExpanded,
  onShare,
  onExport,
  shareConfirm,
}: {
  loading: boolean
  isExpanded: boolean
  onShare?: () => void
  onExport?: () => void
  shareConfirm?: boolean
}) {
  return (
    <div className="flex items-center gap-1.5">
      <AnimatePresence>
        {loading && (
          <m.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.15, ease }}
          >
            <div className="route-spinner" />
          </m.div>
        )}
      </AnimatePresence>
      {onShare && <ShareButton onShare={onShare} shareConfirm={shareConfirm} />}
      {onExport && <ExportButton onExport={onExport} />}
      <svg
        className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
        style={{ transitionTimingFunction: easeCss }}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  )
}

function LegsBadges({ legs }: { legs: Itinerary["legs"] }) {
  return (
    <m.div layout className="mt-1 flex flex-wrap items-center gap-1.5">
      <AnimatePresence mode="popLayout">
        {legs.map((leg, i) => (
          <m.div
            key={`${i}-${leg.mode}-${leg.route || "walk"}`}
            layout
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.15, ease }}
            className="flex items-center gap-1.5"
          >
            {i > 0 && <span className="text-[10px] text-slate-600">›</span>}
            {leg.mode === "WALK" ? (
              <WalkIcon />
            ) : (
              <span
                className="inline-flex h-[20px] min-w-[28px] items-center justify-center rounded-[4px] px-1.5 text-[11px] font-semibold"
                style={{ backgroundColor: modeColor(leg.mode), color: "#fff" }}
              >
                {leg.route || modeLabel(leg.mode)}
              </span>
            )}
          </m.div>
        ))}
      </AnimatePresence>
    </m.div>
  )
}

function TripStats({ itinerary }: { itinerary: Itinerary }) {
  return (
    <div className="mb-3 flex gap-1.5 text-[11px] text-slate-400">
      {itinerary.transfers > 0 && (
        <span>
          {itinerary.transfers}{" "}
          {itinerary.transfers === 1 ? "presjedanje" : "presjedanja"}
        </span>
      )}
      {itinerary.transfers > 0 && <span aria-hidden>·</span>}
      <span>{formatDistance(itinerary.walkDistance)} hodanja</span>
      {itinerary.bikeDistance > 0 && <span aria-hidden>·</span>}
      {itinerary.bikeDistance > 0 && (
        <span>{formatDistance(itinerary.bikeDistance)} BAJS voznje</span>
      )}
    </div>
  )
}

function LegRow({ leg }: { leg: Itinerary["legs"][number] }) {
  return (
    <div role="listitem" className="flex items-center gap-2 py-1">
      <span
        className="inline-flex h-[22px] min-w-[36px] items-center justify-center rounded-[5px] px-1.5 text-[11px] font-semibold"
        style={{
          backgroundColor: leg.mode === "WALK" ? "rgba(255,255,255,0.08)" : modeColor(leg.mode),
          color: leg.mode === "WALK" ? "#94a3b8" : "#fff",
        }}
      >
        {leg.route || modeLabel(leg.mode)}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-slate-400">
        {legDescription(leg)}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <span className="text-[11px] text-slate-400 tabular-nums">
          {formatDuration(leg.duration)}
        </span>
        {leg.mode !== "WALK" &&
          leg.delay !== undefined &&
          (() => {
            const badge = delayBadge(leg.delay)
            return (
              <span className={`text-[9px] font-medium tabular-nums ${badge.color}`}>
                {badge.label}
              </span>
            )
          })()}
      </span>
    </div>
  )
}

function ExpandedDetails({ itinerary, open }: { itinerary: Itinerary; open: boolean }) {
  return (
    <div
      className="grid transition-[grid-template-rows] duration-250 motion-reduce:transition-none"
      style={{
        gridTemplateRows: open ? "1fr" : "0fr",
        transitionTimingFunction: easeCss,
      }}
    >
      <div className="overflow-hidden" {...(!open && { inert: true })}>
        <div
          className={`mt-4 transition-opacity duration-150 motion-reduce:transition-none ${open ? "opacity-100 delay-75" : "opacity-0"}`}
        >
          <TripStats itinerary={itinerary} />
          <div className="flex max-h-[30vh] flex-col gap-0.5 overflow-y-auto sm:max-h-[40vh]" role="list">
            {itinerary.legs.map((leg, i) => (
              <LegRow key={`${i}-${leg.from.name}-${leg.to.name}`} leg={leg} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const crossfade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.12 } }

function LoadingSpinner() {
  return (
    <m.div key="loading" className="flex items-center gap-2" {...crossfade}>
      <div className="route-spinner" />
      <span className="text-[12px] text-slate-400">Tražim rutu…</span>
    </m.div>
  )
}

function RouteContent({ itinerary, loading, departureTime, isExpanded, onShare, onExport, onReset, shareConfirm }: RouteDetailsProps & { isExpanded: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-2xl font-semibold tracking-tight text-slate-100 tabular-nums">
          {formatDuration(itinerary!.duration)}
        </span>
        {departureTime && (
          <p className="text-[11px] text-slate-400 tabular-nums">
            Dolazak: {formatArrivalTime(departureTime, itinerary!.duration)}
          </p>
        )}
      </div>
      <ActionButtons
        loading={loading}
        isExpanded={isExpanded}
        onShare={onShare}
        onExport={onExport}
        shareConfirm={shareConfirm}
      />
    </div>
  )
}

export function RouteDetails({ itinerary, loading, departureTime, className, onShare, onExport, onReset, shareConfirm }: RouteDetailsProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <m.div
      className={className ?? "panel absolute right-3 bottom-8 left-3 cursor-pointer sm:right-auto sm:bottom-8 sm:left-4 sm:w-[280px]"}
      role="button"
      aria-expanded={isExpanded}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8, transition: { duration: 0.15, ease } }}
      transition={{ duration: 0.2, ease }}
      onClick={() => itinerary && setIsExpanded(!isExpanded)}
    >
      <AnimatePresence mode="wait" initial={false}>
        {loading && !itinerary ? (
          <LoadingSpinner />
        ) : itinerary ? (
          <m.div key="route" {...crossfade}>
            <RouteContent
              itinerary={itinerary}
              loading={loading}
              departureTime={departureTime}
              isExpanded={isExpanded}
              onShare={onShare}
              onExport={onExport}
              onReset={onReset}
              shareConfirm={shareConfirm}
            />
            <LegsBadges legs={itinerary.legs} />
            <ExpandedDetails itinerary={itinerary} open={isExpanded} />
            {onReset && <ResetButton onReset={onReset} />}
          </m.div>
        ) : null}
      </AnimatePresence>
    </m.div>
  )
}
