"use client"

import { Suspense, useEffect, useState } from "react"
import dynamic from "next/dynamic"
import {
  parseAsFloat,
  parseAsString,
  useQueryStates,
} from "nuqs"
import { NuqsAdapter } from "nuqs/adapters/next/app"

import { AlertsBanner } from "@/components/alerts-banner"
import { DEFAULT_LAYERS, LayersControl, type LayersState } from "./layers-panel"
import { MobileSheet } from "./mobile-sheet"
import { OnboardingDialog } from "./onboarding-dialog"
import { PolazakControl } from "./polazak-control"
import { SearchFields, type SearchFieldsProps } from "./search-fields"
import { Sidebar } from "./sidebar"
import { useMapFlow, type FlowInitial } from "./use-map-flow"

const MapCanvas = dynamic(
  () => import("./map-canvas").then((m) => m.MapCanvas),
  { ssr: false }
)

const ONBOARDING_KEY = "doseg-onboarded"

/** Shareable params — same names the old homepage used (lat, lon, t, bajs). */
const URL_PARAMS = {
  lat: parseAsFloat,
  lon: parseAsFloat,
  t: parseAsString,
  bajs: parseAsString,
}

function toFlowInitial(q: {
  lat: number | null
  lon: number | null
  t: string | null
  bajs: string | null
}): FlowInitial {
  return {
    origin:
      q.lat != null && q.lon != null ? { lat: q.lat, lon: q.lon } : undefined,
    time: q.t && /^\d{1,2}:\d{2}$/.test(q.t) ? q.t : null,
    bajs: q.bajs === "1",
  }
}

type LayersProps = React.ComponentProps<typeof LayersControl>

/** Alerts + desktop controls + mobile search bar/layers icon over the map. */
function MapChrome({
  searchProps,
  layersProps,
  departTime,
  onTimeChange,
}: {
  searchProps: SearchFieldsProps
  layersProps: LayersProps
  departTime: string | null
  onTimeChange: (t: string | null) => void
}) {
  return (
    <>
      {/* ZET service alerts — top-center over the map */}
      <div className="pointer-events-none absolute inset-x-3.5 top-[122px] z-20 flex justify-center md:inset-x-0 md:top-3 md:px-3">
        <AlertsBanner />
      </div>

      {/* Desktop: top-right control group */}
      <div className="absolute top-6 right-6 z-20 hidden items-start gap-2.5 md:flex">
        <PolazakControl departTime={departTime} onChange={onTimeChange} />
        <LayersControl {...layersProps} />
      </div>

      {/* Mobile: top search bar + layers icon (spec §9 — search is a top bar) */}
      <div className="absolute inset-x-3.5 top-4 z-30 bg-ground shadow-map md:hidden">
        <SearchFields {...searchProps} />
      </div>
      <div className="absolute top-[114px] right-3.5 z-20 md:hidden">
        <LayersControl {...layersProps} variant="icon" />
      </div>
    </>
  )
}

/** Pulsing "klikni kartu" marker, centered on the visible map (next to the sidebar). */
function RadarPulse() {
  return (
    <div
      aria-hidden
      className="radar pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 md:left-[calc(50%+190px)]"
    >
      <span className="radar-ring" />
      <span className="radar-ring" />
      <span className="radar-dot" />
    </div>
  )
}

export function Client() {
  return (
    <NuqsAdapter>
      {/* useQueryStates reads useSearchParams — needs Suspense to prerender */}
      <Suspense>
        <ClientInner />
      </Suspense>
    </NuqsAdapter>
  )
}

function ClientInner() {
  const [urlState, setUrlState] = useQueryStates(URL_PARAMS)
  const [initial] = useState(() => toFlowInitial(urlState))
  const [onboardingOpen, setOnboardingOpen] = useState(
    () =>
      typeof window !== "undefined" &&
      !localStorage.getItem(ONBOARDING_KEY) &&
      !initial.origin
  )
  const [layers, setLayers] = useState<LayersState>(() => ({
    ...DEFAULT_LAYERS,
    bajs: initial.bajs ?? false,
  }))
  const flow = useMapFlow(initial)

  // Keep the URL shareable (and the OG image location-aware).
  const { origin, departTime } = flow
  useEffect(() => {
    setUrlState({
      lat: origin ? Number(origin.lat.toFixed(5)) : null,
      lon: origin ? Number(origin.lon.toFixed(5)) : null,
      t: departTime,
      bajs: layers.bajs ? "1" : null,
    })
  }, [origin, departTime, layers.bajs, setUrlState])

  const closeOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, "1")
    setOnboardingOpen(false)
  }

  const handleLayersChange = (next: LayersState) => {
    setLayers(next)
    flow.setBajsRouting(next.bajs)
  }

  const searchProps: SearchFieldsProps = {
    hasOrigin: flow.panel.mode !== "empty",
    originName: flow.originName,
    destName: flow.destName,
    showSwap: flow.panel.mode === "route",
    onSelectOrigin: flow.startOrigin,
    onSelectDest: flow.startDest,
    onSwap: flow.handleSwap,
    onClearOrigin: flow.reset,
  }

  const layersProps = {
    layers,
    onChange: handleLayersChange,
    km2: flow.stats?.km2 ?? null,
    poiCounts: flow.poiCounts,
    bajsCount: flow.bajs?.features.length ?? null,
  }

  // Shared by the desktop sidebar and the mobile sheet.
  const panelProps = {
    panel: flow.panel,
    minutes: flow.minutes,
    onMinutesChange: flow.setMinutes,
    stats: flow.stats,
    poiCounts: flow.poiCounts,
    districtCtx: flow.districtCtx,
    departedAt: flow.departedAt,
    onBackToReach: flow.handleBackToReach,
    onRetry: flow.retry,
  }

  return (
    <main id="main-content" className="relative h-dvh overflow-hidden">
      <h1 className="sr-only">Doseg — karta dosega javnog prijevoza</h1>
      <nav aria-label="Navigacija" className="sr-only">
        <a href="/o-projektu">O projektu</a>
        <a href="/statistika">Statistika</a>
      </nav>
      <MapCanvas
        walkArea={flow.walkAreaFC}
        route={flow.routeFC}
        origin={flow.origin}
        dest={flow.dest}
        layers={layers}
        pois={flow.pois}
        bajs={flow.bajs}
        onMapClick={flow.handleMapClick}
      />
      {flow.panel.mode === "empty" && <RadarPulse />}

      <MapChrome
        searchProps={searchProps}
        layersProps={layersProps}
        departTime={flow.departTime}
        onTimeChange={flow.setDepartureTime}
      />

      <Sidebar {...panelProps} search={searchProps} />
      {/* Mounted after onboarding — an open vaul drawer aria-hides the dialog. */}
      {!onboardingOpen && <MobileSheet {...panelProps} />}
      <OnboardingDialog open={onboardingOpen} onClose={closeOnboarding} />
    </main>
  )
}
