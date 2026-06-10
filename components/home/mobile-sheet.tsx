"use client"

import { useState } from "react"
import { Drawer } from "vaul"

import { legLineColors } from "@/lib/mode-colors"
import type { Itinerary } from "@/lib/otp"
import {
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
  type ReachStats,
} from "./panel-content"
import type { DistrictContext, PanelState } from "./reach-state"
import { BlueAction, Eyebrow, ReachRamp } from "./ui"

/**
 * Mobile bottom sheet (spec §9): peek (summary only) · half (readout/route
 * glance) · full (everything, scrollable). Same blocks as the desktop sidebar.
 */

const SNAP_PEEK = "158px"
const SNAP_HALF = 0.52
/** Full stops short of the top search bar (2 rows + margin ≈ 132px). */
function fullSnap(): number {
  const vh = typeof window === "undefined" ? 800 : window.innerHeight
  return Math.min(0.88, 1 - 132 / vh)
}

/** Estimated leg-list overflow at the half snap — drives the "povuci" hint. */
function legsOverflowAtHalf(itinerary: Itinerary): boolean {
  const vh = typeof window === "undefined" ? 800 : window.innerHeight
  const chromeAboveLegs = 175 // handle + summary + strip + action row + gaps
  const legRow = 62
  return itinerary.legs.length * legRow > SNAP_HALF * vh - chromeAboveLegs
}

function EmptyPeek() {
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
      <ReachRamp rightLabel="30 min daleko" />
    </>
  )
}

function RouteSheetContent({
  itinerary,
  departedAt,
  peek,
  full,
  onBackToReach,
}: {
  itinerary: Itinerary
  departedAt: Date | null
  peek: boolean
  full: boolean
  onBackToReach: () => void
}) {
  if (isRouteTooFar(itinerary)) {
    return (
      <>
        <RouteTooFar />
        {!peek && (
          <BlueAction onClick={onBackToReach} className="self-start">
            ← Natrag na doseg
          </BlueAction>
        )}
      </>
    )
  }
  const showMore = !full && legsOverflowAtHalf(itinerary)
  const colors = legLineColors(itinerary.legs)
  return (
    <>
      <RouteSummary itinerary={itinerary} departedAt={departedAt} />
      <JourneyStrip legs={itinerary.legs} colors={colors} />
      {!peek && (
        <>
          <div className="flex items-center justify-between">
            <BlueAction onClick={onBackToReach}>← Natrag na doseg</BlueAction>
            {showMore && (
              <span className="font-mono text-label text-ink-faint">
                povuci za sve korake ↑
              </span>
            )}
          </div>
          <LegList itinerary={itinerary} colors={colors} />
        </>
      )}
    </>
  )
}

function SheetBody({
  panel,
  minutes,
  onMinutesChange,
  stats,
  poiCounts,
  districtCtx,
  departedAt,
  onBackToReach,
  peek,
  full,
}: {
  panel: PanelState
  minutes: number
  onMinutesChange: (m: number) => void
  stats: ReachStats | null
  poiCounts: Record<string, number> | null
  districtCtx: DistrictContext | null
  departedAt: Date | null
  onBackToReach: () => void
  peek: boolean
  full: boolean
}) {
  const mode = panel.mode
  return (
    <div
      className={`flex min-h-0 flex-1 flex-col px-5 pb-6 ${
        full ? "scroll-fade overflow-y-auto" : "overflow-hidden"
      }`}
    >
      {/* keyed by mode → enter cross-fade on state change (spec §10) */}
      <div key={mode} className="panel-swap flex min-h-0 flex-col gap-[14px]">
        {mode === "empty" && <EmptyPeek />}
        {mode === "loading" && <LoadingContent />}
        {mode === "reach" && (
          <>
            <ReachReadout minutes={minutes} stats={stats} />
            <ReachRamp rightLabel={`${minutes} min daleko`} />
            <MinutesRow minutes={minutes} onChange={onMinutesChange} />
            <PoiList poiCounts={poiCounts} />
            <LjestvicaRow ctx={districtCtx} />
          </>
        )}
        {mode === "route-loading" && <RouteSkeleton />}
        {mode === "route" && (
          <RouteSheetContent
            itinerary={panel.itinerary}
            departedAt={departedAt}
            peek={peek}
            full={full}
            onBackToReach={onBackToReach}
          />
        )}
      </div>
    </div>
  )
}

export function MobileSheet({
  panel,
  minutes,
  onMinutesChange,
  stats,
  poiCounts,
  districtCtx,
  departedAt,
  onBackToReach,
}: {
  panel: PanelState
  minutes: number
  onMinutesChange: (m: number) => void
  stats: ReachStats | null
  poiCounts: Record<string, number> | null
  districtCtx: DistrictContext | null
  departedAt: Date | null
  onBackToReach: () => void
}) {
  const [snaps] = useState<(number | string)[]>(() => [
    SNAP_PEEK,
    SNAP_HALF,
    fullSnap(),
  ])
  const [snap, setSnap] = useState<number | string | null>(SNAP_PEEK)
  const mode = panel.mode
  const isRoute = mode === "route" || mode === "route-loading"

  // Route opens at half so the journey strip shows; otherwise peek.
  // (Derived-state-during-render pattern — not an effect.)
  const [prevIsRoute, setPrevIsRoute] = useState(isRoute)
  if (prevIsRoute !== isRoute) {
    setPrevIsRoute(isRoute)
    setSnap(isRoute ? SNAP_HALF : SNAP_PEEK)
  }

  const peek = snap === SNAP_PEEK
  const full = snap === snaps[2]

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
          <div className="pointer-events-auto mt-auto flex h-full flex-col rounded-t-[18px] bg-ground shadow-[0_-6px_30px_rgba(15,23,42,0.16)]">
            <Drawer.Title className="sr-only">Doseg</Drawer.Title>
            <button
              type="button"
              aria-label="Povuci ili dodirni za više"
              onClick={() =>
                setSnap(snap === SNAP_PEEK ? SNAP_HALF : SNAP_PEEK)
              }
              className="flex w-full shrink-0 justify-center pt-3 pb-2"
            >
              <span className="h-1 w-[38px] rounded-[2px] bg-ink-faint/40" />
            </button>
            <SheetBody
              panel={panel}
              minutes={minutes}
              onMinutesChange={onMinutesChange}
              stats={stats}
              poiCounts={poiCounts}
              districtCtx={districtCtx}
              departedAt={departedAt}
              onBackToReach={onBackToReach}
              peek={peek}
              full={full}
            />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
