"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import {
  parseAsFloat,
  parseAsInteger,
  parseAsString,
  useQueryStates,
} from "nuqs"
import { NuqsAdapter } from "nuqs/adapters/next/app"

import { DEFAULT_LAYERS, LayersControl, type LayersState } from "./layers-panel"
import { SiteNav } from "@/app/statistika/editorial/site-nav"
import { MobileSheet } from "./mobile-sheet"
import { PolazakControl } from "./polazak-control"
import { requestMyLocation } from "./reach-state"
import { SearchFields, type SearchFieldsProps } from "./search-fields"
import { Sidebar } from "./sidebar"
import { useMapFlow, type FlowInitial } from "./use-map-flow"

const MapCanvas = dynamic(
  () => import("./map-canvas").then((m) => m.MapCanvas),
  { ssr: false }
)

/** Shareable params — lat/lon (+ dlat/dlon route dest), t (departure),
 * bajs, m (15/30 reach window), poi (enabled category layers). */
const URL_PARAMS = {
  lat: parseAsFloat,
  lon: parseAsFloat,
  dlat: parseAsFloat,
  dlon: parseAsFloat,
  t: parseAsString,
  bajs: parseAsString,
  m: parseAsInteger,
  poi: parseAsString,
}

type UrlState = {
  lat: number | null
  lon: number | null
  dlat: number | null
  dlon: number | null
  t: string | null
  bajs: string | null
  m: number | null
  poi: string | null
}

function toFlowInitial(q: UrlState): FlowInitial {
  const origin =
    q.lat != null && q.lon != null ? { lat: q.lat, lon: q.lon } : undefined
  return {
    origin,
    dest:
      origin && q.dlat != null && q.dlon != null
        ? { lat: q.dlat, lon: q.dlon }
        : undefined,
    time: q.t && /^\d{1,2}:\d{2}$/.test(q.t) ? q.t : null,
    bajs: q.bajs === "1",
    minutes: q.m === 15 || q.m === 30 ? q.m : undefined,
  }
}

/** POI layer record ↔ the `poi` CSV param (enabled categories only). */
function poiLayersFromParam(poi: string | null): LayersState["poi"] {
  const on = new Set((poi ?? "").split(",").filter(Boolean))
  return {
    hospital: on.has("hospital"),
    school: on.has("school"),
    park: on.has("park"),
  }
}

function poiParamFromLayers(poi: LayersState["poi"]): string | null {
  const on = Object.entries(poi)
    .filter(([, v]) => v)
    .map(([k]) => k)
  return on.length ? on.join(",") : null
}


/** Read a coordinate pair straight out of a query string. */
function pointFromSearch(
  sp: URLSearchParams,
  latKey: string,
  lonKey: string
): { lat: number; lon: number } | null {
  const lat = Number(sp.get(latKey))
  const lon = Number(sp.get(lonKey))
  if (!sp.has(latKey) || !sp.has(lonKey)) return null
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null
  return { lat, lon }
}

/** URL ↔ flow sync. Origin/dest changes push history entries (Back undoes
 * steps instead of leaving the site); settings (t, bajs) replace in place.
 * Back/forward reads window.location inside the popstate handler directly —
 * urlState lags the flow during our own writes, so it can't be trusted to
 * tell foreign changes apart. */
function useUrlFlowSync(
  flow: ReturnType<typeof useMapFlow>,
  layers: LayersState,
  setUrlState: (
    values: Partial<UrlState>,
    options?: { history?: "push" | "replace" }
  ) => void
) {
  const { origin, dest, departTime, minutes, applyHistoryState } = flow
  useEffect(() => {
    const next = {
      lat: origin ? Number(origin.lat.toFixed(5)) : null,
      lon: origin ? Number(origin.lon.toFixed(5)) : null,
      dlat: dest ? Number(dest.lat.toFixed(5)) : null,
      dlon: dest ? Number(dest.lon.toFixed(5)) : null,
    }
    // A history restore echoes back through the flow — if the URL already
    // says this, pushing again would mint duplicate entries.
    const sp = new URLSearchParams(window.location.search)
    const sameAsUrl = (["lat", "lon", "dlat", "dlon"] as const).every((k) => {
      const v = sp.get(k)
      return (v == null ? null : Number(v)) === next[k]
    })
    if (sameAsUrl) return
    setUrlState(next, { history: "push" })
  }, [origin, dest, setUrlState])
  // Settings replace in place (no history spam from a slider or a toggle).
  const poiParam = poiParamFromLayers(layers.poi)
  useEffect(() => {
    setUrlState({
      t: departTime,
      bajs: layers.bajs ? "1" : null,
      m: minutes === 30 ? null : minutes, // 30 is the default — omit
      poi: poiParam,
    })
  }, [departTime, minutes, layers.bajs, poiParam, setUrlState])

  const applyRef = useRef(applyHistoryState)
  useEffect(() => {
    applyRef.current = applyHistoryState
  }, [applyHistoryState])
  useEffect(() => {
    const onPop = () => {
      const sp = new URLSearchParams(window.location.search)
      applyRef.current(
        pointFromSearch(sp, "lat", "lon"),
        pointFromSearch(sp, "dlat", "dlon")
      )
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])
}

/** Search field props derived from the flow (origin/dest state + actions). */
function searchPropsFor(
  flow: ReturnType<typeof useMapFlow>
): SearchFieldsProps {
  const isRoute =
    flow.panel.mode === "route" || flow.panel.mode === "route-loading"
  return {
    hasOrigin: flow.panel.mode !== "empty",
    hasDest: isRoute,
    originName: flow.originName,
    destName: flow.destName,
    showSwap: flow.panel.mode === "route",
    onSelectOrigin: flow.startOrigin,
    onSelectDest: flow.startDest,
    onSwap: flow.handleSwap,
    onClearOrigin: flow.reset,
    onClearDest: flow.handleBackToReach,
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
      {/* Desktop: site nav floating in the top strip, clear of the sidebar;
          height-matched to the polazak/slojevi tiles (h-[38px]). Fixed width
          with breathing room so the links never spill past the bar. */}
      <div className="absolute top-6 left-[404px] z-20 hidden md:block">
        <SiteNav
          active="karta"
          className="h-[38px] w-[636px] max-w-none py-0 shadow-map"
        />
      </div>

      {/* Desktop: top-right control group */}
      <div className="absolute top-6 right-6 z-20 hidden items-start gap-2.5 md:flex">
        <PolazakControl departTime={departTime} onChange={onTimeChange} />
        <LayersControl {...layersProps} />
      </div>

      {/* Mobile: top search bar + polazak/layers controls (spec §9) */}
      <div className="absolute inset-x-3.5 top-4 z-30 bg-ground shadow-map md:hidden">
        <SearchFields {...searchProps} />
      </div>
      <div className="absolute top-[114px] right-3.5 z-20 flex items-start gap-2 md:hidden">
        <PolazakControl departTime={departTime} onChange={onTimeChange} compact />
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
  const [layers, setLayers] = useState<LayersState>(() => ({
    ...DEFAULT_LAYERS,
    bajs: initial.bajs ?? false,
    poi: poiLayersFromParam(urlState.poi),
  }))
  const flow = useMapFlow(initial)

  useUrlFlowSync(flow, layers, setUrlState)

  const handleLayersChange = (next: LayersState) => {
    setLayers(next)
    flow.setBajsRouting(next.bajs)
  }

  // Sidebar/sheet POI count rows double as map-layer toggles (#7).
  const togglePoi = (key: string) =>
    handleLayersChange({
      ...layers,
      poi: { ...layers.poi, [key]: !layers.poi[key as keyof LayersState["poi"]] },
    })

  const searchProps = searchPropsFor(flow)

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
    poiLayers: layers.poi,
    onTogglePoi: togglePoi,
    districtCtx: flow.districtCtx,
    departedAt: flow.departedAt,
    onBackToReach: flow.handleBackToReach,
    onRetry: flow.retry,
    onUseMyLocation: () => requestMyLocation(flow.startOrigin),
  }

  return (
    <main id="main-content" className="relative h-dvh overflow-hidden">
      <h1 className="sr-only">Doseg — karta dosega javnog prijevoza</h1>
      <nav aria-label="Navigacija" className="sr-only">
        <Link href="/linije">Sve ZET linije: vozni red i stanice</Link>
        <Link href="/statistika">Statistika dostupnosti javnog prijevoza</Link>
        <Link href="/promjene">Promjene i izmjene ZET linija</Link>
        <Link href="/o-projektu">O projektu</Link>
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
        onPoiPick={(p, name) =>
          flow.origin ? flow.startDest(p, name) : flow.startOrigin(p, name)
        }
      />
      {flow.panel.mode === "empty" && <RadarPulse />}

      <MapChrome
        searchProps={searchProps}
        layersProps={layersProps}
        departTime={flow.departTime}
        onTimeChange={flow.setDepartureTime}
      />

      <Sidebar {...panelProps} search={searchProps} />
      <MobileSheet {...panelProps} />
    </main>
  )
}
