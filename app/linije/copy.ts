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

/** minutes-of-day (GTFS, may exceed 1440 past midnight) → "H:MM" wall clock. */
function clockFromMin(min: number): string {
  const h = Math.floor(min / 60) % 24
  return `${h}:${String(min % 60).padStart(2, "0")}`
}

function hasService(rows: HourRow[][]): boolean {
  return rows.some((dir) => dir.length > 0)
}

export type ServiceStatus = "weekday" | "weekendOnly" | "none"

/** The representative service day to describe — weekday if the line runs then,
 *  else the weekend — and its status. The day-priority rule lives here once;
 *  serviceStatus and serviceHistogram both read it. */
function representativeDay(data: LinePageData): {
  status: ServiceStatus
  rows: HourRow[][]
} {
  const tt = data.timetable
  if (hasService(tt.radniDan)) return { status: "weekday", rows: tt.radniDan }
  if (hasService(tt.subota)) return { status: "weekendOnly", rows: tt.subota }
  if (hasService(tt.nedjelja)) return { status: "weekendOnly", rows: tt.nedjelja }
  return { status: "none", rows: [] }
}

/** What service the line actually has, from the committed timetable. Lines
 *  suspended on the sampled weekday (summer track works are routine) otherwise
 *  render a misleading "0 polazaka / 0:00". */
export function serviceStatus(data: LinePageData): ServiceStatus {
  return representativeDay(data).status
}

/** First/last departure (minutes-of-day) across the given day rows, or null. */
function firstLastOfRows(rows: HourRow[][]): [number, number] | null {
  const mins = rows.flatMap(flatDepartures)
  return mins.length ? [Math.min(...mins), Math.max(...mins)] : null
}

/**
 * Departures-per-hour (0–23, GTFS hours past midnight folded) for the busier
 * single direction on the representative service day. The frequency hook/chart
 * describe THIS series — not `data.histogram`, which sums both directions and so
 * reads as ~2x the frequency a one-way rider actually gets.
 */
export function serviceHistogram(data: LinePageData): number[] {
  let best: HourRow[] = []
  let bestN = -1
  for (const dir of representativeDay(data).rows) {
    const n = dir.reduce((s, r) => s + r.minutes.length, 0)
    if (n > bestN) {
      bestN = n
      best = dir
    }
  }
  const hist = new Array<number>(24).fill(0)
  for (const r of best) hist[r.hour % 24] += r.minutes.length
  return hist
}

/** Weekend service shape, so the three weekend-aware copy spots classify once. */
export type WeekendKind = "both" | "saturday" | "sunday" | "none"
export function weekendKind(data: LinePageData): WeekendKind {
  const { subota, nedjelja } = serviceDays(data)
  if (subota && nedjelja) return "both"
  if (subota) return "saturday"
  if (nedjelja) return "sunday"
  return "none"
}

/** "vozni red" sub-note, honest for weekend-only lines (no "radni dan" claim). */
export function vozniRedNote(data: LinePageData): string {
  if (serviceStatus(data) === "weekendOnly") {
    return {
      both: " Polasci za subotu i nedjelju.",
      saturday: " Polasci za subotu.",
      sunday: " Polasci za nedjelju.",
      none: "",
    }[weekendKind(data)]
  }
  return weekendKind(data) !== "none"
    ? " Polasci za radni dan, subotu i nedjelju."
    : " Vozi samo radnim danom."
}

/** Which day types actually have service. Internal — only weekendKind reads it. */
function serviceDays(data: LinePageData): {
  subota: boolean
  nedjelja: boolean
} {
  return {
    subota: hasService(data.timetable.subota),
    nedjelja: hasService(data.timetable.nedjelja),
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

/** Intro paragraph under the title. Doubles as the SEO/OG description, so the
 *  suspended-line cases must read honestly rather than "0 puta / 0:00 / 0 min". */
export function introText(data: LinePageData): string {
  const noun = modeNoun(data.mode)
  const stops = data.directions[0].stops.length
  const travel = Math.round(data.stats.travelTimeMin)
  const km = data.stats.distanceKm.toLocaleString("hr-HR", { maximumFractionDigits: 1 })
  const krozStanica = `kroz ${stops} ${plural(stops, "stanicu", "stanice", "stanica")}`
  const trajanje = `${travel} ${plural(travel, "minutu", "minute", "minuta")}`
  const status = serviceStatus(data)

  if (status === "none") {
    return `Linija ${data.broj} trenutno ne prometuje — u aktualnom voznom redu nema nijednog polaska. Trasa je duga ${km} km ${krozStanica}.`
  }
  if (status === "weekendOnly") {
    const fl = firstLastOfRows([...data.timetable.subota, ...data.timetable.nedjelja])
    const span = fl ? ` Prvi polazak je u ${clockFromMin(fl[0])}, zadnji u ${clockFromMin(fl[1])}.` : ""
    return `Linija ${data.broj} vozi samo vikendom, radnim danom ne.${span} Od kraja do kraja ${noun} vozi ${trajanje} ${krozStanica}.`
  }

  const range = peakRange(data)
  const first = clockTime(data.stats.firstDeparture)
  const last = clockTime(data.stats.lastDeparture)
  const tail = `Prvi ${noun} s terminala ${data.terminals[0]} kreće u ${first}, zadnji u ${last}, a od kraja do kraja vozi ${trajanje} ${krozStanica}.`
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
