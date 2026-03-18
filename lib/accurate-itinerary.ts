import type { Itinerary, Leg, Place } from "./otp"
import type { ReachabilityState } from "./reachability-state"
import {
  BAJS_DROPOFF_SECONDS,
  BAJS_PICKUP_SECONDS,
  BAJS_SPEED,
  computeTransitLegDuration,
  WALK_SPEED,
} from "./transit-graph"
import { distMeters, findStreetPath } from "./street-path"
import { getBikeGraph, getWalkGraph } from "./walk-graph"

const WALK_SPEED_MS = WALK_SPEED / 3.6
const BIKE_SPEED_MS = BAJS_SPEED / 3.6

interface RouteNode {
  key: string
  kind: "STOP" | "BAJS"
  lat: number
  lon: number
  name: string
}

function getNode(state: ReachabilityState, key: string): RouteNode | null {
  const stop = state.graph.stops.get(key)
  if (stop) {
    return {
      key,
      kind: "STOP",
      lat: stop.lat,
      lon: stop.lon,
      name: stop.name,
    }
  }

  const station = state.bajsData?.stationMap.get(key)
  if (!station) return null

  return {
    key,
    kind: "BAJS",
    lat: station.lat,
    lon: station.lon,
    name: station.name,
  }
}

function makeStraightLeg(
  mode: "WALK" | "BIKE",
  from: Place,
  to: Place,
  distance: number,
  duration: number
): Leg {
  return {
    mode,
    from,
    to,
    distance: Math.round(distance),
    duration: Math.round(duration),
    legGeometry: {
      points: "",
      coords: [
        [from.lon, from.lat],
        [to.lon, to.lat],
      ],
    },
  }
}

function makeWalkLeg(from: Place, to: Place): Leg {
  const path = findStreetPath(getWalkGraph(), from, to, WALK_SPEED)
  if (!path) {
    const distance = distMeters(from.lat, from.lon, to.lat, to.lon)
    return makeStraightLeg("WALK", from, to, distance, distance / WALK_SPEED_MS)
  }

  return {
    mode: "WALK",
    from,
    to,
    distance: path.distanceMeters,
    duration: path.durationSeconds,
    legGeometry: {
      points: "",
      coords: path.coords,
    },
  }
}

function makeBikeLeg(from: Place, to: Place): Leg {
  let path = null
  try {
    path = findStreetPath(getBikeGraph(), from, to, BAJS_SPEED)
  } catch {
    path = findStreetPath(getWalkGraph(), from, to, BAJS_SPEED)
  }

  if (!path) {
    const distance = distMeters(from.lat, from.lon, to.lat, to.lon)
    return makeStraightLeg("BIKE", from, to, distance, distance / BIKE_SPEED_MS)
  }

  return {
    mode: "BIKE",
    from,
    to,
    distance: path.distanceMeters,
    duration: path.durationSeconds,
    legGeometry: {
      points: "",
      coords: path.coords,
    },
  }
}

function appendCoord(coords: [number, number][], lon: number, lat: number) {
  const last = coords.at(-1)
  if (last && last[0] === lon && last[1] === lat) return
  coords.push([lon, lat])
}

function extractTransitStopGeometry(
  state: ReachabilityState,
  stopKeys: string[],
  boardIdx: number,
  alightIdx: number,
  fromNode: RouteNode,
  toNode: RouteNode
): [number, number][] {
  const coords: [number, number][] = []

  appendCoord(coords, fromNode.lon, fromNode.lat)
  for (let si = boardIdx; si <= alightIdx; si++) {
    const stopKey = stopKeys[si]
    const stop = state.graph.stops.get(stopKey)
    if (!stop) continue
    appendCoord(coords, stop.lon, stop.lat)
  }
  appendCoord(coords, toNode.lon, toNode.lat)

  return coords.length >= 2
    ? coords
    : [
        [fromNode.lon, fromNode.lat],
        [toNode.lon, toNode.lat],
      ]
}

function sumCoordsDistance(coords: [number, number][]): number {
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    const [prevLon, prevLat] = coords[i - 1]
    const [lon, lat] = coords[i]
    total += distMeters(prevLat, prevLon, lat, lon)
  }
  return Math.round(total)
}

function buildChain(state: ReachabilityState, terminalKey: string): string[] {
  const chain: string[] = []
  const visited = new Set<string>()
  let current: string | null = terminalKey

  while (current && !visited.has(current)) {
    visited.add(current)
    chain.push(current)
    const pred = state.preds.get(current)
    if (!pred) break
    current = pred.fromKey
  }

  chain.reverse()
  return chain
}

function pickTerminalKey(
  state: ReachabilityState,
  destLat: number,
  destLon: number,
  preferredKey?: string | null
): string | null {
  if (preferredKey && state.travelTimes.has(preferredKey)) return preferredKey

  let bestKey: string | null = null
  let bestScore = Infinity

  for (const [key, time] of state.travelTimes) {
    const node = getNode(state, key)
    if (!node) continue
    const score =
      time + distMeters(node.lat, node.lon, destLat, destLon) / WALK_SPEED_MS
    if (score < bestScore) {
      bestScore = score
      bestKey = key
    }
  }

  return bestKey
}

export function buildAccurateItinerary(
  state: ReachabilityState,
  destLat: number,
  destLon: number,
  preferredKey?: string | null
): Itinerary | null {
  const terminalKey = pickTerminalKey(state, destLat, destLon, preferredKey)
  if (!terminalKey) return null

  const chain = buildChain(state, terminalKey)
  if (chain.length === 0) return null

  const firstNode = getNode(state, chain[0])
  if (!firstNode) return null

  const legs: Leg[] = []
  let elapsedSeconds = 0

  const origin: Place = {
    name: "",
    lat: state.originLat,
    lon: state.originLon,
  }

  if (distMeters(origin.lat, origin.lon, firstNode.lat, firstNode.lon) > 10) {
    const leg = makeWalkLeg(origin, firstNode)
    legs.push(leg)
    elapsedSeconds += leg.duration
  }

  for (let i = 1; i < chain.length; i++) {
    const node = getNode(state, chain[i])
    const pred = state.preds.get(chain[i])
    const fromNode = pred ? getNode(state, pred.fromKey) : null
    if (!node || !pred || !fromNode) return null

    const fromPlace: Place = {
      name: fromNode.name,
      lat: fromNode.lat,
      lon: fromNode.lon,
    }
    const toPlace: Place = {
      name: node.name,
      lat: node.lat,
      lon: node.lon,
    }

    if (pred.kind === "WALK") {
      const leg = makeWalkLeg(fromPlace, toPlace)
      legs.push(leg)
      elapsedSeconds += leg.duration
      continue
    }

    if (pred.kind === "BIKE") {
      const leg = makeBikeLeg(fromPlace, toPlace)
      leg.duration += BAJS_PICKUP_SECONDS + BAJS_DROPOFF_SECONDS
      legs.push(leg)
      elapsedSeconds += leg.duration
      continue
    }

    if (
      pred.patternIdx === undefined ||
      pred.boardIdx === undefined ||
      pred.alightIdx === undefined
    ) {
      return null
    }

    const pattern = state.graph.patterns[pred.patternIdx]
    if (!pattern) return null

    // Use the Dijkstra's known arrival time at the boarding stop rather than
    // accumulated street-routing elapsed time.  Accurate walk/bike legs can be
    // slightly longer than the Dijkstra estimates, which shifts the clock and
    // can cause the originally-selected transit departure to be missed.
    const boardingArrival =
      state.travelTimes.get(pred.fromKey) ?? elapsedSeconds
    const timing = computeTransitLegDuration(
      pattern,
      pred.boardIdx,
      pred.alightIdx,
      state.departureTime,
      boardingArrival,
      state.rtData
    )
    if (!timing) return null

    const transitCoords = extractTransitStopGeometry(
      state,
      pattern.stopKeys,
      pred.boardIdx,
      pred.alightIdx,
      fromNode,
      node
    )
    const leg: Leg = {
      mode: pattern.mode,
      from: fromPlace,
      to: toPlace,
      duration: timing.durationSeconds,
      distance: sumCoordsDistance(transitCoords),
      route: pattern.route || undefined,
      delay: timing.delaySeconds,
      legGeometry: {
        points: "",
        coords: transitCoords,
      },
    }
    legs.push(leg)
    // After a transit leg, sync elapsed time to the Dijkstra's arrival at the
    // alight stop so that subsequent legs stay consistent with the graph.
    const dijkstraAlight = state.travelTimes.get(chain[i])
    elapsedSeconds = dijkstraAlight ?? boardingArrival + timing.durationSeconds
  }

  const terminalNode = getNode(state, terminalKey)
  if (!terminalNode) return null

  const destination: Place = {
    name: "",
    lat: destLat,
    lon: destLon,
  }

  if (distMeters(terminalNode.lat, terminalNode.lon, destLat, destLon) > 10) {
    const leg = makeWalkLeg(
      {
        name: terminalNode.name,
        lat: terminalNode.lat,
        lon: terminalNode.lon,
      },
      destination
    )
    legs.push(leg)
    elapsedSeconds += leg.duration
  }

  const walkDistance = legs
    .filter((leg) => leg.mode === "WALK")
    .reduce((sum, leg) => sum + leg.distance, 0)
  const bikeDistance = legs
    .filter((leg) => leg.mode === "BIKE")
    .reduce((sum, leg) => sum + leg.distance, 0)
  const transitLegs = legs.filter(
    (leg) => leg.mode !== "WALK" && leg.mode !== "BIKE"
  )

  return {
    duration: elapsedSeconds,
    walkDistance,
    bikeDistance,
    transfers: Math.max(0, transitLegs.length - 1),
    legs,
  }
}
