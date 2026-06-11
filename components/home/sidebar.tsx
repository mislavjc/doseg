"use client"

import {
  ErrorContent,
  LjestvicaBlock,
  LoadingContent,
  ReachContent,
  RouteContent,
  type ReachStats,
} from "./panel-content"
import { type DistrictContext, type PanelState } from "./reach-state"
import { SearchFields, type SearchFieldsProps } from "./search-fields"
import { ReachIllustration, RouteIllustration } from "./step-illustrations"
import { BlueAction, Eyebrow, NumberedStep } from "./ui"

export type { ReachStats }

function EmptyContent() {
  return (
    <>
      <h2 className="font-heros text-head font-bold text-ink">
        Koliko grada ti je nadohvat za pola sata?
      </h2>
      <div className="flex flex-col gap-[9px]">
        <div className="relative h-[118px] w-full overflow-hidden bg-surface-blue">
          <ReachIllustration />
        </div>
        <NumberedStep
          n="1"
          title="Klikni bilo gdje na karti"
          sub="obojano područje je sve što stigneš za 30 min"
        />
      </div>
      <div className="flex flex-col gap-[9px]">
        <div className="relative h-[118px] w-full overflow-hidden bg-surface-blue">
          <RouteIllustration />
        </div>
        <NumberedStep
          n="2"
          title="Klikni odredište unutar dosega"
          sub="dobiješ rutu — tramvaj, bus, vlak"
        />
      </div>
    </>
  )
}

export function Sidebar({
  panel,
  search,
  minutes,
  onMinutesChange,
  stats,
  poiCounts,
  districtCtx,
  departedAt,
  onBackToReach,
  onRetry,
}: {
  panel: PanelState
  search: SearchFieldsProps
  minutes: number
  onMinutesChange: (m: number) => void
  stats: ReachStats | null
  poiCounts: Record<string, number> | null
  districtCtx: DistrictContext | null
  departedAt: Date | null
  onBackToReach: () => void
  onRetry: () => void
}) {
  const mode = panel.mode
  const isRoute = mode === "route" || mode === "route-loading"

  return (
    <aside className="absolute inset-y-0 left-0 z-20 hidden w-[380px] flex-col gap-[18px] overflow-hidden border-r border-hairline-strong bg-ground px-[22px] py-[26px] shadow-panel md:flex">
      <Eyebrow>{isRoute ? "ruta · zagreb" : "doseg · zagreb"}</Eyebrow>

      <SearchFields {...search} />

      {/* keyed by mode → enter cross-fade on every state change (spec §10) */}
      <div
        key={mode}
        className="panel-swap flex min-h-0 grow flex-col gap-[18px]"
      >
        {isRoute ? (
          <RouteContent
            itinerary={mode === "route" ? panel.itinerary : null}
            departedAt={departedAt}
            loading={mode === "route-loading"}
          />
        ) : (
          /* header + footer stay pinned; this middle region scrolls */
          <div className="scroll-fade flex min-h-0 grow flex-col gap-[18px] overflow-y-auto">
            {mode === "empty" && <EmptyContent />}
            {mode === "loading" && <LoadingContent />}
            {mode === "error" && <ErrorContent onRetry={onRetry} />}
            {mode === "reach" && (
              <ReachContent
                minutes={minutes}
                onMinutesChange={onMinutesChange}
                stats={stats}
                poiCounts={poiCounts}
              />
            )}
          </div>
        )}

        {isRoute ? (
          <BlueAction onClick={onBackToReach} className="mt-auto shrink-0 self-start">
            ← Natrag na doseg
          </BlueAction>
        ) : (
          <LjestvicaBlock ctx={mode === "empty" ? null : districtCtx} />
        )}
      </div>
    </aside>
  )
}
