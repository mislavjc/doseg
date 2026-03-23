import type { BajsStation } from "./bajs"
import { getStopDelay, type TripRT } from "./gtfs-rt"
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
const TRANSFER_PENALTY = 120 // 2-minute penalty for line changes

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

let cachedGraph: TransitGraph | null = null
let cachedGraphDate: string | undefined = undefined
let graphPromise: Promise<TransitGraph> | null = null

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

// Predecessor kind encoding for typed-array storage
const PRED_NONE = 0
const PRED_WALK = 1
const PRED_TRANSIT = 2
const PRED_BIKE = 3
const PRED_KIND_NAMES = ["WALK", "WALK", "TRANSIT", "BIKE"] as const

function nodeKey(
  idx: number,
  stopCount: number,
  stopArray: StopNode[],
  bajsAdj: IndexedBajsAdjacency | null
): string | null {
  if (idx < 0) return null
  if (idx < stopCount) return stopArray[idx].key
  if (bajsAdj && idx - stopCount < bajsAdj.bajsCount)
    return bajsAdj.stations[idx - stopCount].key
  return null
}

function collectRoutingResults(
  best: Float64Array,
  delayArr: Float64Array,
  predFrom: Int32Array,
  predKind: Uint8Array,
  predPattern: Int32Array,
  predBoard: Int32Array,
  predAlight: Int32Array,
  totalNodes: number,
  stopCount: number,
  stopArray: StopNode[],
  bajsAdj: IndexedBajsAdjacency | null
): {
  times: Map<string, number>
  preds: Map<string, Predecessor>
  delays: Map<string, number>
} {
  const times = new Map<string, number>()
  const preds = new Map<string, Predecessor>()
  const delays = new Map<string, number>()

  for (let i = 0; i < totalNodes; i++) {
    if (best[i] >= Infinity) continue
    const key = nodeKey(i, stopCount, stopArray, bajsAdj)
    if (!key) continue

    times.set(key, best[i])

    if (predKind[i] !== PRED_NONE) {
      const fromKey = nodeKey(predFrom[i], stopCount, stopArray, bajsAdj)
      if (fromKey) {
        const pred: Predecessor = {
          fromKey,
          kind: PRED_KIND_NAMES[predKind[i]],
        }
        if (predKind[i] === PRED_TRANSIT) {
          pred.patternIdx = predPattern[i]
          pred.boardIdx = predBoard[i]
          pred.alightIdx = predAlight[i]
        }
        preds.set(key, pred)
      }
    }

    if (delayArr[i] !== 0) {
      delays.set(key, delayArr[i])
    }
  }

  return { times, preds, delays }
}

/**
 * Run the interactive reachability search from an origin point.
 * Returns travel times to all reachable transit stops and optional BAJS stations,
 * plus predecessor chains and RT delays for transit alight nodes.
 *
 * Uses integer-indexed Float64Array + flat heap for performance (3-5x faster
 * than the previous Map<string> + object-heap implementation).
 *
 * @param options.timeCap - optional time limit in seconds. Nodes beyond this are not explored.
 *   Default: Infinity (explore everything, needed for client-side route reconstruction).
 */
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
  const { stopArray, stopCount } = graph
  const hasBajs = options.bajsStations != null && options.bajsStations.length > 0
  const bajsAdj = hasBajs
    ? buildBajsAdjacencyIndexed(graph, options.bajsStations!)
    : null
  const totalNodes = stopCount + (bajsAdj?.bajsCount ?? 0)

  const best = new Float64Array(totalNodes).fill(Infinity)
  const delayArr = new Float64Array(totalNodes)
  const predFrom = new Int32Array(totalNodes)
  const predKind = new Uint8Array(totalNodes)
  const predPattern = new Int32Array(totalNodes)
  const predBoard = new Int32Array(totalNodes)
  const predAlight = new Int32Array(totalNodes)
  const h: FlatHeap = { hT: [], hN: [], hSize: 0 }

  // Seed: walk from origin to nearby stops
  for (let si = 0; si < stopCount; si++) {
    const stop = stopArray[si]
    const d = fastDistKm(originLat, originLon, stop.lat, stop.lon)
    if (d <= WALK_MAX_KM) {
      const walkTime = (d / WALK_SPEED) * 3600
      best[si] = walkTime
      flatHeapPush(h, walkTime, si)
    }
  }

  // Seed: walk to BAJS stations
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

  while (h.hSize > 0) {
    const { time, nodeIdx } = flatHeapPop(h)
    if (time > timeCap) break
    if (time > best[nodeIdx]) continue

    if (nodeIdx < stopCount) {
      const stop = stopArray[nodeIdx]

      // --- Expand transit patterns ---
      const isSameStopTransfer = predKind[nodeIdx] === PRED_TRANSIT
      for (const { patternIdx, stopIdx } of stop.patterns) {
        if (isSameStopTransfer && predPattern[nodeIdx] === patternIdx) continue

        const pattern = graph.patterns[patternIdx]
        const clockTime = departureTime + time
        const result = getNextWait(
          pattern.departures,
          pattern.stopOffsets[stopIdx],
          clockTime
        )
        if (result === null) continue

        const boardTime =
          time + result.waitSeconds + (isSameStopTransfer ? TRANSFER_PENALTY : 0)
        const boardOffset = pattern.stopOffsets[stopIdx]
        const tripRT = findTripRT(rtData, pattern.tripIds, result.tripIndex)
        const boardDelay = tripRT ? getStopDelay(tripRT, stopIdx) : 0

        for (let i = stopIdx + 1; i < pattern.stopIndices.length; i++) {
          const alightDelay = tripRT ? getStopDelay(tripRT, i) : 0
          let travelTime = boardTime + (pattern.stopOffsets[i] - boardOffset)
          if (tripRT) travelTime += alightDelay - boardDelay

          const destIdx = pattern.stopIndices[i]
          if (travelTime < best[destIdx]) {
            best[destIdx] = travelTime
            predFrom[destIdx] = nodeIdx
            predKind[destIdx] = PRED_TRANSIT
            predPattern[destIdx] = patternIdx
            predBoard[destIdx] = stopIdx
            predAlight[destIdx] = i
            if (tripRT) delayArr[destIdx] = alightDelay
            flatHeapPush(h, travelTime, destIdx)
          }
        }
      }

      // --- Expand walk transfers to nearby stops ---
      for (const { idx: nearbyIdx, distKm } of stop.nearbyStopIndices) {
        const transferTime =
          time + (distKm / WALK_SPEED) * 3600 + TRANSFER_PENALTY
        if (transferTime < best[nearbyIdx]) {
          best[nearbyIdx] = transferTime
          predFrom[nearbyIdx] = nodeIdx
          predKind[nearbyIdx] = PRED_WALK
          flatHeapPush(h, transferTime, nearbyIdx)
        }
      }

      // --- Expand walks to BAJS stations ---
      if (bajsAdj) {
        const links = bajsAdj.stopToStationLinks[nodeIdx]
        if (links) {
          for (const { idx: stationIdx, distKm } of links) {
            const walkTime =
              time + (distKm / WALK_SPEED) * 3600 + TRANSFER_PENALTY
            if (walkTime < best[stationIdx]) {
              best[stationIdx] = walkTime
              predFrom[stationIdx] = nodeIdx
              predKind[stationIdx] = PRED_WALK
              flatHeapPush(h, walkTime, stationIdx)
            }
          }
        }
      }
    } else if (bajsAdj) {
      const bi = nodeIdx - stopCount

      const stopLinks = bajsAdj.stationToStopLinks[bi]
      if (stopLinks) {
        for (const { idx: stopIdx, distKm } of stopLinks) {
          const walkTime = time + (distKm / WALK_SPEED) * 3600
          if (walkTime < best[stopIdx]) {
            best[stopIdx] = walkTime
            predFrom[stopIdx] = nodeIdx
            predKind[stopIdx] = PRED_WALK
            flatHeapPush(h, walkTime, stopIdx)
          }
        }
      }

      const station = bajsAdj.stations[bi]
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
              predFrom[targetIdx] = nodeIdx
              predKind[targetIdx] = PRED_BIKE
              flatHeapPush(h, bikeTime, targetIdx)
            }
          }
        }
      }
    }
  }

  return collectRoutingResults(
    best, delayArr, predFrom, predKind, predPattern, predBoard, predAlight,
    totalNodes, stopCount, stopArray, bajsAdj
  )
}

// --- Indexed BAJS adjacency ---

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

