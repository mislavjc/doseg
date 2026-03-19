/**
 * Serialize the OTP transit graph + BAJS stations to JSON for Rust scoring.
 *
 * Usage: bun scripts/dump-transit-graph.ts [--day DAYNAME]
 *
 * Writes data/transit-graph.json with the structure needed by scoring/src/transit_graph.rs.
 */

import { writeFileSync } from "fs"
import { join } from "path"
import { getGraph, type TransitGraph } from "../lib/transit-graph"
import { bajsStationKey } from "../lib/bajs"

const STATION_INFORMATION_URL =
  "https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_hd/hr/station_information.json"

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

function nextDateForDay(day: DayName): string {
  const targetIdx = VALID_DAYS.indexOf(day)
  const today = new Date()
  const todayIdx = today.getDay()
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
  let day: DayName | undefined

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--day" && args[i + 1]) {
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

  const serviceDate = day ? nextDateForDay(day) : undefined
  return { day, serviceDate }
}

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

async function fetchBajsStations() {
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
    }))
}

function serializeGraph(graph: TransitGraph) {
  const stops = [...graph.stops.values()].map((s) => ({
    lat: s.lat,
    lon: s.lon,
    key: s.key,
    name: s.name,
    idx: s.idx,
    patterns: s.patterns,
    nearbyStopIndices: s.nearbyStopIndices,
  }))

  const patterns = graph.patterns.map((p) => ({
    stopIndices: p.stopIndices,
    mode: p.mode,
    route: p.route,
    departures: p.departures,
    stopOffsets: p.stopOffsets,
  }))

  return { stops, patterns, stopCount: graph.stopCount }
}

async function main() {
  const { day, serviceDate } = parseArgs()

  if (day) {
    console.error(`Day: ${day} (service date: ${serviceDate})`)
  }

  console.error("Building transit graph from OTP...")
  const graph = await getGraph(serviceDate)
  console.error(
    `  ${graph.patterns.length} patterns, ${graph.stops.size} stops`
  )

  console.error("Fetching BAJS station locations...")
  const bajsStations = await fetchBajsStations()
  console.error(`  ${bajsStations.length} stations`)

  const output = {
    ...serializeGraph(graph),
    bajsStations,
    ...(day ? { day, serviceDate } : {}),
  }

  const outPath = join(process.cwd(), "data/transit-graph.json")
  writeFileSync(outPath, JSON.stringify(output))
  console.error(`Written to ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
