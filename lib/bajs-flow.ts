import { formatStationName } from "./bajs-station-name"
import { districtAt } from "./district-at"
import type {
  BajsRelocationsResponse,
  BajsStationFlow,
  BajsStationFlowResponse,
} from "./generated"

/**
 * Two readings that the ride counts on their own cannot give.
 *
 * `loadBajsStationFlow` answers which way demand runs: a station that empties
 * every morning and fills every evening is one end of a commute, and the ride
 * total alone hides that entirely.
 *
 * `loadBajsRelocations` covers the other half. Bikes that arrive at a different
 * station still carrying the id they left with were never rented, because GBFS
 * rotates `bike_id` on rental. Those are the operator's van moving bikes, and
 * they are worth reading on their own terms rather than being discarded.
 *
 * Both readers return null rather than throwing, so the page renders its
 * unavailable state when the RT server is down.
 */

const ISOCHRONE_URL = process.env.ISOCHRONE_URL || "http://localhost:3002"

const REVALIDATE_SEC = 300

/**
 * The hours that separate a commute from ordinary traffic. Taken from the
 * measured profile: a narrow 07h departure spike, and a much broader afternoon
 * peak centred on 16h.
 */
const MORNING = [7, 8, 9]
const AFTERNOON = [16, 17, 18]

/**
 * Below this many net bikes a day, a kvart's direction is noise: one school
 * trip or one van run flips the sign.
 */
const MIN_NET_PER_DAY = 3

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${ISOCHRONE_URL}${path}`, {
      next: { revalidate: REVALIDATE_SEC },
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/**
 * Net bikes gained across `hours`, counting riders only: the van's own moves
 * are taken back out on both sides. Negative means the station emptied.
 */
function riderNet(station: BajsStationFlow, hours: number[]) {
  return hours.reduce(
    (net, h) =>
      net +
      ((station.returns[h] ?? 0) - (station.relocIn[h] ?? 0)) -
      ((station.starts[h] ?? 0) - (station.relocOut[h] ?? 0)),
    0
  )
}

export type KvartFlow = {
  name: string
  stations: number
  /** Net bikes arriving per morning. Negative means the kvart empties. */
  morningNet: number
  /** The same for the afternoon peak. */
  afternoonNet: number
  /**
   * True when the kvart empties in the morning and fills in the afternoon, or
   * the reverse. That mirror is what makes it a commute rather than drift.
   */
  reverses: boolean
}

export type BajsFlow = {
  /** Emptiest morning first, so the chart opens on the strongest signal. */
  kvartovi: KvartFlow[]
  drains: KvartFlow[]
  fills: KvartFlow[]
  /** Days behind the morning window, for turning totals into daily rates. */
  morningDays: number
}

export async function loadBajsStationFlow(days = 30): Promise<BajsFlow | null> {
  const data = await readJson<BajsStationFlowResponse>(
    `/api/rt/bajs-station-flow?days=${days}`
  )
  if (!data || data.stations.length === 0) return null

  const mean = (hours: number[]) => {
    const seen = hours.map((h) => data.observedDays[h] ?? 0).filter((d) => d > 0)
    return seen.length ? seen.reduce((a, b) => a + b, 0) / seen.length : 0
  }
  const morningDays = mean(MORNING)
  const afternoonDays = mean(AFTERNOON)
  if (morningDays === 0 || afternoonDays === 0) return null

  const totals = new Map<string, { stations: number; am: number; pm: number }>()
  for (const s of data.stations) {
    // A station outside every polygon has nothing to be folded into. That is
    // only possible for one off the edge of the city, so it is dropped rather
    // than counted anywhere.
    const name = districtAt(s.lat, s.lon)
    if (!name) continue
    const cur = totals.get(name) ?? { stations: 0, am: 0, pm: 0 }
    cur.stations++
    cur.am += riderNet(s, MORNING)
    cur.pm += riderNet(s, AFTERNOON)
    totals.set(name, cur)
  }
  if (totals.size === 0) return null

  const kvartovi: KvartFlow[] = [...totals.entries()]
    .map(([name, t]) => {
      const morningNet = t.am / morningDays
      const afternoonNet = t.pm / afternoonDays
      return {
        name,
        stations: t.stations,
        morningNet,
        afternoonNet,
        reverses:
          Math.sign(morningNet) !== Math.sign(afternoonNet) &&
          Math.abs(morningNet) >= MIN_NET_PER_DAY &&
          Math.abs(afternoonNet) >= MIN_NET_PER_DAY,
      }
    })
    .sort((a, b) => a.morningNet - b.morningNet)

  const strong = kvartovi.filter((k) => Math.abs(k.morningNet) >= MIN_NET_PER_DAY)

  return {
    kvartovi,
    drains: strong.filter((k) => k.morningNet < 0).slice(0, 5),
    fills: strong
      .filter((k) => k.morningNet > 0)
      .sort((a, b) => b.morningNet - a.morningNet)
      .slice(0, 5),
    morningDays,
  }
}

export type BajsRelocations = {
  /** Mean moves on a day we watched all the way through. */
  perDay: number
  /** Complete days measured, so the copy can say how much is behind it. */
  observedDays: number
  /** Mean moves per local hour, 0-23. */
  hourly: number[]
  busiestHour: number
  /** Mean minutes a bike spends off the network while being moved. */
  avgMinutes: number
  corridors: { from: string; to: string; moves: number }[]
}

/**
 * `fullDays` comes from the ride reader, which gates on how many minutes of
 * each day the collector actually saw. Without it a day we only half watched
 * reads as a day the van half worked.
 */
export async function loadBajsRelocations(
  days = 30,
  fullDays?: { date: string }[]
): Promise<BajsRelocations | null> {
  const data = await readJson<BajsRelocationsResponse>(
    `/api/rt/bajs-relocations?days=${days}`
  )
  if (!data || data.days.length === 0) return null

  const observed = fullDays && new Set(fullDays.map((d) => d.date))
  const complete = observed
    ? data.days.filter((d) => observed.has(d.date))
    : // No ride window to lean on: drop the ends, which are always partial.
      data.days.slice(1, -1)
  if (complete.length === 0) return null
  const perDay =
    complete.reduce((sum, d) => sum + d.moves, 0) / complete.length
  if (perDay === 0) return null

  return {
    perDay,
    observedDays: complete.length,
    hourly: data.hourly,
    busiestHour: data.hourly.indexOf(Math.max(...data.hourly)),
    avgMinutes: data.avgMinutes,
    corridors: data.corridors.map((c) => ({
      from: formatStationName(c.fromName),
      to: formatStationName(c.toName),
      moves: c.moves,
    })),
  }
}
