import type { BajsData } from "./bajs"
import { getBajsData } from "./bajs"
import { getRealtimeData, type TripRT } from "./gtfs-rt"
import {
  computeTravelTimes,
  getGraph,
  type Predecessor,
  type TransitGraph,
} from "./transit-graph"

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

const cache = new Map<
  string,
  { expiresAt: number; value: Promise<ReachabilityState> }
>()

function makeKey(params: {
  originLat: number
  originLon: number
  departureTime: number
  useBajs: boolean
}) {
  return [
    params.originLat.toFixed(5),
    params.originLon.toFixed(5),
    params.departureTime,
    params.useBajs ? "bajs" : "base",
  ].join(":")
}

export async function getReachabilityState(params: {
  originLat: number
  originLon: number
  departureTime: number
  useBajs: boolean
}): Promise<ReachabilityState> {
  const key = makeKey(params)
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.value
  }

  const value = (async () => {
    const graph = await getGraph()
    const rtData = getRealtimeData()
    let bajsData: BajsData | null = null
    if (params.useBajs) {
      try {
        bajsData = await getBajsData()
      } catch (err) {
        console.error("BAJS routing data unavailable:", err)
      }
    }
    const { times: travelTimes, preds, delays } = computeTravelTimes(
      graph,
      params.originLat,
      params.originLon,
      params.departureTime,
      rtData,
      {
        bajsStations: bajsData?.stations,
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
  })()

  cache.set(key, {
    expiresAt: now + CACHE_TTL_MS,
    value,
  })

  return value
}
