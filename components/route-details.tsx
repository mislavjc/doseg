import { type ReactNode, useState, useEffect } from "react"
import { m, AnimatePresence } from "motion/react"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"

import type { Itinerary, Leg } from "@/lib/otp"
import { modeColor, modeLabel } from "@/lib/transit"

function formatDuration(seconds: number): string {
  const mins = Math.round(Math.max(0, seconds) / 60)
  if (mins < 60) return `${mins} min`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem > 0 ? `${hrs} h ${rem} min` : `${hrs} h`
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

function formatArrivalTime(departureTime: string, durationSeconds: number): string {
  const [h, m] = departureTime.split(":").map(Number)
  const depMinutes = h * 60 + m
  const arrMinutes = depMinutes + Math.round(durationSeconds / 60)
  const arrH = Math.floor(arrMinutes / 60) % 24
  const arrM = arrMinutes % 60
  return `${String(arrH).padStart(2, "0")}:${String(arrM).padStart(2, "0")}`
}

function addMinutesToTime(base: string, seconds: number): string {
  const [h, m] = base.split(":").map(Number)
  const total = h * 60 + m + Math.round(seconds / 60)
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

const DELAY_THRESHOLD = 30

function delayBadge(delay: number): { label: string; color: string } {
  if (delay > DELAY_THRESHOLD)
    return { label: `+${Math.round(delay / 60)} min`, color: "text-amber-400" }
  if (delay < -DELAY_THRESHOLD)
    return { label: `${Math.round(delay / 60)} min`, color: "text-sky-400" }
  return { label: "na vrijeme", color: "text-emerald-400" }
}

export interface RouteDetailsProps {
  itinerary: Itinerary | null
  loading: boolean
  departureTime?: string
  originName?: string
  onShare?: () => void
  onExport?: () => void
  onReset?: () => void
  shareConfirm?: boolean
  open?: boolean
}

const crossfade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.12 } }

/* ── Icons ── */

function WalkIconSmall() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="1.5" />
      <path d="M12 7.5v4.5" />
      <path d="M12 12l-2.5 5M12 12l2.5 5" />
      <path d="M12 7.5L9.5 10M12 7.5l2.5 2.5" />
    </svg>
  )
}

function TransitIcon({ mode, color }: { mode: string, color: string }) {
  if (mode === "TRAM") {
    return <svg className="h-[14px] w-[14px]" style={{color}} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9v4c0 3.87 3.13 7 7 7s7-3.13 7-7V9c0-3.87-3.13-7-7-7zm0 13.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
  }
  return <svg className="h-[14px] w-[14px]" style={{color}} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h12v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4zm0 13c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#ea4335]" fill="currentColor">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>
  )
}

function BackArrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function SwapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10v12"/><path d="M15 14v-8"/><path d="M3 14l4 4 4-4"/><path d="M11 6l4-4 4 4"/>
    </svg>
  )
}

function ShareIconBtn({ onShare, shareConfirm }: { onShare: () => void; shareConfirm?: boolean }) {
  return (
    <button type="button" onClick={onShare} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/10 hover:text-white" aria-label="Dijeli" title="Kopiraj poveznicu">
      {shareConfirm ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
      )}
    </button>
  )
}

function ExportIconBtn({ onExport }: { onExport: () => void }) {
  return (
    <button type="button" onClick={onExport} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/10 hover:text-white" aria-label="Spremi kartu" title="Spremi kao sliku">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
    </button>
  )
}

/* ── Utilities ── */

function findDestName(itinerary: Itinerary): string {
  for (let i = itinerary.legs.length - 1; i >= 0; i--) {
    if (itinerary.legs[i].to.name) return itinerary.legs[i].to.name
  }
  const t = itinerary.legs[itinerary.legs.length - 1].to
  return `${t.lat.toFixed(4)}°N, ${t.lon.toFixed(4)}°E`
}

function isShortRoute(route?: string): boolean {
  return !!route && route.length <= 6
}

/* ── Panel header (Desktop) ── */

function PanelHeader({ itinerary, originName, onReset }: { itinerary: Itinerary; originName?: string; onReset?: () => void }) {
  const origin = originName || itinerary.legs[0].from.name || "Polazište"
  const destName = findDestName(itinerary)
  return (
    <div className="bg-[rgba(32,33,36,0.98)] px-3 py-3 shrink-0 flex gap-1">
      {onReset && (
        <button type="button" onClick={onReset} className="mt-1 h-10 w-10 shrink-0 flex items-center justify-center text-slate-300 hover:text-white rounded-full hover:bg-white/10" aria-label="Natrag">
          <BackArrow />
        </button>
      )}
      <div className="min-w-0 flex-1 flex gap-3">
        <div className="flex flex-col items-center mt-3 ml-1 shrink-0">
          <div className="h-3.5 w-3.5 rounded-full border-[2.5px] border-slate-300 shrink-0" />
          <div className="flex flex-col gap-[3px] my-1 shrink-0">
            <div className="w-[3px] h-[3px] rounded-full bg-slate-500" />
            <div className="w-[3px] h-[3px] rounded-full bg-slate-500" />
            <div className="w-[3px] h-[3px] rounded-full bg-slate-500" />
          </div>
          <PinIcon />
        </div>
        <div className="min-w-0 flex-1 flex flex-col gap-2 mt-0.5">
          <input readOnly value={origin} className="h-[38px] rounded-[6px] border border-transparent bg-[#3c4043] focus:bg-[#4d5156] hover:bg-[#4d5156] transition-colors outline-none px-3 text-[14px] text-white w-full cursor-default text-ellipsis" />
          <input readOnly value={destName} className="h-[38px] rounded-[6px] border border-transparent bg-[#3c4043] focus:bg-[#4d5156] hover:bg-[#4d5156] transition-colors outline-none px-3 text-[14px] text-white w-full cursor-default text-ellipsis" />
        </div>
      </div>
      <button type="button" className="self-center mt-0.5 h-10 w-10 shrink-0 flex items-center justify-center text-slate-300 hover:text-white rounded-full hover:bg-white/10 ml-1">
        <SwapIcon />
      </button>
    </div>
  )
}

/* ── Summary bar (Desktop) ── */

function SummaryBar({ itinerary, departureTime, loading, onShare, onExport, shareConfirm }: {
  itinerary: Itinerary; departureTime?: string; loading: boolean
  onShare?: () => void; onExport?: () => void; shareConfirm?: boolean
}) {
  const dep = departureTime ?? "00:00"
  const arr = formatArrivalTime(dep, itinerary.duration)
  return (
    <div className="border-b border-white/5 px-6 py-4 bg-[rgba(32,33,36,0.5)]">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-[20px] font-medium text-white tabular-nums">
              {dep} – {arr}
            </span>
            <span className="text-[16px] text-slate-400 tabular-nums">
              ({formatDuration(itinerary.duration)})
            </span>
            {loading && <span className="route-spinner ml-2" />}
          </div>
          <TripStats itinerary={itinerary} />
        </div>
        <div className="flex items-center gap-1">
          {onShare && <ShareIconBtn onShare={onShare} shareConfirm={shareConfirm} />}
          {onExport && <ExportIconBtn onExport={onExport} />}
        </div>
      </div>
    </div>
  )
}

function TripStats({ itinerary }: { itinerary: Itinerary }) {
  return (
    <div className="mt-1 flex gap-2 text-[13px] text-slate-400">
      {itinerary.transfers > 0 && (
        <span>{itinerary.transfers} {itinerary.transfers === 1 ? "presjedanje" : "presjedanja"}</span>
      )}
      {itinerary.transfers > 0 && <span aria-hidden>·</span>}
      <span>{formatDistance(itinerary.walkDistance)} hodanja</span>
      {itinerary.bikeDistance > 0 && <span aria-hidden>·</span>}
      {itinerary.bikeDistance > 0 && <span>{formatDistance(itinerary.bikeDistance)} BAJS</span>}
    </div>
  )
}

/* ── Timeline (Google Maps step-by-step) ── */

function computeLegTimes(legs: Leg[], departureTime: string) {
  const times: string[] = []
  let elapsed = 0
  for (const leg of legs) {
    times.push(addMinutesToTime(departureTime, elapsed))
    elapsed += leg.duration
  }
  return { times, totalElapsed: elapsed }
}

function Timeline({ legs, departureTime }: { legs: Leg[]; departureTime: string }) {
  const { times, totalElapsed } = computeLegTimes(legs, departureTime)
  return (
    <div className="px-3 py-6 pb-20">
      {legs.map((leg, i) => (
        <TimelineLeg key={`${i}-${leg.mode}-${leg.from.name}`} leg={leg} time={times[i]} isFirst={i === 0} />
      ))}
      <TimelineStop
        time={addMinutesToTime(departureTime, totalElapsed)}
        name={legs[legs.length - 1]?.to.name || "Odredište"}
        color="#ea4335"
        isEnd
      />
    </div>
  )
}

function TimelineLeg({ leg, time, isFirst }: { leg: Leg; time: string; isFirst: boolean }) {
  const color = leg.mode === "WALK" ? "#94a3b8" : modeColor(leg.mode)
  return (
    <div>
      <TimelineStop
        time={time}
        name={leg.from.name || (isFirst ? "Polazište" : "")}
        color={isFirst ? "#fff" : color}
        isOrigin={isFirst}
      />
      <TimelineConnector leg={leg} color={color} />
    </div>
  )
}

function TimelineConnector({ leg, color }: { leg: Leg; color: string }) {
  const isWalk = leg.mode === "WALK"
  return (
    <div className="flex">
      <div className="w-[66px] shrink-0" />
      <div className="flex w-[20px] shrink-0 justify-center">
        <div
          className="w-[5px] rounded-full my-1 relative flex items-center justify-center"
          style={{
            background: isWalk ? "none" : color,
            opacity: isWalk ? 0.6 : 0.9,
            minHeight: 52,
            ...(isWalk ? { backgroundImage: `repeating-linear-gradient(to bottom, ${color} 0px, ${color} 4px, transparent 4px, transparent 8px)` } : {}),
          }}
        >
          {/* Overlapping icon on the line, like Google Maps */}
          {!isWalk && (
            <div className="absolute top-1/2 -translate-y-1/2 h-5 w-5 bg-[#202124] rounded-full flex items-center justify-center border border-[rgba(255,255,255,0.1)]">
               <TransitIcon mode={leg.mode} color={color} />
            </div>
          )}
          {isWalk && (
            <div className="absolute top-1/2 -translate-y-1/2 h-5 w-5 bg-[#202124] rounded-full flex items-center justify-center border border-[rgba(255,255,255,0.1)] text-slate-400">
               <WalkIconSmall />
            </div>
          )}
        </div>
      </div>
      <div className="min-w-0 flex-1 py-3 pl-4">
        <LegInfo leg={leg} />
      </div>
    </div>
  )
}

function LegInfo({ leg }: { leg: Leg }) {
  const isWalk = leg.mode === "WALK"
  const short = isShortRoute(leg.route)
  const badgeLabel = short ? leg.route! : modeLabel(leg.mode)
  const description = short ? modeLabel(leg.mode) : (leg.route || "")
  return (
    <>
      <div className="flex items-center gap-2.5">
        {!isWalk && (
          <span className="shrink-0 inline-flex h-[22px] min-w-[28px] items-center justify-center rounded-[4px] px-1.5 text-[12px] font-bold" style={{ backgroundColor: modeColor(leg.mode), color: "#fff" }}>
            {badgeLabel}
          </span>
        )}
        <span className="min-w-0 text-[15px] text-slate-200 leading-snug break-words">
          {isWalk ? "Hodanje" : description}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[13px] text-slate-400">
        <span className="tabular-nums">Oko {formatDuration(leg.duration)}, {formatDistance(leg.distance)}</span>
        {leg.delay !== undefined && !isWalk && (() => {
          const badge = delayBadge(leg.delay)
          return <span className={`font-medium tabular-nums ${badge.color}`}>{badge.label}</span>
        })()}
      </div>
    </>
  )
}

function TimelineStop({ time, name, isOrigin, isEnd }: { time: string; name: string; color?: string; isOrigin?: boolean; isEnd?: boolean }) {
  return (
    <div className="flex items-start py-0.5">
      <span className="w-[66px] shrink-0 text-right text-[13px] font-medium text-slate-300 pt-[2px] pr-3">
        {time}
      </span>
      <div className="flex w-[20px] shrink-0 items-center justify-center pt-[4px]">
        {isEnd ? (
          <PinIcon />
        ) : isOrigin ? (
          <div className="h-[14px] w-[14px] rounded-full border-[3px] border-slate-200" />
        ) : (
          <div className="h-[10px] w-[10px] rounded-full border-[2px] border-white bg-slate-900" />
        )}
      </div>
      <span className={`flex-1 pl-4 text-[16px] leading-tight pt-[1px] ${isOrigin || isEnd ? "font-semibold text-white" : "font-medium text-slate-200"}`}>
        {name}
      </span>
    </div>
  )
}

/* ── Reset button ── */

function ResetButton({ onReset }: { onReset: () => void }) {
  return (
    <div className="border-t border-white/5 px-6 py-4 bg-[rgba(32,33,36,0.5)]">
      <button
        type="button"
        onClick={onReset}
        className="w-full rounded-full bg-white/[0.08] py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-white/[0.12] active:bg-white/[0.16]"
      >
        Novo polazište
      </button>
    </div>
  )
}

/* ── Skeleton ── */

function RoutePanelSkeleton() {
  return (
    <m.div key="loading" {...crossfade} aria-hidden="true" className="flex flex-col h-full">
      <div className="bg-[rgba(32,33,36,0.98)] px-3 py-3 shrink-0 flex gap-1 h-[106px]" />
      <div className="border-b border-white/5 px-6 py-4 bg-[rgba(32,33,36,0.5)]">
        <div className="shimmer skeleton-block mb-3 h-6 w-48" />
        <div className="flex gap-2">
          <div className="shimmer skeleton-block h-4 w-16" />
          <div className="shimmer skeleton-block h-4 w-12" />
        </div>
      </div>
      <div className="p-6 space-y-8 mt-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex gap-4">
            <div className="shimmer skeleton-block h-4 w-12 shrink-0" />
            <div className="shimmer skeleton-block h-4 w-4 rounded-full shrink-0" />
            <div className="shimmer skeleton-block h-4 w-32" />
          </div>
        ))}
      </div>
    </m.div>
  )
}

/* ── Main export: Persistent side panel (desktop) ── */

export function SidePanel({ children }: { children: ReactNode }) {
  return (
    <aside className="hidden sm:flex h-full w-[400px] shrink-0 flex-col bg-[rgba(24,24,28,0.98)] border-r border-white/5 shadow-xl z-20">
      {children}
    </aside>
  )
}

export function RoutePanelContent({ itinerary, loading, departureTime, originName, onShare, onExport, onReset, shareConfirm }: RouteDetailsProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {loading && !itinerary ? (
        <RoutePanelSkeleton />
      ) : itinerary ? (
        <m.div key="route" {...crossfade} className="flex min-h-0 flex-1 flex-col">
          <PanelHeader itinerary={itinerary} originName={originName} onReset={onReset} />
          <SummaryBar itinerary={itinerary} departureTime={departureTime} loading={loading} onShare={onShare} onExport={onExport} shareConfirm={shareConfirm} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Timeline legs={itinerary.legs} departureTime={departureTime ?? "00:00"} />
          </div>
          {onReset && <ResetButton onReset={onReset} />}
        </m.div>
      ) : null}
    </AnimatePresence>
  )
}

/* ── Mobile export: bottom sheet ── */

function MobileLegStrip({ legs }: { legs: Leg[] }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {legs.map((leg, i) => (
        <span key={`${i}-${leg.mode}`} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-[11px] text-slate-500 font-bold mx-[1px]">›</span>}
          {leg.mode === "WALK" ? (
            <div className="h-[20px] px-1 flex items-center justify-center text-slate-400">
              <WalkIconSmall />
            </div>
          ) : (
            <span
              className="inline-flex h-[22px] min-w-[28px] items-center justify-center rounded-[5px] px-2 text-[12px] font-bold"
              style={{ backgroundColor: modeColor(leg.mode), color: "#fff" }}
            >
              {isShortRoute(leg.route) ? leg.route : modeLabel(leg.mode)}
            </span>
          )}
        </span>
      ))}
    </div>
  )
}

function MobileActions({ onShare, onReset, shareConfirm }: Pick<RouteDetailsProps, "onShare" | "onReset" | "shareConfirm">) {
  return (
    <div className="flex items-center gap-1.5 pt-0.5">
      {onShare && <ShareIconBtn onShare={onShare} shareConfirm={shareConfirm} />}
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-slate-300 transition-colors hover:bg-white/20 hover:text-white"
          aria-label="Zatvori rutu"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      )}
    </div>
  )
}

function MobileRouteSheetContent({ itinerary, loading, departureTime, onShare, onReset, shareConfirm }: RouteDetailsProps) {
  if (!itinerary) return null
  const dep = departureTime ?? "00:00"
  const arr = formatArrivalTime(dep, itinerary.duration)
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 pt-0 pb-3 border-b border-white/10">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <span className="text-[24px] font-medium text-white tabular-nums tracking-tight leading-none">
                {formatDuration(itinerary.duration)}
              </span>
              <span className="text-[14px] text-slate-400 tabular-nums">{dep} – {arr}</span>
              {loading && <span className="route-spinner ml-1" />}
            </div>
            <MobileLegStrip legs={itinerary.legs} />
          </div>
          <MobileActions onShare={onShare} onReset={onReset} shareConfirm={shareConfirm} />
        </div>
      </div>
      <div className="pt-2 pb-8 flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <Timeline legs={itinerary.legs} departureTime={dep} />
      </div>
    </div>
  )
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(true)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])
  return isMobile
}

export function RouteDetails(props: RouteDetailsProps & { className?: string }) {
  const [snap, setSnap] = useState<number | string | null>("148px")
  const isMobile = useIsMobile()

  if (!isMobile) return null

  return (
    <div className={props.className}>
      <Drawer
        open={props.open ?? false}
        onOpenChange={(open) => {
          if (open) setSnap("148px")
          else props.onReset?.()
        }}
        snapPoints={["148px", 0.9]}
        activeSnapPoint={snap}
        setActiveSnapPoint={setSnap}
        modal={false}
      >
        <DrawerContent
          overlay={false}
          className="bg-[rgba(30,30,30,0.92)] backdrop-blur-[20px] border-none shadow-[0_-4px_24px_rgba(0,0,0,0.3),0_0_0_0.5px_rgba(255,255,255,0.08)] outline-none"
        >
          <DrawerTitle className="sr-only">Detalji rute</DrawerTitle>
          <RouteDrawerBody {...props} />
        </DrawerContent>
      </Drawer>
    </div>
  )
}

function RouteDrawerBody(props: RouteDetailsProps) {
  return (
    <div className="px-4 pb-4 flex-1 min-h-0 flex flex-col">
      {props.loading && !props.itinerary ? (
        <div className="flex flex-col items-center justify-center py-8 gap-4">
          <div className="route-spinner !w-6 !h-6" />
          <span className="text-[15px] font-medium text-slate-300">Tražim najbolju rutu…</span>
        </div>
      ) : props.itinerary ? (
        <MobileRouteSheetContent {...props} />
      ) : null}
    </div>
  )
}
