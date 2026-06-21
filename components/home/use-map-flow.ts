"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"

import { isWalkMode, legLineColors } from "@/lib/mode-colors"
import {
  fetchExactRoute,
  fetchIsochrone,
  type IsochroneResponse,
} from "@/lib/otp"
import { decodePolyline } from "@/lib/polyline"
import {
  outerBand,
  outerRingsForApi,
  pointInReach,
  reachAreaKm2,
  type DistrictContext,
  type LatLon,
  type MapPoi,
  type PanelState,
  type Poi,
  type WalkAreaFeatureLike,
} from "./reach-state"
import type { ReachStats } from "./sidebar"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function pointKey(p: LatLon): string {
  return `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`
}

/** URL coordinates are rounded to 5 decimals — compare at that precision. */
function samePoint(a: LatLon, b: LatLon): boolean {
  return (
    a.lat.toFixed(5) === b.lat.toFixed(5) && a.lon.toFixed(5) === b.lon.toFixed(5)
  )
}

async function reverseName(p: LatLon): Promise<string | null> {
  try {
    const res = await fetch(`/api/reverse?lat=${p.lat}&lon=${p.lon}`)
    if (!res.ok) return null
    const data = (await res.json()) as { display_name?: string }
    return data.display_name ?? null
  } catch {
    return null
  }
}

/** Derived map data: GeoJSON for the map, POI counts, stats. */
function useReachDerived(
  panel: PanelState,
  iso: IsochroneResponse | null,
  minutes: number,
  districtCtx: DistrictContext | null,
  band: WalkAreaFeatureLike | null
) {
  const { data: pois } = useSWR<Poi[]>(
    "/api/poi?categories=hospital,school,park",
    fetcher
  )
  const { data: bajs } = useSWR<GeoJSON.FeatureCollection>("/api/bajs", fetcher)

  const walkFeatures = useMemo(
    () => (iso?.walkArea?.features ?? []) as unknown as WalkAreaFeatureLike[],
    [iso]
  )

  const walkAreaFC = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!walkFeatures.length) return null
    return {
      type: "FeatureCollection",
      features: walkFeatures.filter((f) => f.properties.time <= minutes * 60),
    } as unknown as GeoJSON.FeatureCollection
  }, [walkFeatures, minutes])

  const routeFC = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (panel.mode !== "route") return null
    const colors = legLineColors(panel.itinerary.legs)
    return {
      type: "FeatureCollection",
      features: panel.itinerary.legs.map((leg, i) => ({
        type: "Feature" as const,
        // mode keys the `/`-style layer filters; color carries the per-line
        // hue shared with the sidebar strip and leg list.
        properties: {
          mode: isWalkMode(leg.mode)
            ? "WALK"
            : leg.mode.toUpperCase() === "BICYCLE"
              ? "BIKE"
              : leg.mode.toUpperCase(),
          color: colors[i],
        },
        geometry: {
          type: "LineString" as const,
          coordinates:
            leg.legGeometry.coords ?? decodePolyline(leg.legGeometry.points),
        },
      })),
    }
  }, [panel])

  // POIs annotated against the reach — the map dims what's out of range,
  // and the sidebar counts derive from the same single point-in-polygon pass.
  const mapPois = useMemo<MapPoi[] | null>(() => {
    if (!Array.isArray(pois)) return null
    return pois.map((p) => ({
      ...p,
      inReach: band ? pointInReach(p, band) : null,
    }))
  }, [pois, band])

  const poiCounts = useMemo(() => {
    if (!band || !mapPois) return null
    const counts: Record<string, number> = {}
    for (const p of mapPois) {
      if (p.inReach) counts[p.category] = (counts[p.category] ?? 0) + 1
    }
    return counts
  }, [band, mapPois])

  const stats = useMemo<ReachStats | null>(() => {
    if (!band) return null
    const km2 = reachAreaKm2(band)
    return {
      km2,
      pctCity: districtCtx
        ? Math.round((km2 / districtCtx.cityAreaKm2) * 100)
        : null,
      districtsInReach: districtCtx?.districtsInReach ?? null,
      totalDistricts: districtCtx?.totalDistricts ?? null,
    }
  }, [band, districtCtx])

  return {
    band,
    walkAreaFC,
    routeFC,
    poiCounts,
    stats,
    pois: mapPois,
    bajs: bajs?.type === "FeatureCollection" ? bajs : null,
  }
}

/** District context follows the reach (origin + selected window). */
function useDistrictContext(
  origin: LatLon | null,
  band: WalkAreaFeatureLike | null,
  seqRef: React.MutableRefObject<number>
) {
  const [districtCtx, setDistrictCtx] = useState<DistrictContext | null>(null)
  useEffect(() => {
    if (!origin || !band) return
    const seq = seqRef.current
    const abort = new AbortController()
    fetch("/api/district-context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin, rings: outerRingsForApi(band) }),
      signal: abort.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((ctx: DistrictContext | null) => {
        if (ctx && seqRef.current === seq) setDistrictCtx(ctx)
      })
      .catch(() => {})
    return () => abort.abort()
  }, [origin, band, seqRef])
  return { districtCtx, setDistrictCtx }
}

export type FlowInitial = {
  origin?: LatLon
  dest?: LatLon
  time?: string | null
  bajs?: boolean
  minutes?: number
}

/** The panel state machine + fetch orchestration (spec §3). */
export function useMapFlow(initial?: FlowInitial) {
  const [panel, setPanel] = useState<PanelState>(() => {
    if (initial?.origin && initial.dest)
      return { mode: "route-loading", origin: initial.origin, dest: initial.dest }
    if (initial?.origin) return { mode: "loading", origin: initial.origin }
    return { mode: "empty" }
  })
  const [minutes, setMinutes] = useState(initial?.minutes ?? 30)
  const [iso, setIso] = useState<IsochroneResponse | null>(null)
  const [originName, setOriginName] = useState<string | null>(null)
  const [destName, setDestName] = useState<string | null>(null)
  const [departedAt, setDepartedAt] = useState<Date | null>(null)
  const [departTime, setDepartTime] = useState<string | null>(initial?.time ?? null)

  // Monotonic click counter — stale async results are dropped.
  const seqRef = useRef(0)
  // Reverse-geocode guards: a name applies only if its point is still current
  // (the global seq would drop names whenever any later action fires).
  const originKeyRef = useRef<string | null>(null)
  const destKeyRef = useRef<string | null>(null)
  const timeRef = useRef<string | null>(initial?.time ?? null)
  const bajsRef = useRef<boolean>(initial?.bajs ?? false)
  const isoAbortRef = useRef<AbortController | null>(null)
  const routeAbortRef = useRef<AbortController | null>(null)

  const origin = "origin" in panel ? panel.origin : null
  const dest = "dest" in panel ? panel.dest : null

  // The reach outline, computed once — shared by district context + stats.
  const band = useMemo(() => {
    const features = (iso?.walkArea?.features ??
      []) as unknown as WalkAreaFeatureLike[]
    return outerBand(features, minutes * 60)
  }, [iso, minutes])

  const { districtCtx, setDistrictCtx } = useDistrictContext(origin, band, seqRef)
  const derived = useReachDerived(panel, iso, minutes, districtCtx, band)

  const actions = useFlowActions({
    panel,
    band,
    origin,
    dest,
    originName,
    destName,
    seqRef,
    originKeyRef,
    destKeyRef,
    timeRef,
    bajsRef,
    isoAbortRef,
    routeAbortRef,
    setPanel,
    setIso,
    setOriginName,
    setDestName,
    setDistrictCtx,
    setDepartedAt,
    setDepartTime,
  })

  // URL-restored origin (+ optional dest): fetch reach/route + names (async
  // work only — the panel was already initialized above).
  const bootRef = useRef(false)
  useEffect(() => {
    if (bootRef.current || !initial?.origin) return
    bootRef.current = true
    const p = initial.origin
    if (initial.dest) {
      actions.beginRoute(p, initial.dest)
      return
    }
    const seq = ++seqRef.current
    const key = pointKey(p)
    originKeyRef.current = key
    reverseName(p).then((name) => {
      if (originKeyRef.current === key) setOriginName(name)
    })
    actions.loadIsochrone(p, seq).then((ok) => {
      if (ok) setPanel({ mode: "reach", origin: p })
      else if (seqRef.current === seq) setPanel({ mode: "error", origin: p })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot once
  }, [])

  return {
    panel,
    minutes,
    setMinutes,
    origin,
    dest,
    originName,
    destName,
    departedAt,
    departTime,
    districtCtx,
    ...derived,
    ...actions,
  }
}

type FlowDeps = {
  panel: PanelState
  band: WalkAreaFeatureLike | null
  origin: LatLon | null
  dest: LatLon | null
  originName: string | null
  destName: string | null
  seqRef: React.MutableRefObject<number>
  originKeyRef: React.MutableRefObject<string | null>
  destKeyRef: React.MutableRefObject<string | null>
  timeRef: React.MutableRefObject<string | null>
  bajsRef: React.MutableRefObject<boolean>
  isoAbortRef: React.MutableRefObject<AbortController | null>
  routeAbortRef: React.MutableRefObject<AbortController | null>
  setPanel: (p: PanelState) => void
  setIso: (i: IsochroneResponse | null) => void
  setOriginName: (n: string | null) => void
  setDestName: (n: string | null) => void
  setDistrictCtx: (c: DistrictContext | null) => void
  setDepartedAt: (d: Date | null) => void
  setDepartTime: (t: string | null) => void
}

function useOriginActions(deps: FlowDeps) {
  const {
    seqRef,
    originKeyRef,
    timeRef,
    bajsRef,
    isoAbortRef,
    setPanel,
    setIso,
    setOriginName,
    setDestName,
    setDistrictCtx,
  } = deps

  const loadIsochrone = useCallback(
    async (p: LatLon, seq: number) => {
      isoAbortRef.current?.abort()
      const abort = new AbortController()
      isoAbortRef.current = abort
      try {
        const res = await fetchIsochrone(
          {
            lat: p.lat,
            lon: p.lon,
            time: timeRef.current ?? undefined,
            bajs: bajsRef.current || undefined,
          },
          abort.signal
        )
        if (seqRef.current !== seq) return false
        setIso(res)
        return true
      } catch (err) {
        if ((err as Error).name !== "AbortError")
          console.error("isochrone failed", err)
        return false
      }
    },
    [isoAbortRef, seqRef, timeRef, bajsRef, setIso]
  )

  const startOrigin = useCallback(
    (p: LatLon, knownName?: string) => {
      const seq = ++seqRef.current
      setPanel({ mode: "loading", origin: p })
      setIso(null)
      setOriginName(knownName ?? null)
      setDestName(null)
      setDistrictCtx(null)
      const key = pointKey(p)
      originKeyRef.current = key
      if (!knownName) {
        reverseName(p).then((name) => {
          if (originKeyRef.current === key) setOriginName(name)
        })
      }
      loadIsochrone(p, seq).then((ok) => {
        if (ok) setPanel({ mode: "reach", origin: p })
        else if (seqRef.current === seq) setPanel({ mode: "error", origin: p })
      })
    },
    [loadIsochrone, seqRef, originKeyRef, setPanel, setIso, setOriginName, setDestName, setDistrictCtx]
  )

  return { loadIsochrone, startOrigin }
}

function dateAtTime(t: string): Date {
  const [h, m] = t.split(":").map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d
}

function useRouteActions(deps: FlowDeps) {
  const {
    seqRef,
    destKeyRef,
    timeRef,
    bajsRef,
    routeAbortRef,
    setPanel,
    setDestName,
    setDepartedAt,
  } = deps

  const startRoute = useCallback(
    (from: LatLon, to: LatLon, seq: number, knownName?: string) => {
      setDepartedAt(timeRef.current ? dateAtTime(timeRef.current) : new Date())
      routeAbortRef.current?.abort()
      const abort = new AbortController()
      routeAbortRef.current = abort
      const destKey = pointKey(to)
      destKeyRef.current = destKey
      if (knownName) {
        setDestName(knownName)
      } else {
        reverseName(to).then((name) => {
          if (destKeyRef.current === destKey) setDestName(name)
        })
      }
      fetchExactRoute(
        {
          originLat: from.lat,
          originLon: from.lon,
          destLat: to.lat,
          destLon: to.lon,
          time: timeRef.current ?? undefined,
          bajs: bajsRef.current || undefined,
        },
        abort.signal
      )
        .then((itinerary) => {
          if (seqRef.current !== seq) return
          setPanel({ mode: "route", origin: from, dest: to, itinerary })
        })
        .catch((err: unknown) => {
          if ((err as Error).name === "AbortError") return
          console.error("route failed", err)
          if (seqRef.current === seq) setPanel({ mode: "reach", origin: from })
        })
    },
    [routeAbortRef, seqRef, destKeyRef, timeRef, bajsRef, setPanel, setDestName, setDepartedAt]
  )

  return { startRoute }
}

/** Destination chosen from the search field (acts like a map click). */
function useStartDest(
  deps: FlowDeps,
  startRoute: (from: LatLon, to: LatLon, seq: number, knownName?: string) => void
) {
  const { origin, seqRef, setPanel, setDestName } = deps
  return useCallback(
    (p: LatLon, label?: string) => {
      if (!origin) return
      const seq = ++seqRef.current
      setDestName(label ?? null)
      setPanel({ mode: "route-loading", origin, dest: p })
      startRoute(origin, p, seq, label)
    },
    [origin, seqRef, setPanel, setDestName, startRoute]
  )
}

/** Re-run the isochrone (and route) for the current origin/dest — used when
 * a fetch-affecting setting (departure time, BAJS) changes. */
function useRefetchForSettings(
  deps: FlowDeps,
  loadIsochrone: (p: LatLon, seq: number) => Promise<boolean>,
  startRoute: (from: LatLon, to: LatLon, seq: number, knownName?: string) => void
) {
  const { panel, origin, dest, destName, seqRef, setPanel } = deps
  return useCallback(() => {
    if (!origin) return
    const seq = ++seqRef.current
    const isRoute = panel.mode === "route" || panel.mode === "route-loading"
    if (isRoute && dest) {
      setPanel({ mode: "route-loading", origin, dest })
      loadIsochrone(origin, seq)
      startRoute(origin, dest, seq, destName ?? undefined)
    } else {
      setPanel({ mode: "loading", origin })
      loadIsochrone(origin, seq).then((ok) => {
        if (ok) setPanel({ mode: "reach", origin })
        else if (seqRef.current === seq) setPanel({ mode: "error", origin })
      })
    }
  }, [panel.mode, origin, dest, destName, seqRef, setPanel, loadIsochrone, startRoute])
}

/** Fetch-affecting settings (departure time, BAJS) — change + refetch. */
function useSettingsActions(deps: FlowDeps, refetch: () => void) {
  const { timeRef, bajsRef, setDepartTime } = deps
  const setDepartureTime = useCallback(
    (t: string | null) => {
      timeRef.current = t
      setDepartTime(t)
      refetch()
    },
    [timeRef, setDepartTime, refetch]
  )

  const setBajsRouting = useCallback(
    (enabled: boolean) => {
      if (bajsRef.current === enabled) return
      bajsRef.current = enabled
      refetch()
    },
    [bajsRef, refetch]
  )

  return { setDepartureTime, setBajsRouting }
}

/** ⇅ in route mode — swap origin/dest and re-run reach + route. */
function useSwapAction(
  deps: FlowDeps,
  loadIsochrone: (p: LatLon, seq: number) => Promise<boolean>,
  startRoute: (from: LatLon, to: LatLon, seq: number, knownName?: string) => void
) {
  const { panel, originName, destName, seqRef, originKeyRef, setPanel, setOriginName, setDestName } = deps
  return useCallback(() => {
    if (panel.mode !== "route" && panel.mode !== "route-loading") return
    const from = panel.dest
    const to = panel.origin
    const seq = ++seqRef.current
    setPanel({ mode: "route-loading", origin: from, dest: to })
    setOriginName(destName)
    setDestName(originName)
    const fromKey = pointKey(from)
    originKeyRef.current = fromKey
    if (!destName) {
      // The swapped-in origin never got a name (race) — backfill it.
      reverseName(from).then((name) => {
        if (originKeyRef.current === fromKey) setOriginName(name)
      })
    }
    loadIsochrone(from, seq)
    startRoute(from, to, seq, originName ?? undefined)
  }, [panel, originName, destName, seqRef, originKeyRef, setPanel, setOriginName, setDestName, loadIsochrone, startRoute])
}

/** Start a route from a clean slate (origin + dest both new): reset names,
 * fetch the origin's reach + name, and route. Shared by the URL boot and a
 * back/forward restore that lands on a brand-new origin+dest pair. */
function useBeginRoute(
  deps: FlowDeps,
  loadIsochrone: (p: LatLon, seq: number) => Promise<boolean>,
  startRoute: (from: LatLon, to: LatLon, seq: number, knownName?: string) => void
) {
  const { seqRef, originKeyRef, setPanel, setOriginName, setDestName } = deps
  return useCallback(
    (from: LatLon, to: LatLon) => {
      const seq = ++seqRef.current
      setPanel({ mode: "route-loading", origin: from, dest: to })
      setOriginName(null)
      setDestName(null)
      const key = pointKey(from)
      originKeyRef.current = key
      reverseName(from).then((name) => {
        if (originKeyRef.current === key) setOriginName(name)
      })
      loadIsochrone(from, seq)
      startRoute(from, to, seq)
    },
    [seqRef, originKeyRef, setPanel, setOriginName, setDestName, loadIsochrone, startRoute]
  )
}

/** Browser back/forward: settle the flow onto the origin/dest a history
 * entry describes. Unchanged points keep their state (no refetch); only
 * the parts that differ re-run. */
function useHistoryRestore(
  deps: FlowDeps,
  actions: {
    reset: () => void
    startOrigin: (p: LatLon, knownName?: string) => void
    startDest: (p: LatLon, label?: string) => void
    handleBackToReach: () => void
    beginRoute: (from: LatLon, to: LatLon) => void
  }
) {
  const { panel, origin, dest } = deps
  const { reset, startOrigin, startDest, handleBackToReach, beginRoute } = actions
  return useCallback(
    (o: LatLon | null, d: LatLon | null) => {
      if (!o) {
        if (panel.mode !== "empty") reset()
        return
      }
      const sameOrigin = origin != null && samePoint(origin, o)
      if (!d) {
        if (!sameOrigin) {
          startOrigin(o)
        } else if (panel.mode === "route" || panel.mode === "route-loading") {
          handleBackToReach()
        }
        return
      }
      const sameDest = dest != null && samePoint(dest, d)
      if (sameOrigin && sameDest) return
      if (sameOrigin) startDest(d)
      else beginRoute(o, d) // brand-new origin + dest
    },
    [panel.mode, origin, dest, reset, startOrigin, startDest, handleBackToReach, beginRoute]
  )
}

function useFlowActions(deps: FlowDeps) {
  const {
    panel,
    origin,
    seqRef,
    originKeyRef,
    destKeyRef,
    isoAbortRef,
    routeAbortRef,
    setPanel,
    setIso,
    setOriginName,
    setDestName,
    setDistrictCtx,
  } = deps
  const { loadIsochrone, startOrigin } = useOriginActions(deps)
  const { startRoute } = useRouteActions(deps)
  const startDest = useStartDest(deps, startRoute)
  const refetchForSettings = useRefetchForSettings(deps, loadIsochrone, startRoute)
  const { setDepartureTime, setBajsRouting } = useSettingsActions(
    deps,
    refetchForSettings
  )

  // Once an origin exists, every click is a destination — the reach is a
  // visualization, not a wall; routing works beyond it too. A new origin
  // comes from the search field, never from a silent map-click reset.
  const handleMapClick = useCallback(
    (p: LatLon) => {
      if (origin == null || panel.mode === "empty" || panel.mode === "loading") {
        startOrigin(p)
        return
      }
      const seq = ++seqRef.current
      setDestName(null)
      setPanel({ mode: "route-loading", origin, dest: p })
      startRoute(origin, p, seq)
    },
    [origin, panel.mode, seqRef, setPanel, setDestName, startOrigin, startRoute]
  )

  // × on the origin row — back to the empty state; next map click re-origins.
  const reset = useCallback(() => {
    seqRef.current++
    originKeyRef.current = null
    destKeyRef.current = null
    isoAbortRef.current?.abort()
    routeAbortRef.current?.abort()
    setPanel({ mode: "empty" })
    setIso(null)
    setOriginName(null)
    setDestName(null)
    setDistrictCtx(null)
  }, [seqRef, originKeyRef, destKeyRef, isoAbortRef, routeAbortRef, setPanel, setIso, setOriginName, setDestName, setDistrictCtx])

  const handleBackToReach = useCallback(() => {
    if (!origin) return
    routeAbortRef.current?.abort()
    seqRef.current++
    setPanel({ mode: "reach", origin })
    setDestName(null)
  }, [origin, routeAbortRef, seqRef, setPanel, setDestName])

  const handleSwap = useSwapAction(deps, loadIsochrone, startRoute)
  const beginRoute = useBeginRoute(deps, loadIsochrone, startRoute)

  const applyHistoryState = useHistoryRestore(deps, {
    reset,
    startOrigin,
    startDest,
    handleBackToReach,
    beginRoute,
  })

  return {
    handleMapClick,
    handleBackToReach,
    handleSwap,
    applyHistoryState,
    beginRoute,
    startOrigin,
    startDest,
    startRoute,
    setDepartureTime,
    setBajsRouting,
    loadIsochrone,
    reset,
    /** Re-run the current fetch — the "pokušaj ponovno" action in error mode. */
    retry: refetchForSettings,
  }
}
