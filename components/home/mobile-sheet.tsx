"use client"

import { useState } from "react"
import { AnimatePresence, m, useReducedMotion } from "motion/react"
import { Drawer } from "vaul"
import {
  IconChevronTop,
  IconLocation,
} from "@central-icons-react/square-outlined-radius-0-stroke-2"

import { NAV_LINKS, NavLink } from "@/app/statistika/editorial/site-nav"
import { legLineColors } from "@/lib/mode-colors"
import type { Itinerary } from "@/lib/otp"
import {
  ErrorContent,
  GeoButton,
  isRouteTooFar,
  JourneyStrip,
  LegList,
  LjestvicaRow,
  LoadingContent,
  MinutesRow,
  PoiList,
  ReachReadout,
  RouteSkeleton,
  RouteSummary,
  RouteTooFar,
  type PanelContentProps,
  type ReachStats,
} from "./panel-content"
import type { PanelState } from "./reach-state"
import { BlueAction, Eyebrow, ReachRamp } from "./ui"

/**
 * Mobile bottom sheet: at rest it is just a 56px answer bar (km² + chevron) so
 * the map stays ~95% visible; tap or drag it up to the 0.62 open state for the
 * full detail (same shared blocks as the desktop sidebar). One predictable bar.
 */

// Open keeps the map (and the isochrone you just drew) on screen. Peek is only
// the answer-bar height plus the home-indicator inset, measured once so the bar
// always clears the safe area without a calc() vaul can't parse.
const ANSWER_BAR_PX = 56
const SNAP_OPEN = 0.62

function peekSnap(): string {
  if (typeof document === "undefined") return `${ANSWER_BAR_PX}px`
  const probe = document.createElement("div")
  probe.style.cssText =
    "position:absolute;visibility:hidden;padding-bottom:env(safe-area-inset-bottom)"
  document.body.appendChild(probe)
  const inset = parseFloat(getComputedStyle(probe).paddingBottom) || 0
  probe.remove()
  return `${ANSWER_BAR_PX + inset}px`
}

/** Site nav for the phone — lives at the bottom of the (expanded) sheet
 * instead of a top bar, so the map keeps its space. */
function SheetNav() {
  return (
    <nav className="mt-3.5 flex flex-wrap gap-x-[18px] gap-y-2.5 border-t border-hairline pt-4">
      {NAV_LINKS.map((l) => (
        <NavLink key={l.href} label={l.label} href={l.href} active={false} />
      ))}
    </nav>
  )
}

function EmptyPeek({ onUseMyLocation }: { onUseMyLocation: () => void }) {
  return (
    <>
      <Eyebrow>doseg · zagreb</Eyebrow>
      <div className="flex flex-col gap-[5px]">
        <p className="font-heros text-head font-bold text-ink">
          Klikni bilo gdje na karti
        </p>
        <p className="font-heros text-[16px] leading-[22px] text-ink-muted">
          vidiš dokle stigneš za 30 minuta
        </p>
      </div>
      <GeoButton onUse={onUseMyLocation} />
      <ReachRamp rightLabel="30 min daleko" />
    </>
  )
}

function RouteSheetContent({
  itinerary,
  departedAt,
  open,
  onBackToReach,
}: {
  itinerary: Itinerary
  departedAt: Date | null
  open: boolean
  onBackToReach: () => void
}) {
  const reduce = useReducedMotion()
  if (isRouteTooFar(itinerary)) {
    return (
      <>
        <RouteTooFar hideHeadline />
        {open && (
          <BlueAction onClick={onBackToReach} back className="self-start">
            Natrag na doseg
          </BlueAction>
        )}
      </>
    )
  }
  // Only the open timeline needs leg colors; while closed the collapsed strip
  // (MiniRoute) owns that compute, so skip it here rather than run it twice.
  const colors = open ? legLineColors(itinerary.legs) : []
  // The full timeline unfurls upward with a soft spring when the route opens;
  // the leg rows then cascade in via their own CSS stagger (leg-stagger).
  return (
    <AnimatePresence initial={false}>
      {open && (
        <m.div
          key="route-timeline"
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={
            reduce
              ? { opacity: 0 }
              : { opacity: 0, y: 8, transition: { duration: 0.15 } }
          }
          transition={{ type: "spring", duration: 0.5, bounce: 0.2 }}
          className="flex min-h-0 flex-col gap-[14px]"
        >
          <RouteSummary itinerary={itinerary} departedAt={departedAt} hideHeadline />
          <JourneyStrip legs={itinerary.legs} colors={colors} />
          <BlueAction onClick={onBackToReach} back className="self-start">
            Natrag na doseg
          </BlueAction>
          <LegList itinerary={itinerary} colors={colors} />
        </m.div>
      )}
    </AnimatePresence>
  )
}

function SheetBody({
  panel,
  minutes,
  onMinutesChange,
  stats,
  poiCounts,
  poiLayers,
  onTogglePoi,
  districtCtx,
  departedAt,
  onBackToReach,
  onRetry,
  onUseMyLocation,
  open,
}: PanelContentProps & { open: boolean }) {
  const mode = panel.mode
  return (
    <div
      className={`flex min-h-0 flex-1 flex-col px-5 pb-6 ${
        open ? "scroll-fade overflow-y-auto" : "overflow-hidden"
      }`}
    >
      {/* keyed by mode → enter cross-fade on state change (spec §10) */}
      <div key={mode} className="panel-swap flex min-h-0 flex-col gap-[14px]">
        {mode === "empty" && <EmptyPeek onUseMyLocation={onUseMyLocation} />}
        {mode === "loading" && <LoadingContent />}
        {mode === "error" && <ErrorContent onRetry={onRetry} />}
        {mode === "reach" && (
          <>
            <ReachReadout minutes={minutes} stats={stats} hideHeadline />
            <ReachRamp rightLabel={`${minutes} min daleko`} />
            <MinutesRow minutes={minutes} onChange={onMinutesChange} />
            <PoiList
              poiCounts={poiCounts}
              active={poiLayers}
              onToggle={onTogglePoi}
            />
            <LjestvicaRow ctx={districtCtx} />
          </>
        )}
        {mode === "route-loading" && <RouteSkeleton />}
        {mode === "route" && (
          <RouteSheetContent
            itinerary={panel.itinerary}
            departedAt={departedAt}
            open={open}
            onBackToReach={onBackToReach}
          />
        )}
      </div>
      <SheetNav />
    </div>
  )
}

// One-line bar copy for the muted, non-reach modes. AnswerBar only falls here
// for a route when it is too far (normal routes render via MiniRoute).
const BAR_LINE: Record<Exclude<PanelState["mode"], "reach">, string> = {
  empty: "Klikni kartu da vidiš doseg",
  loading: "računam doseg…",
  error: "Greška pri izračunu",
  "route-loading": "tražim rutu…",
  route: "Predaleko za javni prijevoz",
}

/** The reach answer condensed to one line, per panel mode. 16/12 only. */
function AnswerLine({
  panel,
  minutes,
  stats,
}: {
  panel: PanelState
  minutes: number
  stats: ReachStats | null
}) {
  const cls = "font-heros text-[16px] leading-5"
  if (panel.mode === "reach") {
    return (
      <span className={cls}>
        <span className="font-bold text-ink">
          {stats ? `${Math.round(stats.km2)} km²` : "—"}
        </span>
        {stats && <span className="text-ink-muted"> za {minutes} min</span>}
      </span>
    )
  }
  return <span className={`${cls} text-ink-muted`}>{BAR_LINE[panel.mode]}</span>
}

/** Route summary on the collapsed bar: total time + the mini leg strip, which
 * crossfades out as the full timeline springs up (the small to big hand-off). */
function MiniRoute({
  itinerary,
  open,
}: {
  itinerary: Itinerary
  open: boolean
}) {
  const reduce = useReducedMotion()
  return (
    <div className="flex min-w-0 grow items-center gap-2.5">
      <span className="shrink-0 font-heros text-[16px] leading-5 font-bold text-ink">
        {Math.round(itinerary.duration / 60)} min
      </span>
      <AnimatePresence initial={false}>
        {!open && (
          <m.div
            key="mini-journey"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="min-w-0 grow"
          >
            <JourneyStrip
              legs={itinerary.legs}
              colors={legLineColors(itinerary.legs)}
              compact
            />
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * The 56px resting bar: a one-line answer that rides the top of the sheet.
 * Tapping the line or the chevron toggles open/closed; in the empty state the
 * right slot is a one-tap location button instead of the chevron (sibling
 * buttons, never nested, so the markup stays valid).
 */
function AnswerBar({
  panel,
  minutes,
  stats,
  open,
  onToggle,
  onUseMyLocation,
}: {
  panel: PanelState
  minutes: number
  stats: ReachStats | null
  open: boolean
  onToggle: () => void
  onUseMyLocation: () => void
}) {
  return (
    <div
      className="relative w-full shrink-0"
      style={{ height: ANSWER_BAR_PX }}
    >
      <span className="absolute top-2 left-1/2 h-1 w-[38px] -translate-x-1/2 bg-ink-faint" />
      <div className="flex h-full items-center gap-3 px-5">
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? "Sakrij detalje dosega" : "Prikaži detalje dosega"}
          aria-expanded={open}
          className="flex min-w-0 grow items-center gap-3 self-stretch text-left transition-colors duration-150 active:bg-row-tint"
        >
          <div
            key={panel.mode}
            className="panel-swap flex min-w-0 grow items-center"
          >
            {panel.mode === "route" && !isRouteTooFar(panel.itinerary) ? (
              <MiniRoute itinerary={panel.itinerary} open={open} />
            ) : (
              <span className="min-w-0 truncate">
                <AnswerLine panel={panel} minutes={minutes} stats={stats} />
              </span>
            )}
          </div>
          {panel.mode !== "empty" && (
            <IconChevronTop
              size={16}
              aria-hidden
              className={`shrink-0 text-ink-faint transition-transform duration-200 ease-[var(--ease-out-strong)] ${
                open ? "rotate-180" : ""
              }`}
            />
          )}
        </button>
        {panel.mode === "empty" && (
          <button
            type="button"
            aria-label="Koristi moju lokaciju"
            onClick={onUseMyLocation}
            className="shrink-0 border border-hairline-strong p-2 transition-transform duration-150 ease-out active:scale-[0.97]"
          >
            <IconLocation size={16} className="text-zg-blue" />
          </button>
        )}
      </div>
    </div>
  )
}

export function MobileSheet(props: PanelContentProps) {
  const { panel, minutes, stats, onUseMyLocation } = props
  const [peekPx] = useState(peekSnap)
  const [snaps] = useState<(number | string)[]>(() => [peekPx, SNAP_OPEN])
  const [snap, setSnap] = useState<number | string | null>(peekPx)
  const mode = panel.mode
  const isRoute = mode === "route" || mode === "route-loading"
  // A route (journey strip) or an error (retry button) opens the sheet so its
  // key action clears the bar; a plain reach answer rides the bar at peek.
  const wantsOpen = isRoute || mode === "error"

  // Derived-state-during-render (not an effect): fires only on the transition,
  // so a user who drags the sheet back down afterwards is not overridden.
  const [prevWantsOpen, setPrevWantsOpen] = useState(wantsOpen)
  if (prevWantsOpen !== wantsOpen) {
    setPrevWantsOpen(wantsOpen)
    setSnap(wantsOpen ? SNAP_OPEN : peekPx)
  }

  const open = snap === SNAP_OPEN

  return (
    <Drawer.Root
      open
      modal={false}
      dismissible={false}
      snapPoints={snaps}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
    >
      <Drawer.Portal>
        <Drawer.Content
          aria-describedby={undefined}
          className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex h-full flex-col outline-none md:hidden"
        >
          <div className="pointer-events-auto mt-auto flex h-full flex-col bg-ground pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_30px_rgba(15,23,42,0.16)]">
            <Drawer.Title className="sr-only">Doseg</Drawer.Title>
            <AnswerBar
              panel={panel}
              minutes={minutes}
              stats={stats}
              open={open}
              onToggle={() => setSnap(open ? peekPx : SNAP_OPEN)}
              onUseMyLocation={onUseMyLocation}
            />
            <SheetBody {...props} open={open} />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
