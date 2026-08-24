import { formatStationName } from "@/lib/bajs-station-name"
import type {
  BajsRankedStation,
  BajsRankingResponse,
  BajsRideDay,
  BajsRideHour,
  BajsRidesResponse,
} from "@/lib/generated"

/**
 * Server-side reader for the measured BAJS ride flow.
 *
 * The isochrone server diffs consecutive per-bike GBFS snapshots, so `starts`
 * and `returns` are counted events. That is a different thing from the older
 * `bajs_usage` series, where `bikes_in_use` and `known_fleet` are inferred from
 * a rolling 24 h maximum and must never be presented as ride counts.
 *
 * Every reader returns null rather than throwing, so a page renders its
 * accumulating/unavailable state when the RT server is down.
 */

const ISOCHRONE_URL = process.env.ISOCHRONE_URL || "http://localhost:3002"

/** Matches the endpoints' own Cache-Control. */
const REVALIDATE_SEC = 300

/**
 * A day is only worth quoting if we saw nearly all of it. Below this the total
 * is a floor, not a count, so headline copy must skip it.
 */
export const FULL_DAY_MINUTES = 1400

/**
 * Ranking order below this much measurement is noise: a single event weekend
 * can invert the top ten. Gate any published ranking on it.
 */
export const RANKING_MIN_DAYS = 14

async function readJson<T>(
  path: string,
  revalidate = REVALIDATE_SEC
): Promise<T | null> {
  try {
    const res = await fetch(`${ISOCHRONE_URL}${path}`, {
      next: { revalidate },
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export type BajsRides = {
  /** Complete days only, oldest first. */
  fullDays: BajsRideDay[]
  /** Today so far, or null when the current day has barely started. */
  partialDay: BajsRideDay | null
  /** Mean rides on a complete day. Null until at least one day is complete. */
  avgPerDay: number | null
  /** The busiest complete day measured. */
  busiestDay: BajsRideDay | null
  /** 0-23 profile, only hours seen on at least one well-observed day. */
  hourly: BajsRideHour[]
  /** Busiest hour of the day by mean rides started. */
  peakHour: BajsRideHour | null
  /** Busiest hour before noon, which is a separate story from the peak. */
  morningPeak: BajsRideHour | null
  measuredFrom: Date | null
  measuredTo: Date | null
}

export async function loadBajsRides(days = 30): Promise<BajsRides | null> {
  const data = await readJson<BajsRidesResponse>(
    `/api/rt/bajs-rides?days=${days}`
  )
  if (!data) return null

  const complete = data.days.filter((d) => d.minutes >= FULL_DAY_MINUTES)
  const last = data.days.at(-1)
  const partialDay = last && last.minutes < FULL_DAY_MINUTES ? last : null

  const avgPerDay = complete.length
    ? complete.reduce((sum, d) => sum + d.starts, 0) / complete.length
    : null

  const busiestDay = complete.length
    ? complete.reduce((best, d) => (d.starts > best.starts ? d : best))
    : null

  const hourly = data.hourly
  const peakHour = hourly.length
    ? hourly.reduce((best, h) => (h.avgStarts > best.avgStarts ? h : best))
    : null
  const morning = hourly.filter((h) => h.hour < 12)
  const morningPeak = morning.length
    ? morning.reduce((best, h) => (h.avgStarts > best.avgStarts ? h : best))
    : null

  return {
    fullDays: complete,
    partialDay,
    avgPerDay,
    busiestDay,
    hourly,
    peakHour,
    morningPeak,
    measuredFrom: data.measuredFrom ? new Date(data.measuredFrom * 1000) : null,
    measuredTo: data.measuredTo ? new Date(data.measuredTo * 1000) : null,
  }
}

export type BajsLive = {
  stations: number
  docked: number
  /** Largest number seen docked in the last 24 h. An inference, see Ravnoteza. */
  knownFleet: number
  empty: number
}

/** Current fleet position. Short cache: this is the "right now" reading. */
export async function loadBajsLive(): Promise<BajsLive | null> {
  const data = await readJson<{
    total_stations?: number
    totalStations?: number
    total_bikes_available?: number
    totalBikesAvailable?: number
    known_fleet?: number
    knownFleet?: number
    empty_stations?: unknown[]
    emptyStations?: unknown[]
  }>("/api/rt/bajs-utilization", 60)
  if (!data) return null

  const stations = data.total_stations ?? data.totalStations ?? 0
  const docked = data.total_bikes_available ?? data.totalBikesAvailable ?? 0
  const knownFleet = data.known_fleet ?? data.knownFleet ?? 0
  const empty = (data.empty_stations ?? data.emptyStations ?? []).length
  if (stations === 0 || docked === 0) return null

  return { stations, docked, knownFleet, empty }
}

export type BajsRanking = {
  /** True once the window is long enough for the order to mean something. */
  trustworthy: boolean
  observedDays: number
  /** Every measured station, busiest first. Needed for the spatial views. */
  all: BajsRankedStation[]
  busiest: BajsRankedStation[]
  /** Stations that sit empty the largest share of the time. */
  emptiest: BajsRankedStation[]
}

export async function loadBajsRanking(
  days = 30,
  limit = 10
): Promise<BajsRanking | null> {
  const data = await readJson<BajsRankingResponse>(
    `/api/rt/bajs-station-ranking?days=${days}&limit=200`
  )
  if (!data || data.stations.length === 0) return null

  // The feed publishes names in caps; the site never renders caps.
  const stations = data.stations.map((s) => ({
    ...s,
    name: formatStationName(s.name),
  }))

  // The endpoint already orders by measured starts.
  const busiest = stations.slice(0, limit)
  const emptiest = [...stations]
    .sort((a, b) => b.emptyShare - a.emptyShare)
    .slice(0, limit)

  return {
    trustworthy: data.observedDays >= RANKING_MIN_DAYS,
    observedDays: data.observedDays,
    all: stations,
    busiest,
    emptiest,
  }
}
