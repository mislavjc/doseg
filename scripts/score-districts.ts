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
 * Usage: bun scripts/score-districts.ts [--time HH:MM] [--grid METERS] [--minutes N]
 */

import { createReadStream, readFileSync, writeFileSync } from "fs"
import { join } from "path"

import {
  getGraph,
  computeAvgTravelTimes,
  KM_PER_DEG_LAT,
  KM_PER_DEG_LON,
} from "../lib/transit-graph"
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

// --- CLI args ---

function parseArgs() {
  const args = process.argv.slice(2)
  let time = "08:00"
  let gridM = 200
  let minutes = 30

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--time" && args[i + 1]) time = args[++i]
    else if (args[i] === "--grid" && args[i + 1]) gridM = parseInt(args[++i])
    else if (args[i] === "--minutes" && args[i + 1])
      minutes = parseInt(args[++i])
  }

  const [h, m] = time.split(":").map(Number)
  const departureSeconds = h * 3600 + m * 60

  return { time, gridM, minutes, departureSeconds }
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
  const { time, gridM, minutes, departureSeconds } = parseArgs()
  const maxSeconds = minutes * 60

  console.error("Extracting building footprints from OSM...")
  const populatedCells = await extractPopulatedCells()
  console.error(`  ${populatedCells.size} populated grid cells`)

  console.error("Loading walk graph...")
  const walkGraph = getWalkGraph()
  console.error(
    `  ${walkGraph.nodeCount.toLocaleString()} nodes, ${walkGraph.edgeCount.toLocaleString()} edges`
  )

  console.error("Building transit graph from OTP...")
  const transitGraph = await getGraph()
  console.error(
    `  ${transitGraph.patterns.length} patterns, ${transitGraph.stops.size} stops`
  )

  console.error("Fetching BAJS station locations...")
  const bajsStations = await fetchIdealBajsStations()
  console.error(`  ${bajsStations.length} stations (idealized: 1 bike, 1 dock each)`)

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
    stops: number
    avgHeadwayMin: number
  }
  const districtTransit: TransitInfo[] = districts.map(() => ({
    tramLines: [],
    busLines: [],
    stops: 0,
    avgHeadwayMin: 0,
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

        // Deduplicate routes by shortName
        if (pattern.mode === "TRAM") tramRoutes.add(pattern.route)
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
      stops: stopCount,
      avgHeadwayMin: Math.round(medianHw / 60),
    }
  }
  console.error(`  ${stopToDistrict.size} stops assigned to districts`)

  console.error("Generating sample grid...")
  const points = generateSamplePoints(districts, gridM / 1000, populatedCells)
  console.error(`  ${points.length} sample points in populated areas`)

  // Pre-allocate reusable buffer for walking Dijkstra
  const walkBuf = new Float64Array(walkGraph.nodeCount)

  // --- Pass 1: Transit-only scores ---
  const districtScores: number[][] = districts.map(() => [])
  const districtBest: { reached: number; lat: number; lon: number }[] =
    districts.map(() => ({ reached: -1, lat: 0, lon: 0 }))
  const t0 = performance.now()

  console.error("Pass 1/2: Scoring transit-only...")
  for (let i = 0; i < points.length; i++) {
    const point = points[i]

    const times = computeAvgTravelTimes(
      transitGraph,
      point.lat,
      point.lon,
      departureSeconds,
      maxSeconds
    )

    const reached = countReachableCells(
      walkGraph,
      times,
      transitGraph.stops,
      point.lat,
      point.lon,
      maxSeconds,
      walkBuf
    )

    districtScores[point.districtIdx].push(reached)

    if (reached > districtBest[point.districtIdx].reached) {
      districtBest[point.districtIdx] = {
        reached,
        lat: point.lat,
        lon: point.lon,
      }
    }

    if ((i + 1) % 50 === 0 || i + 1 === points.length) {
      const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
      const rate = ((i + 1) / ((performance.now() - t0) / 1000)).toFixed(1)
      process.stderr.write(
        `\r  ${i + 1}/${points.length} scored (${elapsed}s, ${rate} pts/s)`
      )
    }
  }
  console.error()

  // --- Pass 2: Transit + BAJS scores ---
  const districtBajsScores: number[][] = districts.map(() => [])
  const t1 = performance.now()

  console.error("Pass 2/2: Scoring transit + BAJS...")
  for (let i = 0; i < points.length; i++) {
    const point = points[i]

    const times = computeAvgTravelTimes(
      transitGraph,
      point.lat,
      point.lon,
      departureSeconds,
      maxSeconds,
      bajsStations
    )

    const reached = countReachableCells(
      walkGraph,
      times,
      bajsStopMap,
      point.lat,
      point.lon,
      maxSeconds,
      walkBuf
    )

    districtBajsScores[point.districtIdx].push(reached)

    if ((i + 1) % 50 === 0 || i + 1 === points.length) {
      const elapsed = ((performance.now() - t1) / 1000).toFixed(1)
      const rate = ((i + 1) / ((performance.now() - t1) / 1000)).toFixed(1)
      process.stderr.write(
        `\r  ${i + 1}/${points.length} scored (${elapsed}s, ${rate} pts/s)`
      )
    }
  }
  console.error()

  // Aggregate per district
  const results = districts.map((d, i) => {
    const scores = districtScores[i]
    const bajsScoresArr = districtBajsScores[i]
    const avg =
      scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
    const bajsAvg =
      bajsScoresArr.length > 0
        ? bajsScoresArr.reduce((a, b) => a + b, 0) / bajsScoresArr.length
        : 0
    const best = districtBest[i]
    const transit = districtTransit[i]
    return {
      name: d.name,
      osmId: d.osmId,
      population: d.population,
      sampleCount: scores.length,
      avgReachableCells: Math.round(avg),
      bajsAvgReachableCells: Math.round(bajsAvg),
      bajsBoostPct: avg > 0 ? Math.round(((bajsAvg - avg) / avg) * 100) : 0,
      bajsStations: districtBajsStationCount[i],
      bestPoint: { lat: +best.lat.toFixed(4), lon: +best.lon.toFixed(4) },
      tramLines: transit.tramLines,
      busLines: transit.busLines,
      stops: transit.stops,
      avgHeadwayMin: transit.avgHeadwayMin,
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
    departureTime: time,
    gridSpacingM: gridM,
    maxMinutes: minutes,
    totalSamplePoints: points.length,
    totalGridCells: walkGraph.grid.size,
    bajsTotalStations: bajsStations.length,
    districts: ranked,
  }

  const outPath = join(process.cwd(), "data/district-scores.json")
  writeFileSync(outPath, JSON.stringify(output, null, 2))

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
  console.error(`\nDone in ${elapsed}s → ${outPath}`)

  // Print summary table
  console.error(
    `\n${"#".padStart(3)}  ${"District".padEnd(28)} Score  Cells  BAJS   Boost`
  )
  console.error("─".repeat(64))
  for (const d of ranked) {
    console.error(
      `${d.rank.toString().padStart(3)}  ${d.name.padEnd(28)} ${d.score.toString().padStart(3)}  ${d.avgReachableCells.toString().padStart(5)}  ${d.bajsAvgReachableCells.toString().padStart(5)}  +${d.bajsBoostPct}%`
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
