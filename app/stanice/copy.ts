import type { StopLine } from "@/lib/generated/StopLine"
import type { StopPageData } from "@/lib/generated/StopPageData"

import { numberWord, plural } from "../linije/copy"

/**
 * Croatian copy templating for the /stanice/[slug] pages. Stop names stay in the
 * nominative everywhere — the common noun ("stanica", "na stanici") declines, the
 * proper name does not — so templates are built to avoid declining it. Departure
 * times arrive pre-formatted from the generator (wall clock, e.g. "5:08"); never
 * imply a live "next departure" (headway only).
 */

/** "3, 9, 12 i 17" — comma list with Croatian "i" before the last item. */
function joinHr(items: string[]): string {
  if (items.length <= 1) return items.join("")
  return `${items.slice(0, -1).join(", ")} i ${items[items.length - 1]}`
}

/** "tramvaji 3, 9, 12 i 17" / "tramvaj 3" — null when none of that mode. */
function modeGroup(singular: string, plural_: string, brojevi: string[]): string | null {
  if (brojevi.length === 0) return null
  return `${brojevi.length === 1 ? singular : plural_} ${joinHr(brojevi)}`
}

/** "tramvaji 3, 9, 12 i 17 te autobusi 102 i 137". */
export function lineListProse(data: StopPageData): string {
  const trams = modeGroup("tramvaj", "tramvaji", data.tramLines)
  const buses = modeGroup("autobus", "autobusi", data.busLines)
  return [trams, buses].filter(Boolean).join(" te ")
}

/** "5" when lo == hi, else "5–8" (or "5 do 8" with sep " do "). The shared
 *  equal-vs-range branch used across the fact row, FAQ, and per-line headway. */
export function rangeText([lo, hi]: [number, number], sep = "–"): string {
  return lo === hi ? `${lo}` : `${lo}${sep}${hi}`
}

/** "U špici vozilo naiđe svakih 3 do 5 minuta" — combined peak interval, or null. */
function peakSentence(data: StopPageData): string | null {
  const range = data.peakIntervalMin
  if (!range) return null
  const [lo, hi] = range
  return lo === hi
    ? `U špici vozilo naiđe svakih ${lo} ${plural(lo, "minutu", "minute", "minuta")}`
    : `U špici vozilo naiđe svakih ${lo} do ${hi} minuta`
}

/** Lede paragraph under the title. */
export function introText(data: StopPageData): string {
  const n = data.lineCount
  const linije = `${numberWord(n)} ${plural(n, "linija", "linije", "linija")}`
  const parts = [`Ovdje staje ${linije}: ${lineListProse(data)}.`]
  const peak = peakSentence(data)
  if (peak) parts.push(`${peak}.`)
  parts.push(`Prvi polazak je u ${data.firstDeparture}, zadnji u ${data.lastDeparture}.`)
  return parts.join(" ")
}

/** Subtitle under the h1: "Tramvajska i autobusna stanica u kvartu Trešnjevka · oba smjera". */
export function subtitle(data: StopPageData): string {
  const kind =
    data.mode === "both"
      ? "Tramvajska i autobusna stanica"
      : data.mode === "tram"
        ? "Tramvajska stanica"
        : "Autobusna stanica"
  const where = data.kvart ? ` u kvartu ${data.kvart}` : " u Zagrebu"
  const smjer = data.bothDirections ? " · oba smjera" : ""
  return `${kind}${where}${smjer}`
}

/** Mode-aware <title>: leads with the bare stop name, mirrors line-page titles. */
export function stopTitle(data: StopPageData): string {
  const kind =
    data.mode === "both"
      ? "tramvaji i autobusi"
      : data.mode === "tram"
        ? "tramvajska stanica"
        : "autobusna stanica"
  return `${data.name}: ${kind} (ZET) | Doseg`
}

/** "tramvaj" / "autobus" for one line's row. */
export function lineModeNoun(line: StopLine): string {
  return line.mode === "tram" ? "tramvaj" : "autobus"
}

/** Headway for one line's row — peak range, else all-day interval. */
export function lineHeadway(line: StopLine): string | null {
  if (line.peakRangeMin) return `svakih ${rangeText(line.peakRangeMin)} min`
  if (line.allDayHeadwayMin != null) return `svakih ${Math.round(line.allDayHeadwayMin)} min`
  return null
}

/** Doseg hook + lede, templated from the real 15/30/45 station counts. */
export function dosegCopy(data: StopPageData): { hook: string; lede: string } | null {
  const r = data.reach
  if (!r) return null
  const stanica = (n: number) => `${n} ${plural(n, "stanicu", "stanice", "stanica")}`
  return {
    hook: `Za pola sata dosegneš ${stanica(r.stations30)}.`,
    lede: `Odavde javnim prijevozom i pješice za 15 minuta dosegneš ${stanica(
      r.stations15
    )}, za pola sata ${stanica(r.stations30)}, a za 45 minuta ${stanica(
      r.stations45
    )}. Otvori kartu da vidiš dokle točno stigneš.`,
  }
}
