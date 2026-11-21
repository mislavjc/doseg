import type { BajsData } from "./bajs"
import { getBajsData } from "./bajs"
import { getRealtimeData } from "./gtfs-rt"
import type { TripRT } from "./gtfs-rt"
import { computeTravelTimes, getGraph } from "./transit-graph"
import type { Predecessor, TransitGraph } from "./transit-graph"
import { engineServiceDate } from "./zagreb-time"

export interface ReachabilityState {
  key: string
  originLat: number
  originLon: number
  departureTime: number
  useBajs: boolean
  graph: TransitGraph
  rtData: Map<string, TripRT>
  bajsData: BajsData | null
  travelTimes: Map<string, number>
  preds: Map<string, Predecessor>
  delays: Map<string, number>
}

const CACHE_TTL_MS = 30_000
const MAX_CACHE_ENTRIES = 256

const cache = new Map<
  string,
  { expiresAt: number; value: Promise<ReachabilityState> }
>()

/** Drop expired entries (they are otherwise never re-read) and hard-cap the
 * total so a burst of distinct origins can't grow the cache without bound on
 * the 1.5 GB box. Map iterates in insertion order, so the oldest keys go first. */
function pruneCache(now: number): void {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key)
    }
  }
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) {
      break
    }
    cache.delete(oldest)
  }
}

interface ReachabilityParams {
  originLat: number
  originLon: number
  departureTime: number
  useBajs: boolean
}

function makeKey(params: ReachabilityParams) {
  return [
    params.originLat.toFixed(5),
    params.originLon.toFixed(5),
    params.departureTime,
    params.useBajs ? "bajs" : "base",
  ].join(":")
}

async function computeState(
  key: string,
  params: ReachabilityParams
): Promise<ReachabilityState> {
  // Filter to the same schedule day the isochrone paint uses. Without a
  // service date, OTP's `trips` field pools every service day in the feed
  // (per-date service ids: ~6 months of departures merged), which fabricates
  // ~1-minute headways and instant transfers — routes then contradict the
  // day-filtered isochrone paint.
  const graph = await getGraph(await engineServiceDate())
  const rtData = getRealtimeData()
  let bajsData: BajsData | null = null
  if (params.useBajs) {
    try {
      bajsData = await getBajsData()
    } catch (error) {
      console.error("BAJS routing data unavailable:", error)
    }
  }
  const {
    times: travelTimes,
    preds,
    delays,
  } = computeTravelTimes(
    graph,
    params.originLat,
    params.originLon,
    params.departureTime,
    rtData,
    {
      bajsStations: bajsData?.stations,
      timeCap: 3600,
    }
  )

  return {
    key,
    originLat: params.originLat,
    originLon: params.originLon,
    departureTime: params.departureTime,
    useBajs: params.useBajs,
    graph,
    rtData,
    bajsData,
    travelTimes,
    preds,
    delays,
  }
}

export function getReachabilityState(
  params: ReachabilityParams
): Promise<ReachabilityState> {
  const key = makeKey(params)
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.value
  }

  const value = computeState(key, params).catch((error: unknown) => {
    // A transient OTP/BAJS failure must not stay cached and replay its
    // rejection to every caller for the full TTL.
    cache.delete(key)
    throw error
  })

  cache.set(key, {
    expiresAt: now + CACHE_TTL_MS,
    value,
  })
  pruneCache(now)

  return value
}
