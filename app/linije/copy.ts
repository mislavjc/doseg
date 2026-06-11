import type { HourRow } from "@/lib/generated/HourRow"
import type { LineMode } from "@/lib/generated/LineMode"
import type { LinePageData } from "@/lib/generated/LinePageData"

/**
 * Croatian copy templating for the line pages. Terminal names stay in the
 * nominative everywhere ("s terminala Črnomerec") — automatic declension of
 * 300+ stop names would produce embarrassing mistakes, so templates are built
 * to avoid needing it.
 */

export const MODE_NOUN: Record<LineMode, string> = {
  tram: "tramvaj",
  bus: "autobus",
}
export const MODE_ADJ: Record<LineMode, string> = {
  tram: "tramvajske",
  bus: "autobusne",
}

export function modeNoun(mode: LineMode): string {
  return MODE_NOUN[mode]
}

/** "4:55" — GTFS time string "04:55"/"24:11" → display clock time. */
export function clockTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm
  return `${h % 24}:${String(m).padStart(2, "0")}`
}

/** Croatian plural form picker: paukal(2-4) vs genitive plural. */
export function plural(
  n: number,
  one: string,
  few: string,
  many: string
): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

const NUMBER_WORDS = [
  "nula",
  "jedan",
  "dva",
  "tri",
  "četiri",
  "pet",
  "šest",
  "sedam",
  "osam",
  "devet",
  "deset",
  "jedanaest",
  "dvanaest",
  "trinaest",
  "četrnaest",
  "petnaest",
  "šesnaest",
  "sedamnaest",
  "osamnaest",
  "devetnaest",
  "dvadeset",
]

/** 7 → "sedam"; falls back to digits above 20. */
export function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n)
}

/** All weekday departure minutes-of-day for one direction, sorted. */
function flatDepartures(rows: HourRow[]): number[] {
  return rows.flatMap((r) => r.minutes.map((m) => r.hour * 60 + m))
}

/**
 * Typical peak interval as a [lo, hi] minute range (06:30–09:30 gaps,
 * 20th–80th percentile). Null when there are too few departures to call it
 * a rhythm.
 */
export function peakRange(data: LinePageData): [number, number] | null {
  const deps = flatDepartures(data.timetable.radniDan[0] ?? []).filter(
    (t) => t >= 6.5 * 60 && t <= 9.5 * 60
  )
  if (deps.length < 4) return null
  const gaps = deps
    .slice(1)
    .map((t, i) => t - deps[i])
    .sort((a, b) => a - b)
  const lo = Math.round(gaps[Math.floor(gaps.length * 0.2)])
  const hi = Math.round(gaps[Math.floor(gaps.length * 0.8)])
  return [lo, hi]
}

/** Busiest-hour weekday departure count (for "X polazaka na sat u špici"). */
export function peakHourly(data: LinePageData): number {
  return Math.max(...data.histogram, 0)
}

/** Which day types actually have service. */
export function serviceDays(data: LinePageData): {
  subota: boolean
  nedjelja: boolean
} {
  const has = (rows: HourRow[][]) => rows.some((dir) => dir.length > 0)
  return {
    subota: has(data.timetable.subota),
    nedjelja: has(data.timetable.nedjelja),
  }
}

/** Departure-terminal display name per direction (column headers, toggles). */
export function departureTerminals(data: LinePageData): string[] {
  return data.directions.map((_, i) =>
    i === 0 ? data.terminals[0] : data.terminals[1]
  )
}

/** Fallback chip per direction's end terminal: bus lines departing there. */
export function terminalChips(data: LinePageData): (string | undefined)[] {
  return data.directions.map((_, i) => {
    const endTerminal = i === 0 ? data.terminals[1] : data.terminals[0]
    const buses = data.related.sharedTerminal
      .filter((r) => r.terminal === endTerminal && r.mode === "bus")
      .slice(0, 3)
      .map((r) => r.broj)
    return buses.length > 0 ? `bus ${buses.join(" · ")}` : undefined
  })
}

/** Intro paragraph under the title. */
export function introText(data: LinePageData): string {
  const noun = modeNoun(data.mode)
  const range = peakRange(data)
  const first = clockTime(data.stats.firstDeparture)
  const last = clockTime(data.stats.lastDeparture)
  const stops = data.directions[0].stops.length
  const travel = Math.round(data.stats.travelTimeMin)
  const tail = `Prvi ${noun} s terminala ${data.terminals[0]} kreće u ${first}, zadnji u ${last}, a od kraja do kraja vozi ${travel} ${plural(travel, "minutu", "minute", "minuta")} kroz ${stops} ${plural(stops, "stanicu", "stanice", "stanica")}.`
  if (range) {
    const [lo, hi] = range
    const spica =
      lo === hi
        ? `U špici polazi svakih ${lo} ${plural(lo, "minutu", "minute", "minuta")}.`
        : `U špici polazi svakih ${lo} do ${hi} minuta.`
    return `${spica} ${tail}`
  }
  const deps = data.stats.dailyDepartures
  return `Polazi ${deps} ${plural(deps, "put", "puta", "puta")} radnim danom. ${tail}`
}
