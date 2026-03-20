import type { BajsStation } from "./bajs"
import { getStopDelay, type TripRT } from "./gtfs-rt"
import { MinHeap } from "./min-heap"
import { decodePolyline } from "./polyline"
import { COS_LAT, KM_PER_DEG_LAT, KM_PER_DEG_LON, fastDistKm } from "./geo"
import { modeSpeed, type TransitMode } from "./transit"

export { COS_LAT, KM_PER_DEG_LAT, KM_PER_DEG_LON, fastDistKm }

const OTP_URL = process.env.OTP_URL || "http://localhost:8080"
const MAX_WAIT = 60 * 60

export const WALK_SPEED = 5 // km/h
export const WALK_MAX_KM = 1.2
const TRANSFER_MAX_KM = 0.3
const BAJS_TRANSFER_MAX_KM = 0.35
const BAJS_BIKE_MAX_KM = 6
export const BAJS_SPEED = 14 // km/h
export const BAJS_PICKUP_SECONDS = 60
export const BAJS_DROPOFF_SECONDS = 30

export interface PatternData {
  geometry: [number, number][]
  stopKeys: string[]
  stopIndices: number[] // numeric indices parallel to stopKeys (for integer-indexed Dijkstra)
  mode: TransitMode
  route: string
  departures: number[] // sorted departure seconds from first stop
  tripIds: string[] // GTFS trip IDs, parallel to departures
  stopOffsets: number[] // cumulative travel seconds from first stop to each stop
}

interface NearbyStop {
  key: string
  distKm: number
}

export interface StopNode {
  lat: number
  lon: number
  key: string
  name: string
  idx: number // numeric index for integer-indexed Dijkstra
  patterns: Array<{ patternIdx: number; stopIdx: number }>
  nearbyStops: NearbyStop[]
  nearbyStopIndices: Array<{ idx: number; distKm: number }>
}

export interface TransitGraph {
  patterns: PatternData[]
  stops: Map<string, StopNode>
  stopCount: number
  stopArray: StopNode[]
  stopIndex: Map<string, number> // key → numeric index
}

export interface Predecessor {
  fromKey: string
  kind: "WALK" | "TRANSIT" | "BIKE"
  patternIdx?: number
  boardIdx?: number
  alightIdx?: number
}

export interface ComputeTravelTimesOptions {
  timeCap?: number
  bajsStations?: readonly BajsStation[]
}

interface NearbyNode {
  key: string
  distKm: number
}

interface BajsAdjacency {
  stationsByKey: Map<string, BajsStation>
  stopWalkLinks: Map<string, NearbyNode[]>
  stationWalkLinks: Map<string, NearbyNode[]>
  stationBikeLinks: Map<string, NearbyNode[]>
}

let cachedGraph: TransitGraph | null = null
let cachedGraphDate: string | undefined = undefined
let graphPromise: Promise<TransitGraph> | null = null
let cachedBajsAdjacency: {
  graph: TransitGraph
  stations: readonly BajsStation[]
  adjacency: BajsAdjacency
} | null = null

/**
 * Build or return a cached transit graph from OTP.
 * @param serviceDate Optional GTFS service date (YYYY-MM-DD) to filter trips.
 *   When provided, only trips active on that date are included, giving correct
 *   weekday vs weekend schedules. When omitted, all trips are returned (legacy behavior).
 */
export async function getGraph(serviceDate?: string): Promise<TransitGraph> {
  if (cachedGraph && cachedGraphDate === serviceDate) return cachedGraph
  if (!graphPromise || cachedGraphDate !== serviceDate) {
    cachedGraphDate = serviceDate
    graphPromise = buildGraph(serviceDate).catch((err) => {
      graphPromise = null
      throw err
    })
  }
  return graphPromise
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractPatternStopKeys(p: any, patternIdx: number, stops: Map<string, StopNode>): string[] {
  const stopKeys: string[] = []
  for (let stopIdx = 0; stopIdx < p.stops.length; stopIdx++) {
    const s = p.stops[stopIdx]
    const key = `${s.lat.toFixed(5)},${s.lon.toFixed(5)}`
    stopKeys.push(key)

    if (!stops.has(key)) {
      stops.set(key, {
        lat: s.lat,
        lon: s.lon,
        key,
        name: s.name || "",
        idx: -1,
        patterns: [],
        nearbyStops: [],
        nearbyStopIndices: [],
      })
    }
    stops.get(key)!.patterns.push({ patternIdx, stopIdx })
  }
  return stopKeys
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTripDepartures(p: any): { departures: number[]; tripIds: string[] } {
  const trips = p.tripsForDate ?? p.trips ?? []
  const tripDeps: Array<{ dep: number; tripId: string }> = []
  for (const trip of trips) {
    const st = trip.stoptimes?.[0]
    if (st?.scheduledDeparture != null) {
      const rawId = ((trip.gtfsId as string) || "").replace(/^[^:]*:/, "")
      tripDeps.push({ dep: st.scheduledDeparture, tripId: rawId })
    }
  }
  tripDeps.sort((a, b) => a.dep - b.dep)
  return {
    departures: tripDeps.map((td) => td.dep),
    tripIds: tripDeps.map((td) => td.tripId),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeStopOffsets(p: any, mode: TransitMode): number[] {
  const nStops = p.stops.length
  const speed = modeSpeed(mode)
  const stopOffsets = [0]
  const trips = p.tripsForDate ?? p.trips ?? []

  const offsetSamples: number[][] = Array.from({ length: nStops }, () => [])
  const sampleCount = Math.min(5, trips.length)
  const tripSample =
    sampleCount === trips.length
      ? trips
      : Array.from({ length: sampleCount }, (_, i) =>
          trips[Math.floor((i * trips.length) / sampleCount)]
        )
  for (const trip of tripSample) {
    const st = trip.stoptimes as
      | Array<{ scheduledDeparture: number }>
      | undefined
    if (!st || st.length !== nStops) continue
    const base = st[0]?.scheduledDeparture
    if (base == null) continue
    for (let si = 1; si < nStops; si++) {
      if (st[si]?.scheduledDeparture != null) {
        const offset = st[si].scheduledDeparture - base
        if (offset >= 0) offsetSamples[si].push(offset)
      }
    }
  }

  for (let i = 1; i < nStops; i++) {
    const samples = offsetSamples[i]
    if (samples.length > 0) {
      samples.sort((a, b) => a - b)
      const mid = Math.floor(samples.length / 2)
      stopOffsets.push(
        samples.length % 2 === 1
          ? samples[mid]
          : (samples[mid - 1] + samples[mid]) / 2
      )
    } else {
      const prev = p.stops[i - 1]
      const curr = p.stops[i]
      const d = fastDistKm(prev.lat, prev.lon, curr.lat, curr.lon)
      stopOffsets.push(stopOffsets[i - 1] + (d / speed) * 3600)
    }
  }

  return stopOffsets
}

function computeNearbyStops(stops: Map<string, StopNode>) {
  const cellSize = TRANSFER_MAX_KM / KM_PER_DEG_LAT
  const grid = new Map<string, StopNode[]>()

  for (const stop of stops.values()) {
    const cx = Math.floor(stop.lon / cellSize)
    const cy = Math.floor(stop.lat / cellSize)
    const cellKey = `${cx},${cy}`
    if (!grid.has(cellKey)) grid.set(cellKey, [])
    grid.get(cellKey)!.push(stop)
  }

  for (const stop of stops.values()) {
    const cx = Math.floor(stop.lon / cellSize)
    const cy = Math.floor(stop.lat / cellSize)

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const neighbors = grid.get(`${cx + dx},${cy + dy}`)
        if (!neighbors) continue
        for (const other of neighbors) {
          if (other.key === stop.key) continue
          const d = fastDistKm(stop.lat, stop.lon, other.lat, other.lon)
          if (d <= TRANSFER_MAX_KM) {
            stop.nearbyStops.push({ key: other.key, distKm: d })
          }
        }
      }
    }
  }
}

function buildStopIndex(
  stops: Map<string, StopNode>,
  patterns: PatternData[]
): { stopArray: StopNode[]; stopIndex: Map<string, number> } {
  const stopArray = [...stops.values()]
  const stopIndex = new Map<string, number>()
  for (let i = 0; i < stopArray.length; i++) {
    stopArray[i].idx = i
    stopIndex.set(stopArray[i].key, i)
  }

  for (const pattern of patterns) {
    pattern.stopIndices = pattern.stopKeys.map((k) => stopIndex.get(k)!)
  }

  for (const stop of stops.values()) {
    stop.nearbyStopIndices = stop.nearbyStops.map((n) => ({
      idx: stopIndex.get(n.key)!,
      distKm: n.distKm,
    }))
  }

  return { stopArray, stopIndex }
}

async function fetchOtpPatterns(serviceDate?: string) {
  const tripsField = serviceDate
    ? `tripsForDate(serviceDate: "${serviceDate}") { gtfsId stoptimes { scheduledDeparture } }`
    : `trips { gtfsId stoptimes { scheduledDeparture } }`
  const res = await fetch(`${OTP_URL}/otp/gtfs/v1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `{ patterns { route { mode shortName longName } patternGeometry { points } stops { name lat lon } ${tripsField} } }`,
    }),
  })

  if (!res.ok) {
    throw new Error(`OTP pattern fetch failed: ${res.status}`)
  }

  const json = await res.json()
  if (!json.data?.patterns) {
    throw new Error("OTP returned no pattern data")
  }

  return json.data.patterns
}

async function buildGraph(serviceDate?: string): Promise<TransitGraph> {
  const rawPatterns = await fetchOtpPatterns(serviceDate)

  const patterns: PatternData[] = []
  const stops = new Map<string, StopNode>()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of rawPatterns as any[]) {
    if (!p.patternGeometry?.points || p.stops.length < 2) continue

    const patternIdx = patterns.length
    const stopKeys = extractPatternStopKeys(p, patternIdx, stops)
    const { departures, tripIds } = extractTripDepartures(p)
    const mode = (p.route?.mode || "BUS") as TransitMode
    const stopOffsets = computeStopOffsets(p, mode)

    patterns.push({
      geometry: decodePolyline(p.patternGeometry.points),
      stopKeys,
      stopIndices: [],
      mode,
      route: p.route?.shortName || p.route?.longName || "",
      departures,
      tripIds,
      stopOffsets,
    })
  }

  computeNearbyStops(stops)
  const { stopArray, stopIndex } = buildStopIndex(stops, patterns)

  cachedGraph = {
    patterns,
    stops,
    stopCount: stopArray.length,
    stopArray,
    stopIndex,
  }
  return cachedGraph
}

function buildBajsWalkLinks(
  graph: TransitGraph,
  activeStations: BajsStation[]
): {
  stopWalkLinks: Map<string, NearbyNode[]>
  stationWalkLinks: Map<string, NearbyNode[]>
} {
  const stopWalkLinks = new Map<string, NearbyNode[]>()
  const stationWalkLinks = new Map<string, NearbyNode[]>()

  for (const station of activeStations) {
    stationWalkLinks.set(station.key, [])
  }

  for (const [stopKey, stop] of graph.stops) {
    const walkLinks: NearbyNode[] = []

    for (const station of activeStations) {
      const distKm = fastDistKm(stop.lat, stop.lon, station.lat, station.lon)
      if (distKm > BAJS_TRANSFER_MAX_KM) continue

      walkLinks.push({ key: station.key, distKm })
      stationWalkLinks.get(station.key)?.push({ key: stopKey, distKm })
    }

    if (walkLinks.length > 0) {
      stopWalkLinks.set(stopKey, walkLinks)
    }
  }

  return { stopWalkLinks, stationWalkLinks }
}

function buildBajsBikeLinks(
  activeStations: BajsStation[]
): Map<string, NearbyNode[]> {
  const stationBikeLinks = new Map<string, NearbyNode[]>()
  for (const station of activeStations) {
    stationBikeLinks.set(station.key, [])
  }

  for (let i = 0; i < activeStations.length; i++) {
    const fromStation = activeStations[i]

    for (let j = i + 1; j < activeStations.length; j++) {
      const toStation = activeStations[j]
      const distKm = fastDistKm(
        fromStation.lat,
        fromStation.lon,
        toStation.lat,
        toStation.lon
      )
      if (distKm > BAJS_BIKE_MAX_KM) continue

      if (
        fromStation.isRenting &&
        fromStation.bikesAvailable > 0 &&
        toStation.isReturning &&
        toStation.docksAvailable > 0
      ) {
        stationBikeLinks.get(fromStation.key)?.push({
          key: toStation.key,
          distKm,
        })
      }

      if (
        toStation.isRenting &&
        toStation.bikesAvailable > 0 &&
        fromStation.isReturning &&
        fromStation.docksAvailable > 0
      ) {
        stationBikeLinks.get(toStation.key)?.push({
          key: fromStation.key,
          distKm,
        })
      }
    }
  }

  return stationBikeLinks
}

function buildBajsAdjacency(
  graph: TransitGraph,
  stations: readonly BajsStation[]
): BajsAdjacency {
  if (
    cachedBajsAdjacency?.graph === graph &&
    cachedBajsAdjacency.stations === stations
  ) {
    return cachedBajsAdjacency.adjacency
  }

  const activeStations = stations.filter((station) => station.isInstalled)
  const stationsByKey = new Map(
    activeStations.map((station) => [station.key, station])
  )
  const { stopWalkLinks, stationWalkLinks } = buildBajsWalkLinks(graph, activeStations)
  const stationBikeLinks = buildBajsBikeLinks(activeStations)

  const adjacency = {
    stationsByKey,
    stopWalkLinks,
    stationWalkLinks,
    stationBikeLinks,
  }

  cachedBajsAdjacency = { graph, stations, adjacency }
  return adjacency
}

/**
 * Find wait time for the next departure of a pattern at a given stop.
 * Returns seconds to wait + index into departures/tripIds, or null if no service.
 */
function getNextWait(
  departures: number[],
  stopOffset: number,
  clockTime: number
): { waitSeconds: number; tripIndex: number } | null {
  if (departures.length === 0) return null

  // A trip departing first stop at time D passes this stop at D + stopOffset.
  // We need D + stopOffset >= clockTime, i.e., D >= clockTime - stopOffset.
  const target = clockTime - stopOffset

  // Binary search for first departure >= target
  let lo = 0
  let hi = departures.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (departures[mid] < target) lo = mid + 1
    else hi = mid
  }

  if (lo >= departures.length) return null

  const wait = departures[lo] + stopOffset - clockTime
  return wait <= MAX_WAIT ? { waitSeconds: wait, tripIndex: lo } : null
}

export function computeTransitLegDuration(
  pattern: PatternData,
  boardIdx: number,
  alightIdx: number,
  departureTime: number,
  arrivalSeconds: number,
  rtData: Map<string, TripRT>
): { durationSeconds: number; delaySeconds?: number } | null {
  const clockTime = departureTime + arrivalSeconds
  const result = getNextWait(
    pattern.departures,
    pattern.stopOffsets[boardIdx],
    clockTime
  )
  if (result === null) return null

  let tripRT: TripRT | undefined
  for (
    let ti = result.tripIndex;
    ti >= Math.max(0, result.tripIndex - 3);
    ti--
  ) {
    tripRT = rtData.get(pattern.tripIds[ti])
    if (tripRT) break
  }

  const boardDelay = tripRT ? getStopDelay(tripRT, boardIdx) : 0
  let durationSeconds =
    result.waitSeconds +
    (pattern.stopOffsets[alightIdx] - pattern.stopOffsets[boardIdx])
  let delaySeconds: number | undefined

  if (tripRT) {
    delaySeconds = getStopDelay(tripRT, alightIdx)
    durationSeconds += delaySeconds - boardDelay
  }

  return {
    durationSeconds: Math.round(durationSeconds),
    ...(delaySeconds !== undefined ? { delaySeconds } : {}),
  }
}

function findTripRT(
  rtData: Map<string, TripRT>,
  tripIds: string[],
  tripIndex: number
): TripRT | undefined {
  for (
    let ti = tripIndex;
    ti >= Math.max(0, tripIndex - 3);
    ti--
  ) {
    const rt = rtData.get(tripIds[ti])
    if (rt) return rt
  }
  return undefined
}

function relaxTransitAlights(
  pattern: PatternData,
  patternIdx: number,
  stopIdx: number,
  key: string,
  boardTime: number,
  boardOffset: number,
  tripRT: TripRT | undefined,
  boardDelay: number,
  best: Map<string, number>,
  preds: Map<string, Predecessor>,
  delays: Map<string, number>,
  heap: MinHeap
) {
  for (let i = stopIdx + 1; i < pattern.stopKeys.length; i++) {
    let travelTime = boardTime + (pattern.stopOffsets[i] - boardOffset)

    if (tripRT) {
      travelTime += getStopDelay(tripRT, i) - boardDelay
    }

    const existing = best.get(pattern.stopKeys[i]) ?? Infinity
    if (travelTime < existing) {
      best.set(pattern.stopKeys[i], travelTime)
      preds.set(pattern.stopKeys[i], {
        fromKey: key,
        kind: "TRANSIT",
        patternIdx,
        boardIdx: stopIdx,
        alightIdx: i,
      })
      if (tripRT) {
        delays.set(pattern.stopKeys[i], getStopDelay(tripRT, i))
      }
      heap.push({ time: travelTime, key: pattern.stopKeys[i] })
    }
  }
}

function expandTransitPatterns(
  stop: StopNode,
  key: string,
  time: number,
  departureTime: number,
  graph: TransitGraph,
  rtData: Map<string, TripRT>,
  best: Map<string, number>,
  preds: Map<string, Predecessor>,
  delays: Map<string, number>,
  heap: MinHeap
) {
  for (const { patternIdx, stopIdx } of stop.patterns) {
    const pattern = graph.patterns[patternIdx]
    const clockTime = departureTime + time
    const result = getNextWait(
      pattern.departures,
      pattern.stopOffsets[stopIdx],
      clockTime
    )
    if (result === null) continue

    const boardTime = time + result.waitSeconds
    const boardOffset = pattern.stopOffsets[stopIdx]
    const tripRT = findTripRT(rtData, pattern.tripIds, result.tripIndex)
    const boardDelay = tripRT ? getStopDelay(tripRT, stopIdx) : 0

    relaxTransitAlights(
      pattern, patternIdx, stopIdx, key, boardTime, boardOffset,
      tripRT, boardDelay, best, preds, delays, heap
    )
  }
}

function expandStopWalks(
  stop: StopNode,
  key: string,
  time: number,
  bajsAdjacency: BajsAdjacency | null,
  relax: (key: string, time: number, pred: Predecessor) => void
) {
  for (const { key: nearbyKey, distKm } of stop.nearbyStops) {
    relax(nearbyKey, time + (distKm / WALK_SPEED) * 3600, {
      fromKey: key,
      kind: "WALK",
    })
  }

  if (bajsAdjacency) {
    for (const {
      key: stationKey,
      distKm,
    } of bajsAdjacency.stopWalkLinks.get(key) ?? []) {
      relax(stationKey, time + (distKm / WALK_SPEED) * 3600, {
        fromKey: key,
        kind: "WALK",
      })
    }
  }
}

function expandBajsStation(
  station: BajsStation,
  key: string,
  time: number,
  bajsAdjacency: BajsAdjacency,
  relax: (key: string, time: number, pred: Predecessor) => void
) {
  for (const { key: stopKey, distKm } of bajsAdjacency.stationWalkLinks.get(
    key
  ) ?? []) {
    relax(stopKey, time + (distKm / WALK_SPEED) * 3600, {
      fromKey: key,
      kind: "WALK",
    })
  }

  if (station.isRenting && station.bikesAvailable > 0) {
    for (const {
      key: targetKey,
      distKm,
    } of bajsAdjacency.stationBikeLinks.get(key) ?? []) {
      relax(
        targetKey,
        time +
          BAJS_PICKUP_SECONDS +
          BAJS_DROPOFF_SECONDS +
          (distKm / BAJS_SPEED) * 3600,
        {
          fromKey: key,
          kind: "BIKE",
        }
      )
    }
  }
}

/**
 * Run the interactive reachability search from an origin point.
 * Returns travel times to all reachable transit stops and optional BAJS stations,
 * plus predecessor chains and RT delays for transit alight nodes.
 *
 * @param options.timeCap - optional time limit in seconds. Nodes beyond this are not explored.
 *   Default: Infinity (explore everything, needed for client-side route reconstruction).
 */
function seedTravelTimes(
  graph: TransitGraph,
  originLat: number,
  originLon: number,
  bajsAdjacency: BajsAdjacency | null,
  best: Map<string, number>,
  heap: MinHeap
) {
  for (const [key, stop] of graph.stops) {
    const d = fastDistKm(originLat, originLon, stop.lat, stop.lon)
    if (d <= WALK_MAX_KM) {
      const walkTime = (d / WALK_SPEED) * 3600
      best.set(key, walkTime)
      heap.push({ time: walkTime, key })
    }
  }

  if (bajsAdjacency) {
    for (const station of bajsAdjacency.stationsByKey.values()) {
      if (!station.isRenting || station.bikesAvailable <= 0) continue
      const distKm = fastDistKm(originLat, originLon, station.lat, station.lon)
      if (distKm > WALK_MAX_KM) continue
      const walkTime = (distKm / WALK_SPEED) * 3600
      const existing = best.get(station.key) ?? Infinity
      if (walkTime < existing) {
        best.set(station.key, walkTime)
        heap.push({ time: walkTime, key: station.key })
      }
    }
  }
}

export function computeTravelTimes(
  graph: TransitGraph,
  originLat: number,
  originLon: number,
  departureTime: number,
  rtData: Map<string, TripRT>,
  options: ComputeTravelTimesOptions = {}
): {
  times: Map<string, number>
  preds: Map<string, Predecessor>
  delays: Map<string, number>
} {
  const timeCap = options.timeCap ?? Infinity
  const bajsAdjacency =
    options.bajsStations && options.bajsStations.length > 0
      ? buildBajsAdjacency(graph, options.bajsStations)
      : null
  const best = new Map<string, number>()
  const preds = new Map<string, Predecessor>()
  const delays = new Map<string, number>()
  const heap = new MinHeap()

  function relax(key: string, time: number, pred: Predecessor) {
    const existing = best.get(key) ?? Infinity
    if (time >= existing) return
    best.set(key, time)
    preds.set(key, pred)
    heap.push({ time, key })
  }

  seedTravelTimes(graph, originLat, originLon, bajsAdjacency, best, heap)

  while (heap.size > 0) {
    const { time, key } = heap.pop()!
    if (time > timeCap) break
    if (time > (best.get(key) ?? Infinity)) continue

    const stop = graph.stops.get(key)
    const station = bajsAdjacency?.stationsByKey.get(key)
    if (!stop && !station) continue

    if (stop) {
      expandTransitPatterns(stop, key, time, departureTime, graph, rtData, best, preds, delays, heap)
      expandStopWalks(stop, key, time, bajsAdjacency, relax)
    }

    if (station && bajsAdjacency) {
      expandBajsStation(station, key, time, bajsAdjacency, relax)
    }
  }

  return { times: best, preds, delays }
}

/**
 * Compute average headway at a stop for a pattern near the given clock time.
 * Returns headway/2 (average wait) or null if no service.
 */
function getAvgWait(
  departures: number[],
  stopOffset: number,
  clockTime: number
): number | null {
  if (departures.length === 0) return null

  const target = clockTime - stopOffset

  let lo = 0,
    hi = departures.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (departures[mid] < target) lo = mid + 1
    else hi = mid
  }

  if (lo >= departures.length) return null

  let headway: number
  if (lo > 0) {
    headway = departures[lo] - departures[lo - 1]
  } else if (lo + 1 < departures.length) {
    headway = departures[lo + 1] - departures[lo]
  } else {
    headway = 3600
  }

  return Math.min(headway, 1800) / 2
}

const TRANSFER_PENALTY = 120 // 2 minutes

// --- Indexed BAJS adjacency for scoring Dijkstra ---

interface IndexedLink {
  idx: number
  distKm: number
}

interface IndexedBajsAdjacency {
  bajsCount: number
  stations: BajsStation[]
  stopToStationLinks: Array<IndexedLink[] | undefined> // stopIdx → BAJS dijkstra indices
  stationToStopLinks: IndexedLink[][] // bajs local idx → stop indices
  stationBikeLinks: IndexedLink[][] // bajs local idx → BAJS dijkstra indices
}

let cachedIndexedBajsAdj: {
  graph: TransitGraph
  stations: readonly BajsStation[]
  adjacency: IndexedBajsAdjacency
} | null = null

function buildIndexedStopStationLinks(
  stopArray: StopNode[],
  stopCount: number,
  activeStations: BajsStation[],
  bajsCount: number
): {
  stopToStationLinks: Array<IndexedLink[] | undefined>
  stationToStopLinks: IndexedLink[][]
} {
  const stopToStationLinks: Array<IndexedLink[] | undefined> = new Array(
    stopCount
  )
  const stationToStopLinks: IndexedLink[][] = Array.from(
    { length: bajsCount },
    () => []
  )

  for (let si = 0; si < stopCount; si++) {
    const stop = stopArray[si]
    let links: IndexedLink[] | undefined

    for (let bi = 0; bi < bajsCount; bi++) {
      const station = activeStations[bi]
      const distKm = fastDistKm(stop.lat, stop.lon, station.lat, station.lon)
      if (distKm > BAJS_TRANSFER_MAX_KM) continue

      if (!links) links = []
      links.push({ idx: stopCount + bi, distKm })
      stationToStopLinks[bi].push({ idx: si, distKm })
    }

    if (links) stopToStationLinks[si] = links
  }

  return { stopToStationLinks, stationToStopLinks }
}

function buildIndexedBikeLinks(
  activeStations: BajsStation[],
  bajsCount: number,
  stopCount: number
): IndexedLink[][] {
  const stationBikeLinks: IndexedLink[][] = Array.from(
    { length: bajsCount },
    () => []
  )

  for (let i = 0; i < bajsCount; i++) {
    const from = activeStations[i]
    for (let j = i + 1; j < bajsCount; j++) {
      const to = activeStations[j]
      const distKm = fastDistKm(from.lat, from.lon, to.lat, to.lon)
      if (distKm > BAJS_BIKE_MAX_KM) continue

      if (
        from.isRenting &&
        from.bikesAvailable > 0 &&
        to.isReturning &&
        to.docksAvailable > 0
      ) {
        stationBikeLinks[i].push({ idx: stopCount + j, distKm })
      }
      if (
        to.isRenting &&
        to.bikesAvailable > 0 &&
        from.isReturning &&
        from.docksAvailable > 0
      ) {
        stationBikeLinks[j].push({ idx: stopCount + i, distKm })
      }
    }
  }

  return stationBikeLinks
}

function buildBajsAdjacencyIndexed(
  graph: TransitGraph,
  stations: readonly BajsStation[]
): IndexedBajsAdjacency {
  if (
    cachedIndexedBajsAdj?.graph === graph &&
    cachedIndexedBajsAdj.stations === stations
  ) {
    return cachedIndexedBajsAdj.adjacency
  }

  const activeStations = stations.filter((s) => s.isInstalled)
  const bajsCount = activeStations.length
  const { stopCount, stopArray } = graph

  const { stopToStationLinks, stationToStopLinks } =
    buildIndexedStopStationLinks(stopArray, stopCount, activeStations, bajsCount)
  const stationBikeLinks = buildIndexedBikeLinks(activeStations, bajsCount, stopCount)

  const adjacency = {
    bajsCount,
    stations: activeStations,
    stopToStationLinks,
    stationToStopLinks,
    stationBikeLinks,
  }
  cachedIndexedBajsAdj = { graph, stations, adjacency }
  return adjacency
}

interface FlatHeap {
  hT: number[]
  hN: number[]
  hSize: number
}

function flatHeapPush(h: FlatHeap, time: number, node: number) {
  let i = h.hSize++
  h.hT[i] = time
  h.hN[i] = node
  while (i > 0) {
    const p = (i - 1) >> 1
    if (h.hT[p] <= h.hT[i]) break
    const tt = h.hT[p]
    h.hT[p] = h.hT[i]
    h.hT[i] = tt
    const tn = h.hN[p]
    h.hN[p] = h.hN[i]
    h.hN[i] = tn
    i = p
  }
}

function flatHeapPop(h: FlatHeap): { time: number; nodeIdx: number } {
  const time = h.hT[0]
  const nodeIdx = h.hN[0]
  h.hSize--
  if (h.hSize > 0) {
    h.hT[0] = h.hT[h.hSize]
    h.hN[0] = h.hN[h.hSize]
    let i = 0
    while (true) {
      let s = i
      const l = 2 * i + 1
      const r = 2 * i + 2
      if (l < h.hSize && h.hT[l] < h.hT[s]) s = l
      if (r < h.hSize && h.hT[r] < h.hT[s]) s = r
      if (s === i) break
      const tt = h.hT[s]
      h.hT[s] = h.hT[i]
      h.hT[i] = tt
      const tn = h.hN[s]
      h.hN[s] = h.hN[i]
      h.hN[i] = tn
      i = s
    }
  }
  return { time, nodeIdx }
}

function expandAvgPatterns(
  stop: StopNode,
  time: number,
  departureTime: number,
  graph: TransitGraph,
  best: Float64Array,
  h: FlatHeap,
  excludeModes?: ReadonlySet<TransitMode>
) {
  for (const { patternIdx, stopIdx } of stop.patterns) {
    const pattern = graph.patterns[patternIdx]
    if (excludeModes?.has(pattern.mode)) continue
    const clockTime = departureTime + time

    const avgWait = getAvgWait(
      pattern.departures,
      pattern.stopOffsets[stopIdx],
      clockTime
    )
    if (avgWait === null) continue

    const boardTime = time + avgWait
    const boardOffset = pattern.stopOffsets[stopIdx]

    for (let i = stopIdx + 1; i < pattern.stopIndices.length; i++) {
      const travelTime = boardTime + (pattern.stopOffsets[i] - boardOffset)
      const destIdx = pattern.stopIndices[i]
      if (travelTime < best[destIdx]) {
        best[destIdx] = travelTime
        flatHeapPush(h, travelTime, destIdx)
      }
    }
  }
}

function expandAvgTransitStop(
  stop: StopNode,
  nodeIdx: number,
  time: number,
  departureTime: number,
  graph: TransitGraph,
  bajsAdj: IndexedBajsAdjacency | null,
  best: Float64Array,
  h: FlatHeap,
  excludeModes?: ReadonlySet<TransitMode>
) {
  expandAvgPatterns(stop, time, departureTime, graph, best, h, excludeModes)

  for (const { idx: nearbyIdx, distKm } of stop.nearbyStopIndices) {
    const transferTime =
      time + (distKm / WALK_SPEED) * 3600 + TRANSFER_PENALTY
    if (transferTime < best[nearbyIdx]) {
      best[nearbyIdx] = transferTime
      flatHeapPush(h, transferTime, nearbyIdx)
    }
  }

  if (bajsAdj) {
    const links = bajsAdj.stopToStationLinks[nodeIdx]
    if (links) {
      for (const { idx: stationIdx, distKm } of links) {
        const walkTime = time + (distKm / WALK_SPEED) * 3600
        if (walkTime < best[stationIdx]) {
          best[stationIdx] = walkTime
          flatHeapPush(h, walkTime, stationIdx)
        }
      }
    }
  }
}

function expandAvgBajsStation(
  bi: number,
  time: number,
  bajsAdj: IndexedBajsAdjacency,
  best: Float64Array,
  h: FlatHeap
) {
  const station = bajsAdj.stations[bi]

  const stopLinks = bajsAdj.stationToStopLinks[bi]
  if (stopLinks) {
    for (const { idx: stopIdx, distKm } of stopLinks) {
      const walkTime = time + (distKm / WALK_SPEED) * 3600
      if (walkTime < best[stopIdx]) {
        best[stopIdx] = walkTime
        flatHeapPush(h, walkTime, stopIdx)
      }
    }
  }

  if (station.isRenting && station.bikesAvailable > 0) {
    const bikeLinks = bajsAdj.stationBikeLinks[bi]
    if (bikeLinks) {
      for (const { idx: targetIdx, distKm } of bikeLinks) {
        const bikeTime =
          time +
          BAJS_PICKUP_SECONDS +
          BAJS_DROPOFF_SECONDS +
          (distKm / BAJS_SPEED) * 3600
        if (bikeTime < best[targetIdx]) {
          best[targetIdx] = bikeTime
          flatHeapPush(h, bikeTime, targetIdx)
        }
      }
    }
  }
}

function collectAvgResults(
  best: Float64Array,
  stopCount: number,
  stopArray: StopNode[],
  bajsAdj: IndexedBajsAdjacency | null
): Map<string, number> {
  const result = new Map<string, number>()
  for (let i = 0; i < stopCount; i++) {
    if (best[i] < Infinity) result.set(stopArray[i].key, best[i])
  }
  if (bajsAdj) {
    for (let i = 0; i < bajsAdj.bajsCount; i++) {
      if (best[stopCount + i] < Infinity) {
        result.set(bajsAdj.stations[i].key, best[stopCount + i])
      }
    }
  }
  return result
}

/**
 * Scoring-optimized transit Dijkstra with realistic travel assumptions:
 * - Average wait (headway/2) instead of best-case next departure
 * - 2-minute transfer penalty for line changes
 * - No predecessor tracking or GTFS-RT (not needed for batch scoring)
 * - Uses integer-indexed Float64Array + flat heap instead of Map<string> + object heap
 */
function seedAvgTravelTimes(
  originLat: number,
  originLon: number,
  stopArray: StopNode[],
  stopCount: number,
  bajsAdj: IndexedBajsAdjacency | null,
  best: Float64Array,
  h: FlatHeap
) {
  for (let si = 0; si < stopCount; si++) {
    const stop = stopArray[si]
    const d = fastDistKm(originLat, originLon, stop.lat, stop.lon)
    if (d <= WALK_MAX_KM) {
      const walkTime = (d / WALK_SPEED) * 3600
      best[si] = walkTime
      flatHeapPush(h, walkTime, si)
    }
  }

  if (bajsAdj) {
    for (let bi = 0; bi < bajsAdj.bajsCount; bi++) {
      const station = bajsAdj.stations[bi]
      if (!station.isRenting || station.bikesAvailable <= 0) continue
      const distKm = fastDistKm(originLat, originLon, station.lat, station.lon)
      if (distKm > WALK_MAX_KM) continue
      const walkTime = (distKm / WALK_SPEED) * 3600
      const idx = stopCount + bi
      if (walkTime < best[idx]) {
        best[idx] = walkTime
        flatHeapPush(h, walkTime, idx)
      }
    }
  }
}

export function computeAvgTravelTimes(
  graph: TransitGraph,
  originLat: number,
  originLon: number,
  departureTime: number,
  timeCap: number,
  bajsStations?: readonly BajsStation[],
  excludeModes?: ReadonlySet<TransitMode>
): Map<string, number> {
  const { stopArray, stopCount } = graph
  const hasBajs = bajsStations != null && bajsStations.length > 0
  const bajsAdj = hasBajs
    ? buildBajsAdjacencyIndexed(graph, bajsStations!)
    : null
  const totalNodes = stopCount + (bajsAdj?.bajsCount ?? 0)
  const best = new Float64Array(totalNodes).fill(Infinity)
  const h: FlatHeap = { hT: [], hN: [], hSize: 0 }

  seedAvgTravelTimes(originLat, originLon, stopArray, stopCount, bajsAdj, best, h)

  while (h.hSize > 0) {
    const { time, nodeIdx } = flatHeapPop(h)
    if (time > timeCap) break
    if (time > best[nodeIdx]) continue

    if (nodeIdx < stopCount) {
      expandAvgTransitStop(stopArray[nodeIdx], nodeIdx, time, departureTime, graph, bajsAdj, best, h, excludeModes)
    } else if (bajsAdj) {
      expandAvgBajsStation(nodeIdx - stopCount, time, bajsAdj, best, h)
    }
  }

  return collectAvgResults(best, stopCount, stopArray, bajsAdj)
}
