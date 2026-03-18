/**
 * Batch-compute transit reachability scores for each Zagreb city district.
 *
 * For every point on a regular grid that falls within a populated area
 * (determined by OSM building footprints), runs transit Dijkstra + walking
 * expansion and counts reachable street-network nodes within the time limit.
 * Points are assigned to districts via point-in-polygon, then averaged.
 *
 * Requires OTP to be running (docker compose up otp).
 *
 * Usage: bun scripts/score-districts.ts [--time HH:MM] [--grid METERS] [--minutes N] [--day DAYNAME]
 *
 * --day accepts a day of the week (monday, tuesday, ..., sunday).
 * When set, the OTP query filters trips to the GTFS service calendar for that day,
 * giving correct weekday vs weekend schedules. Output includes the day in the filename.
 */

import { createReadStream, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { Worker } from "worker_threads"
import { cpus } from "os"

import {
  getGraph,
  computeAvgTravelTimes,
  KM_PER_DEG_LAT,
  KM_PER_DEG_LON,
} from "../lib/transit-graph"
import { fastDistKm } from "../lib/geo"
import { getWalkGraph } from "../lib/walk-graph"
import { countReachableCells } from "../lib/walk-expand"
import type { BajsStation } from "../lib/bajs"
import { bajsStationKey } from "../lib/bajs"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const createParser = require("osm-pbf-parser")
// eslint-disable-next-line @typescript-eslint/no-require-imports
const through2 = require("through2")

const OSM_PBF = "data/osm/croatia.osm.pbf"

const BBOX = {
  minLat: 45.7,
  maxLat: 45.92,
  minLon: 15.75,
  maxLon: 16.2,
}

// Grid cell size for populated-area lookup (~300m)
const POP_CELL = 0.003

// Departure time windows for multi-departure averaging
const MORNING_DEPARTURES = [
  7 * 3600 + 30 * 60, // 07:30
  7 * 3600 + 45 * 60, // 07:45
  8 * 3600, // 08:00
  8 * 3600 + 15 * 60, // 08:15
  8 * 3600 + 30 * 60, // 08:30
]

const EVENING_DEPARTURES = [
  20 * 3600 + 30 * 60, // 20:30
  20 * 3600 + 45 * 60, // 20:45
  21 * 3600, // 21:00
  21 * 3600 + 15 * 60, // 21:15
  21 * 3600 + 30 * 60, // 21:30
]

// --- CLI args ---

const VALID_DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const
type DayName = (typeof VALID_DAYS)[number]

/** Find the next occurrence of the given day of the week from today. Returns YYYY-MM-DD. */
function nextDateForDay(day: DayName): string {
  const targetIdx = VALID_DAYS.indexOf(day)
  const today = new Date()
  const todayIdx = today.getDay() // 0=Sunday
  let daysAhead = targetIdx - todayIdx
  if (daysAhead <= 0) daysAhead += 7
  const target = new Date(today)
  target.setDate(today.getDate() + daysAhead)
  const yyyy = target.getFullYear()
  const mm = String(target.getMonth() + 1).padStart(2, "0")
  const dd = String(target.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function parseArgs() {
  const args = process.argv.slice(2)
  let time = "08:00"
  let gridM = 200
  let minutes = 30
  let workers = Math.max(1, cpus().length - 1)
  let day: DayName | undefined

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--time" && args[i + 1]) time = args[++i]
    else if (args[i] === "--grid" && args[i + 1]) gridM = parseInt(args[++i])
    else if (args[i] === "--minutes" && args[i + 1])
      minutes = parseInt(args[++i])
    else if (args[i] === "--workers" && args[i + 1])
      workers = parseInt(args[++i])
    else if (args[i] === "--day" && args[i + 1]) {
      const val = args[++i].toLowerCase() as DayName
      if (!VALID_DAYS.includes(val)) {
        console.error(
          `Invalid --day value: "${val}". Expected one of: ${VALID_DAYS.join(", ")}`
        )
        process.exit(1)
      }
      day = val
    }
  }

  const [h, m] = time.split(":").map(Number)
  const departureSeconds = h * 3600 + m * 60

  // Compute GTFS service date when --day is specified
  const serviceDate = day ? nextDateForDay(day) : undefined

  return { time, gridM, minutes, departureSeconds, workers, day, serviceDate }
}

// --- Building extraction from OSM PBF ---

interface OsmItem {
  type: "node" | "way" | "relation"
  id: number
  lat?: number
  lon?: number
  tags?: Record<string, string>
  refs?: number[]
}

/**
 * Parse the OSM PBF and return a set of grid cell keys that contain
 * at least one building. This filters sample points to populated areas,
 * preventing empty fields and forests from diluting district scores.
 */
async function extractPopulatedCells(): Promise<Set<string>> {
  const nodeCoords = new Map<number, { lat: number; lon: number }>()
  const cells = new Set<string>()

  await new Promise<void>((resolve, reject) => {
    createReadStream(OSM_PBF)
      .pipe(createParser())
      .pipe(
        through2.obj((items: OsmItem[], _enc: string, next: () => void) => {
          for (const item of items) {
            if (item.type === "node") {
              const { lat, lon } = item as { lat: number; lon: number }
              if (
                lat >= BBOX.minLat &&
                lat <= BBOX.maxLat &&
                lon >= BBOX.minLon &&
                lon <= BBOX.maxLon
              ) {
                nodeCoords.set(item.id, { lat, lon })
              }
            } else if (item.type === "way" && item.tags?.building) {
              // Compute centroid of building footprint
              let sLat = 0,
                sLon = 0,
                n = 0
              for (const ref of item.refs ?? []) {
                const c = nodeCoords.get(ref)
                if (c) {
                  sLat += c.lat
                  sLon += c.lon
                  n++
                }
              }
              if (n > 0) {
                cells.add(
                  `${Math.floor(sLon / n / POP_CELL)},${Math.floor(sLat / n / POP_CELL)}`
                )
              }
            }
          }
          next()
        })
      )
      .on("finish", resolve)
      .on("error", reject)
  })

  return cells
}

/** Check if a point is in or adjacent to a populated grid cell. */
function isPopulated(lat: number, lon: number, cells: Set<string>): boolean {
  const cx = Math.floor(lon / POP_CELL)
  const cy = Math.floor(lat / POP_CELL)
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (cells.has(`${cx + dx},${cy + dy}`)) return true
    }
  }
  return false
}

// --- District loading ---

interface District {
  name: string
  osmId: number
  population?: number
  ring: [number, number][] // GeoJSON [lon, lat]
}

function loadDistricts(): District[] {
  const raw = readFileSync(
    join(process.cwd(), "data/districts.geojson"),
    "utf-8"
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const geojson = JSON.parse(raw) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return geojson.features.map((f: any) => ({
    name: f.properties.name as string,
    osmId: f.properties.osmId as number,
    population: f.properties.population as number | undefined,
    ring:
      f.geometry.type === "Polygon"
        ? f.geometry.coordinates[0]
        : f.geometry.coordinates[0][0],
  }))
}

// --- Point-in-polygon (ray casting) ---

function pointInPolygon(
  lon: number,
  lat: number,
  ring: [number, number][]
): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside
    }
  }
  return inside
}

// --- Sample grid ---

interface SamplePoint {
  lat: number
  lon: number
  districtIdx: number
}

function generateSamplePoints(
  districts: District[],
  gridSpacingKm: number,
  populatedCells: Set<string>
): SamplePoint[] {
  const latStep = gridSpacingKm / KM_PER_DEG_LAT
  const lonStep = gridSpacingKm / KM_PER_DEG_LON

  let minLat = Infinity,
    maxLat = -Infinity
  let minLon = Infinity,
    maxLon = -Infinity
  for (const d of districts) {
    for (const [lon, lat] of d.ring) {
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
      if (lon < minLon) minLon = lon
      if (lon > maxLon) maxLon = lon
    }
  }

  let skippedUnpopulated = 0
  const points: SamplePoint[] = []

  for (let lat = minLat; lat <= maxLat; lat += latStep) {
    for (let lon = minLon; lon <= maxLon; lon += lonStep) {
      if (!isPopulated(lat, lon, populatedCells)) {
        skippedUnpopulated++
        continue
      }
      for (let i = 0; i < districts.length; i++) {
        if (pointInPolygon(lon, lat, districts[i].ring)) {
          points.push({ lat, lon, districtIdx: i })
          break
        }
      }
    }
  }

  console.error(
    `  ${skippedUnpopulated} grid points skipped (no buildings nearby)`
  )

  return points
}

// --- BAJS station loading ---

const STATION_INFORMATION_URL =
  "https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_hd/hr/station_information.json"

interface StationInfoFeed {
  data?: {
    stations?: Array<{
      station_id: string
      name: string
      short_name?: string
      lat: number
      lon: number
      is_virtual_station?: boolean
      capacity?: number
    }>
  }
}

/** Fetch station locations and return idealized BajsStations (1 bike, 1 dock each). */
async function fetchIdealBajsStations(): Promise<BajsStation[]> {
  const res = await fetch(STATION_INFORMATION_URL)
  if (!res.ok) throw new Error(`BAJS feed: ${res.status}`)
  const feed = (await res.json()) as StationInfoFeed
  const stations = feed.data?.stations
  if (!stations) throw new Error("BAJS feed returned no station data")

  return stations
    .filter((s) => !s.is_virtual_station)
    .map((s) => ({
      key: bajsStationKey(s.station_id),
      stationId: s.station_id,
      shortName: s.short_name ?? "",
      name: s.name,
      lat: s.lat,
      lon: s.lon,
      capacity: s.capacity ?? 10,
      bikesAvailable: 1,
      docksAvailable: 1,
      isInstalled: true,
      isRenting: true,
      isReturning: true,
      lastReported: Math.floor(Date.now() / 1000),
    }))
}

// --- Main ---

async function main() {
  const {
    time,
    gridM,
    minutes,
    departureSeconds,
    workers: numWorkers,
    day,
    serviceDate,
  } = parseArgs()
  const maxSeconds = minutes * 60

  if (day) {
    console.error(`Day: ${day} (service date: ${serviceDate})`)
  }

  console.error("Extracting building footprints from OSM...")
  const populatedCells = await extractPopulatedCells()
  console.error(`  ${populatedCells.size} populated grid cells`)

  console.error("Loading walk graph...")
  const walkGraph = getWalkGraph()
  console.error(
    `  ${walkGraph.nodeCount.toLocaleString()} nodes, ${walkGraph.edgeCount.toLocaleString()} edges`
  )

  console.error("Building transit graph from OTP...")
  const transitGraph = await getGraph(serviceDate)
  console.error(
    `  ${transitGraph.patterns.length} patterns, ${transitGraph.stops.size} stops`
  )

  console.error("Fetching BAJS station locations...")
  const bajsStations = await fetchIdealBajsStations()
  console.error(
    `  ${bajsStations.length} stations (idealized: 1 bike, 1 dock each)`
  )

  // Build merged stop+station coordinate map for BAJS walk expansion
  const bajsStopMap = new Map<string, { lat: number; lon: number }>()
  for (const [key, stop] of transitGraph.stops) {
    bajsStopMap.set(key, { lat: stop.lat, lon: stop.lon })
  }
  for (const station of bajsStations) {
    bajsStopMap.set(station.key, { lat: station.lat, lon: station.lon })
  }

  console.error("Loading districts...")
  const districts = loadDistricts()
  console.error(`  ${districts.length} districts`)

  // Count BAJS stations per district
  const districtBajsStationCount: number[] = districts.map(() => 0)
  for (const station of bajsStations) {
    for (let i = 0; i < districts.length; i++) {
      if (pointInPolygon(station.lon, station.lat, districts[i].ring)) {
        districtBajsStationCount[i]++
        break
      }
    }
  }

  // Compute per-district transit metadata
  console.error("Computing transit info per district...")
  interface TransitInfo {
    tramLines: string[]
    busLines: string[]
    trainLines: string[]
    stops: number
    medianHeadwayMin: number
  }
  const districtTransit: TransitInfo[] = districts.map(() => ({
    tramLines: [],
    busLines: [],
    trainLines: [],
    stops: 0,
    medianHeadwayMin: 0,
  }))

  // Assign each transit stop to a district
  const stopToDistrict = new Map<string, number>()
  for (const [key, stop] of transitGraph.stops) {
    for (let i = 0; i < districts.length; i++) {
      if (pointInPolygon(stop.lon, stop.lat, districts[i].ring)) {
        stopToDistrict.set(key, i)
        break
      }
    }
  }

  // Aggregate routes and headways per district
  for (let di = 0; di < districts.length; di++) {
    const tramRoutes = new Set<string>()
    const busRoutes = new Set<string>()
    const trainRoutes = new Set<string>()
    const headways: number[] = []
    let stopCount = 0

    for (const [key, idx] of stopToDistrict) {
      if (idx !== di) continue
      stopCount++

      const stop = transitGraph.stops.get(key)!
      // Track which patterns we've already counted for this district
      const seenPatterns = new Set<number>()

      for (const { patternIdx, stopIdx } of stop.patterns) {
        const pattern = transitGraph.patterns[patternIdx]

        if (pattern.mode === "TRAM") tramRoutes.add(pattern.route)
        else if (pattern.mode === "RAIL") trainRoutes.add(pattern.route)
        else busRoutes.add(pattern.route)

        // Compute headway for this pattern at this stop (if not seen)
        if (!seenPatterns.has(patternIdx)) {
          seenPatterns.add(patternIdx)
          const offset = pattern.stopOffsets[stopIdx]
          const target = departureSeconds - offset
          // Find departures in ±30min window
          const windowDeps: number[] = []
          for (const dep of pattern.departures) {
            if (dep >= target - 1800 && dep <= target + 1800) {
              windowDeps.push(dep)
            }
          }
          if (windowDeps.length >= 2) {
            const hw =
              (windowDeps[windowDeps.length - 1] - windowDeps[0]) /
              (windowDeps.length - 1)
            headways.push(hw)
          }
        }
      }
    }

    // Median headway
    headways.sort((a, b) => a - b)
    const medianHw =
      headways.length > 0 ? headways[Math.floor(headways.length / 2)] : 0

    districtTransit[di] = {
      tramLines: [...tramRoutes].sort((a, b) => parseInt(a) - parseInt(b)),
      busLines: [...busRoutes].sort((a, b) => parseInt(a) - parseInt(b)),
      trainLines: [...trainRoutes].sort(),
      stops: stopCount,
      medianHeadwayMin: Math.round(medianHw / 60),
    }
  }
  console.error(`  ${stopToDistrict.size} stops assigned to districts`)

  console.error("Generating sample grid...")
  const points = generateSamplePoints(districts, gridM / 1000, populatedCells)
  console.error(`  ${points.length} sample points in populated areas`)

  // --- Transit desert metrics: distance to nearest stop per sample point ---
  console.error("Computing transit desert metrics...")
  const DETOUR_FACTOR = 1.3 // walking distance ≈ 1.3× air distance
  const DESERT_THRESHOLD_KM = 0.5 / DETOUR_FACTOR // 500m walking ≈ 385m air
  const stopCoords = [...transitGraph.stops.values()].map((s) => ({
    lat: s.lat,
    lon: s.lon,
  }))
  const districtDesertCount: number[] = districts.map(() => 0)
  const districtNearestSum: number[] = districts.map(() => 0)
  const districtPointCount: number[] = districts.map(() => 0)

  for (const point of points) {
    let minDistKm = Infinity
    for (const stop of stopCoords) {
      const d = fastDistKm(point.lat, point.lon, stop.lat, stop.lon)
      if (d < minDistKm) minDistKm = d
    }
    districtPointCount[point.districtIdx]++
    districtNearestSum[point.districtIdx] += minDistKm * 1000
    if (minDistKm > DESERT_THRESHOLD_KM) {
      districtDesertCount[point.districtIdx]++
    }
  }

  const totalDesertPoints = districtDesertCount.reduce((a, b) => a + b, 0)
  console.error(
    `  ${totalDesertPoints} of ${points.length} points (${Math.round((totalDesertPoints / points.length) * 100)}%) are >500m from nearest stop`
  )

  // --- Parallel scoring with worker threads ---

  console.error(`\nSpawning ${numWorkers} scoring workers...`)

  const workerPool: Worker[] = []
  const readyPromises: Promise<void>[] = []
  for (let i = 0; i < numWorkers; i++) {
    const w = new Worker(join(import.meta.dir, "score-worker.ts"))
    workerPool.push(w)
    w.on("error", (err) => {
      console.error(`Worker ${i} error:`, err)
      process.exit(1)
    })
    readyPromises.push(
      new Promise<void>((resolve) => {
        w.once("message", (msg) => {
          if (msg.type === "ready") resolve()
        })
      })
    )
    w.postMessage({
      type: "init",
      graph: transitGraph,
      bajsStations,
      bajsStopMap,
    })
  }
  await Promise.all(readyPromises)
  console.error(`  ${numWorkers} workers ready (each loaded walk graph)`)

  type PassResult = {
    scores: number[][]
    best: { reached: number; lat: number; lon: number }[]
  }

  async function parallelScoringPass(
    label: string,
    opts: {
      departureTimes: number[]
      useBajs?: boolean
      excludeModes?: string[]
    }
  ): Promise<PassResult> {
    const scores: number[][] = districts.map(() => [])
    const best = districts.map(() => ({ reached: -1, lat: 0, lon: 0 }))

    // Partition points across workers
    const chunkSize = Math.ceil(points.length / numWorkers)
    const chunks: SamplePoint[][] = []
    for (let i = 0; i < numWorkers; i++) {
      chunks.push(points.slice(i * chunkSize, (i + 1) * chunkSize))
    }

    const t = performance.now()
    console.error(
      `${label} (${opts.departureTimes.length} departures × ${numWorkers} workers)`
    )

    let doneWorkers = 0
    const resultPromises = chunks.map(
      (chunk, i) =>
        new Promise<number[]>((resolve) => {
          const handler = (msg: { type: string; scores?: number[] }) => {
            if (msg.type === "result") {
              workerPool[i].off("message", handler)
              doneWorkers++
              const elapsed = ((performance.now() - t) / 1000).toFixed(1)
              process.stderr.write(
                `\r  ${doneWorkers}/${numWorkers} workers done (${elapsed}s)`
              )
              resolve(msg.scores!)
            }
          }
          workerPool[i].on("message", handler)
          workerPool[i].postMessage({
            type: "batch",
            points: chunk,
            departureTimes: opts.departureTimes,
            maxSeconds,
            useBajs: opts.useBajs ?? false,
            excludeModes: opts.excludeModes ?? null,
          })
        })
    )

    const results = await Promise.all(resultPromises)
    console.error()

    // Merge worker results into per-district arrays
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci]
      const chunkScores = results[ci]
      for (let j = 0; j < chunk.length; j++) {
        const point = chunk[j]
        const reached = chunkScores[j]
        scores[point.districtIdx].push(reached)
        if (reached > best[point.districtIdx].reached) {
          best[point.districtIdx] = {
            reached,
            lat: point.lat,
            lon: point.lon,
          }
        }
      }
    }

    return { scores, best }
  }

  const t0 = performance.now()

  // --- Pass 1: Bus+tram only (no rail, no BAJS) → base score ---
  const pass1 = await parallelScoringPass(
    "Pass 1/4: Scoring bus+tram only...",
    { departureTimes: MORNING_DEPARTURES, excludeModes: ["RAIL"] }
  )

  // --- Pass 2: Bus+tram+train (no BAJS) → train boost ---
  const pass2 = await parallelScoringPass(
    "Pass 2/4: Scoring bus+tram+train...",
    { departureTimes: MORNING_DEPARTURES }
  )

  // --- Pass 3: Bus+tram+train+BAJS → BAJS boost ---
  const pass3 = await parallelScoringPass(
    "Pass 3/4: Scoring bus+tram+train+BAJS...",
    { departureTimes: MORNING_DEPARTURES, useBajs: true }
  )

  // --- Pass 4: Evening off-peak bus+tram only → peak vs off-peak gap ---
  const pass4 = await parallelScoringPass(
    "Pass 4/4: Scoring evening off-peak...",
    { departureTimes: EVENING_DEPARTURES, excludeModes: ["RAIL"] }
  )

  // Aggregate per district
  function avgScore(scores: number[]): number {
    return scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0
  }

  function stddev(scores: number[], avg: number): number {
    if (scores.length < 2) return 0
    const variance =
      scores.reduce((s, v) => s + (v - avg) ** 2, 0) / scores.length
    return Math.sqrt(variance)
  }

  function median(scores: number[]): number {
    if (scores.length === 0) return 0
    const sorted = [...scores].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 1
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2
  }

  function percentile(scores: number[], p: number): number {
    if (scores.length === 0) return 0
    const sorted = [...scores].sort((a, b) => a - b)
    const idx = (p / 100) * (sorted.length - 1)
    const lo = Math.floor(idx)
    const hi = Math.ceil(idx)
    if (lo === hi) return sorted[lo]
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
  }

  function boostPct(base: number, boosted: number): number {
    return base > 0 ? Math.round(((boosted - base) / base) * 100) : 0
  }

  const results = districts.map((d, i) => {
    const baseAvg = avgScore(pass1.scores[i])
    const trainAvg = avgScore(pass2.scores[i])
    const bajsAvg = avgScore(pass3.scores[i])
    const eveningAvg = avgScore(pass4.scores[i])
    const baseScores = pass1.scores[i]
    const best = pass2.best[i] // best point from full transit (with trains)
    const transit = districtTransit[i]
    const peakOffpeakDrop =
      baseAvg > 0 ? Math.round(((baseAvg - eveningAvg) / baseAvg) * 100) : 0
    return {
      name: d.name,
      osmId: d.osmId,
      population: d.population,
      sampleCount: baseScores.length,
      avgReachableCells: Math.round(baseAvg),
      minReachableCells:
        baseScores.length > 0
          ? baseScores.reduce((m, v) => Math.min(m, v), Infinity)
          : 0,
      maxReachableCells:
        baseScores.length > 0
          ? baseScores.reduce((m, v) => Math.max(m, v), -Infinity)
          : 0,
      stddevReachableCells: Math.round(stddev(baseScores, baseAvg)),
      medianReachableCells: Math.round(median(baseScores)),
      p25ReachableCells: Math.round(percentile(baseScores, 25)),
      p75ReachableCells: Math.round(percentile(baseScores, 75)),
      eveningAvgReachableCells: Math.round(eveningAvg),
      peakOffpeakDrop,
      trainAvgReachableCells: Math.round(trainAvg),
      trainBoostPct: boostPct(baseAvg, trainAvg),
      bajsAvgReachableCells: Math.round(bajsAvg),
      bajsBoostPct: boostPct(trainAvg, bajsAvg),
      bajsStations: districtBajsStationCount[i],
      desertPct:
        districtPointCount[i] > 0
          ? Math.round((districtDesertCount[i] / districtPointCount[i]) * 100)
          : 0,
      avgNearestStopM:
        districtPointCount[i] > 0
          ? Math.round(districtNearestSum[i] / districtPointCount[i])
          : 0,
      bestPoint: { lat: +best.lat.toFixed(4), lon: +best.lon.toFixed(4) },
      tramLines: transit.tramLines,
      busLines: transit.busLines,
      trainLines: transit.trainLines,
      stops: transit.stops,
      medianHeadwayMin: transit.medianHeadwayMin,
    }
  })

  // Sort descending by base score
  results.sort((a, b) => b.avgReachableCells - a.avgReachableCells)

  // Normalize to 0-100 scale
  const maxScore = results[0]?.avgReachableCells || 1
  const ranked = results.map((r, i) => ({
    ...r,
    rank: i + 1,
    score: Math.round((r.avgReachableCells / maxScore) * 100),
  }))

  const output = {
    generatedAt: new Date().toISOString(),
    ...(day ? { day, serviceDate } : {}),
    departureWindow: "07:30-08:30",
    eveningWindow: "20:30-21:30",
    departureCount: MORNING_DEPARTURES.length,
    gridSpacingM: gridM,
    maxMinutes: minutes,
    totalSamplePoints: points.length,
    totalGridCells: walkGraph.grid.size,
    bajsTotalStations: bajsStations.length,
    cityDesertPct: Math.round((totalDesertPoints / points.length) * 100),
    districts: ranked,
  }

  // Terminate workers
  for (const w of workerPool) w.terminate()

  const outFile = day
    ? `district-scores-${day}.json`
    : "district-scores.json"
  const outPath = join(process.cwd(), `data/${outFile}`)
  writeFileSync(outPath, JSON.stringify(output, null, 2))

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
  console.error(`\nDone in ${elapsed}s → ${outPath}`)

  // Print summary table
  console.error(
    `\n${"#".padStart(3)}  ${"District".padEnd(28)} Score  Cells  ±Std   Eve  Drop  Desert`
  )
  console.error("─".repeat(88))
  for (const d of ranked) {
    const dropStr = d.peakOffpeakDrop > 0 ? `-${d.peakOffpeakDrop}%` : "—"
    const desertStr = d.desertPct > 0 ? `${d.desertPct}%` : "—"
    console.error(
      `${d.rank.toString().padStart(3)}  ${d.name.padEnd(28)} ${d.score.toString().padStart(3)}  ${d.avgReachableCells.toString().padStart(5)}  ${d.stddevReachableCells.toString().padStart(4)}  ${d.eveningAvgReachableCells.toString().padStart(4)}  ${dropStr.padStart(4)}  ${desertStr.padStart(5)}`
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
