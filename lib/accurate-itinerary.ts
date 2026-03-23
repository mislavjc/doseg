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

function buildTransitLeg(
  state: ReachabilityState,
  pred: { fromKey: string; patternIdx?: number; boardIdx?: number; alightIdx?: number },
  fromNode: RouteNode,
  node: RouteNode,
  elapsedSeconds: number
): { leg: Leg; newElapsed: number } | null {
  if (
    pred.patternIdx === undefined ||
    pred.boardIdx === undefined ||
    pred.alightIdx === undefined
  ) {
    return null
  }

  const pattern = state.graph.patterns[pred.patternIdx]
  if (!pattern) return null

  // Use accumulated elapsed time (actual walk/bike/ride durations) rather than
  // Dijkstra travel times, which include artificial transfer penalties that
  // would shift the clock forward and select later departures than necessary.
  const timing = computeTransitLegDuration(
    pattern,
    pred.boardIdx,
    pred.alightIdx,
    state.departureTime,
    elapsedSeconds,
    state.rtData
  )
  if (!timing) return null

  const fromPlace: Place = { name: fromNode.name, lat: fromNode.lat, lon: fromNode.lon }
  const toPlace: Place = { name: node.name, lat: node.lat, lon: node.lon }

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
    legGeometry: { points: "", coords: transitCoords },
  }

  return { leg, newElapsed: elapsedSeconds + timing.durationSeconds }
}

function processChainStep(
  state: ReachabilityState,
  chainKey: string,
  elapsedSeconds: number
): { leg: Leg; newElapsed: number } | null {
  const node = getNode(state, chainKey)
  const pred = state.preds.get(chainKey)
  const fromNode = pred ? getNode(state, pred.fromKey) : null
  if (!node || !pred || !fromNode) return null

  const fromPlace: Place = { name: fromNode.name, lat: fromNode.lat, lon: fromNode.lon }
  const toPlace: Place = { name: node.name, lat: node.lat, lon: node.lon }

  if (pred.kind === "WALK") {
    const leg = makeWalkLeg(fromPlace, toPlace)
    return { leg, newElapsed: elapsedSeconds + leg.duration }
  }

  if (pred.kind === "BIKE") {
    const leg = makeBikeLeg(fromPlace, toPlace)
    leg.duration += BAJS_PICKUP_SECONDS + BAJS_DROPOFF_SECONDS
    return { leg, newElapsed: elapsedSeconds + leg.duration }
  }

  const result = buildTransitLeg(state, pred, fromNode, node, elapsedSeconds)
  if (!result) return null

  return { leg: result.leg, newElapsed: result.newElapsed }
}

function buildLegsFromChain(
  state: ReachabilityState,
  chain: string[]
): { legs: Leg[]; elapsedSeconds: number } | null {
  const firstNode = getNode(state, chain[0])
  if (!firstNode) return null

  const legs: Leg[] = []
  let elapsedSeconds = 0

  const origin: Place = { name: "", lat: state.originLat, lon: state.originLon }

  if (distMeters(origin.lat, origin.lon, firstNode.lat, firstNode.lon) > 10) {
    const leg = makeWalkLeg(origin, firstNode)
    legs.push(leg)
    elapsedSeconds += leg.duration
  }

  for (let i = 1; i < chain.length; i++) {
    const step = processChainStep(state, chain[i], elapsedSeconds)
    if (!step) return null
    legs.push(step.leg)
    elapsedSeconds = step.newElapsed
  }

  return { legs, elapsedSeconds }
}

function appendFinalWalkLeg(
  legs: Leg[],
  terminalNode: RouteNode,
  destLat: number,
  destLon: number
): number {
  if (distMeters(terminalNode.lat, terminalNode.lon, destLat, destLon) <= 10) return 0
  const leg = makeWalkLeg(
    { name: terminalNode.name, lat: terminalNode.lat, lon: terminalNode.lon },
    { name: "", lat: destLat, lon: destLon }
  )
  legs.push(leg)
  return leg.duration
}

function summarizeLegs(legs: Leg[], elapsedSeconds: number): Itinerary {
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

  const result = buildLegsFromChain(state, chain)
  if (!result) return null

  const terminalNode = getNode(state, terminalKey)
  if (!terminalNode) return null

  result.elapsedSeconds += appendFinalWalkLeg(
    result.legs, terminalNode, destLat, destLon
  )

  if (result.legs.length === 0) return null

  return summarizeLegs(result.legs, result.elapsedSeconds)
}
