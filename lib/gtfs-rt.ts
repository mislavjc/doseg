import GtfsRealtimeBindings from "gtfs-realtime-bindings"

const ZET_RT_URL = "https://www.zet.hr/gtfs-rt-protobuf"
const CACHE_TTL_MS = 30_000

export interface StopTimeRT {
  stopSequence: number
  arrivalDelay: number // seconds, positive = late
}

export interface TripRT {
  stopTimes: StopTimeRT[] // sorted by stopSequence
}

let cached: Map<string, TripRT> = new Map()
let cacheTime = 0
let refreshPromise: Promise<void> | null = null

async function refresh(): Promise<void> {
  try {
    const res = await fetch(ZET_RT_URL)
    if (!res.ok) throw new Error(`GTFS-RT fetch failed: ${res.status}`)

    const buf = await res.arrayBuffer()
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(buf)
    )

    const rt = new Map<string, TripRT>()

    for (const entity of feed.entity) {
      const tu = entity.tripUpdate
      if (!tu?.trip?.tripId || !tu.stopTimeUpdate?.length) continue

      const stopTimes: StopTimeRT[] = []
      for (const stu of tu.stopTimeUpdate) {
        const delay = stu.arrival?.delay ?? stu.departure?.delay ?? 0
        stopTimes.push({
          stopSequence: stu.stopSequence ?? 0,
          arrivalDelay: delay,
        })
      }
      stopTimes.sort((a, b) => a.stopSequence - b.stopSequence)

      rt.set(tu.trip.tripId, { stopTimes })
    }

    cached = rt
    cacheTime = Date.now()
  } catch {
    // Keep serving stale cache on failure
  } finally {
    refreshPromise = null
  }
}

/** Returns cached RT data immediately; triggers background refresh when stale. */
export function getRealtimeData(): Map<string, TripRT> {
  if (Date.now() - cacheTime >= CACHE_TTL_MS && !refreshPromise) {
    refreshPromise = refresh()
  }
  return cached
}

/**
 * Find the delay for a given stop index in a trip's RT data.
 * GTFS-RT stop_sequence is 1-based; pattern stopIdx is 0-based.
 * Per spec, delays propagate forward until overridden.
 */
export function getStopDelay(trip: TripRT, stopIdx: number): number {
  const seq = stopIdx + 1 // 0-based → 1-based
  let delay = 0
  for (const st of trip.stopTimes) {
    if (st.stopSequence > seq) break
    delay = st.arrivalDelay
  }
  return delay
}
