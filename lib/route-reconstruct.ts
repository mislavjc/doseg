import type { Itinerary, Leg } from "@/lib/otp"

interface RoutingStop {
  lat: number
  lon: number
  name: string
  time: number
  delay?: number // RT delay in seconds at this stop
  pred: {
    fromKey: string
    patternIdx: number
    boardIdx: number
    alightIdx: number
  } | null
}

interface RoutingStopInput extends RoutingStop {
  key: string
}

interface RoutingPattern {
  stopKeys: string[]
  mode: string
  route: string
}

export interface RoutingData {
  stops: Map<string, RoutingStop>
  patterns: RoutingPattern[]
  grid: Map<string, string[]>
  gridCellSize: number
  originLat: number
  originLon: number
  routeTemplates: Map<string, RouteTemplate | null>
}

interface RouteTemplate {
  baseLegs: Leg[]
  tailFrom: {
    name: string
    lat: number
    lon: number
    time: number
  }
  baseWalkDistance: number
  transfers: number
}

const GRID_CELL_SIZE = 0.005

const COS_LAT = Math.cos((45.8 * Math.PI) / 180)
const M_PER_DEG_LAT = 111320
const M_PER_DEG_LON = 111320 * COS_LAT
const WALK_SPEED_MS = 5 / 3.6

function distMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dlat = (lat2 - lat1) * M_PER_DEG_LAT
  const dlon = (lon2 - lon1) * M_PER_DEG_LON
  return Math.sqrt(dlat * dlat + dlon * dlon)
}

export function parseRoutingData(
  json: { stops: RoutingStopInput[]; patterns: RoutingPattern[] },
  originLat: number,
  originLon: number
): RoutingData {
  const stops = new Map<string, RoutingStop>()
  const grid = new Map<string, string[]>()

  for (const s of json.stops) {
    stops.set(s.key, {
      lat: s.lat,
      lon: s.lon,
      name: s.name || "",
      time: s.time,
      delay: s.delay,
      pred: s.pred,
    })
    const cx = Math.floor(s.lon / GRID_CELL_SIZE)
    const cy = Math.floor(s.lat / GRID_CELL_SIZE)
    const cellKey = `${cx},${cy}`
    let cell = grid.get(cellKey)
    if (!cell) {
      cell = []
      grid.set(cellKey, cell)
    }
    cell.push(s.key)
  }

  return {
    stops,
    patterns: json.patterns,
    grid,
    gridCellSize: GRID_CELL_SIZE,
    originLat,
    originLon,
    routeTemplates: new Map(),
  }
}

export function findNearestStop(
  data: RoutingData,
  lat: number,
  lon: number
): string | null {
  const cx = Math.floor(lon / data.gridCellSize)
  const cy = Math.floor(lat / data.gridCellSize)

  let bestKey: string | null = null
  let bestDist = Infinity

  // Fast grid search (~2km radius)
  for (let dx = -4; dx <= 4; dx++) {
    for (let dy = -4; dy <= 4; dy++) {
      const cell = data.grid.get(`${cx + dx},${cy + dy}`)
      if (!cell) continue
      for (const key of cell) {
        const stop = data.stops.get(key)
        if (!stop) continue
        const dlat = stop.lat - lat
        const dlon = stop.lon - lon
        const dist = dlat * dlat + dlon * dlon
        if (dist < bestDist) {
          bestDist = dist
          bestKey = key
        }
      }
    }
  }

  // Fallback: scan all stops when cursor is outside the grid radius
  if (!bestKey) {
    for (const [key, stop] of data.stops) {
      const dlat = stop.lat - lat
      const dlon = stop.lon - lon
      const dist = dlat * dlat + dlon * dlon
      if (dist < bestDist) {
        bestDist = dist
        bestKey = key
      }
    }
  }

  return bestKey
}

function stopName(stop: RoutingStop): string {
  return stop.name || ""
}

function buildRouteTemplate(
  data: RoutingData,
  nearestKey: string
): RouteTemplate | null {
  // Trace predecessors back to origin
  const chain: string[] = []
  let current: string | null = nearestKey
  const visited = new Set<string>()
  while (current && !visited.has(current)) {
    visited.add(current)
    chain.push(current)
    const stop = data.stops.get(current)
    if (!stop?.pred) break
    current = stop.pred.fromKey
  }
  chain.reverse()

  if (chain.length === 0) return null

  const firstStop = data.stops.get(chain[0])
  const lastStop = data.stops.get(chain[chain.length - 1])
  if (!firstStop || !lastStop) return null

  const baseLegs: Leg[] = []

  // Walk from origin to first stop
  const originDist = distMeters(
    data.originLat,
    data.originLon,
    firstStop.lat,
    firstStop.lon
  )
  if (originDist > 10) {
    baseLegs.push(
      makeWalkLeg(
        { name: "", lat: data.originLat, lon: data.originLon },
        { name: stopName(firstStop), lat: firstStop.lat, lon: firstStop.lon },
        originDist
      )
    )
  }

  // Process each step in the chain up to the nearest reachable stop
  for (let i = 1; i < chain.length; i++) {
    const stop = data.stops.get(chain[i])
    if (!stop?.pred) return null

    if (stop.pred.patternIdx === -1) {
      // Walk transfer
      const fromStop = data.stops.get(stop.pred.fromKey)
      if (!fromStop) return null

      const d = distMeters(fromStop.lat, fromStop.lon, stop.lat, stop.lon)
      baseLegs.push(
        makeWalkLeg(
          { name: stopName(fromStop), lat: fromStop.lat, lon: fromStop.lon },
          { name: stopName(stop), lat: stop.lat, lon: stop.lon },
          d
        )
      )
      continue
    }

    // Transit leg — build geometry from intermediate stop coordinates
    const pattern = data.patterns[stop.pred.patternIdx]
    const boardStop = data.stops.get(stop.pred.fromKey)
    if (!pattern || !boardStop) return null

    const coords: [number, number][] = []
    for (let si = stop.pred.boardIdx; si <= stop.pred.alightIdx; si++) {
      const sk = pattern.stopKeys[si]
      const s = data.stops.get(sk)
      if (s) coords.push([s.lon, s.lat])
    }
    if (coords.length < 2) {
      coords.length = 0
      coords.push([boardStop.lon, boardStop.lat], [stop.lon, stop.lat])
    }

    const fromTime = data.stops.get(stop.pred.fromKey)?.time || 0
    baseLegs.push({
      mode: pattern.mode,
      from: { name: stopName(boardStop), lat: boardStop.lat, lon: boardStop.lon },
      to: { name: stopName(stop), lat: stop.lat, lon: stop.lon },
      duration: Math.round(stop.time - fromTime),
      distance: Math.round(
        distMeters(boardStop.lat, boardStop.lon, stop.lat, stop.lon)
      ),
      route: pattern.route || undefined,
      delay: stop.delay,
      legGeometry: {
        points: "",
        coords,
      },
    })
  }

  const baseWalkDistance = baseLegs
    .filter((leg) => leg.mode === "WALK")
    .reduce((sum, leg) => sum + leg.distance, 0)
  const transitLegs = baseLegs.filter((leg) => leg.mode !== "WALK")

  return {
    baseLegs,
    tailFrom: {
      name: stopName(lastStop),
      lat: lastStop.lat,
      lon: lastStop.lon,
      time: lastStop.time,
    },
    baseWalkDistance,
    transfers: Math.max(0, transitLegs.length - 1),
  }
}

function getRouteTemplate(
  data: RoutingData,
  nearestKey: string
): RouteTemplate | null {
  if (data.routeTemplates.has(nearestKey)) {
    return data.routeTemplates.get(nearestKey) ?? null
  }

  const template = buildRouteTemplate(data, nearestKey)
  data.routeTemplates.set(nearestKey, template)
  return template
}

function makeWalkLeg(
  from: { name: string; lat: number; lon: number },
  to: { name: string; lat: number; lon: number },
  dist: number
): Leg {
  return {
    mode: "WALK",
    from,
    to,
    duration: Math.round(dist / WALK_SPEED_MS),
    distance: Math.round(dist),
    legGeometry: {
      points: "",
      coords: [
        [from.lon, from.lat],
        [to.lon, to.lat],
      ],
    },
  }
}

export function reconstructRoute(
  data: RoutingData,
  destLat: number,
  destLon: number,
  nearestKey: string | null = findNearestStop(data, destLat, destLon)
): Itinerary | null {
  if (!nearestKey) return null
  const template = getRouteTemplate(data, nearestKey)
  if (!template) return null

  const legs = template.baseLegs.slice()
  const destDist = distMeters(template.tailFrom.lat, template.tailFrom.lon, destLat, destLon)
  if (destDist > 10) {
    legs.push(
      makeWalkLeg(
        {
          name: template.tailFrom.name,
          lat: template.tailFrom.lat,
          lon: template.tailFrom.lon,
        },
        { name: "", lat: destLat, lon: destLon },
        destDist
      )
    )
  }

  if (legs.length === 0) return null

  return {
    duration: template.tailFrom.time + Math.round(destDist / WALK_SPEED_MS),
    walkDistance:
      template.baseWalkDistance + (destDist > 10 ? Math.round(destDist) : 0),
    transfers: template.transfers,
    legs,
  }
}
