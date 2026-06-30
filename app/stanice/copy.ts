import type { StopLine } from "@/lib/generated/StopLine"
import type { StopPageData } from "@/lib/generated/StopPageData"

import { numberWordF, plural } from "../linije/copy"

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

/** "5" when lo == hi, else "5–8". The shared equal-vs-range branch. */
export function rangeText([lo, hi]: [number, number]): string {
  return lo === hi ? `${lo}` : `${lo}-${hi}`
}

/**
 * The single most frequent calling line (lowest headway) — the honest "headline"
 * frequency. Pooling every line × both directions overstated it badly: at Elka
 * eleven lines averaging 20–80 min read as a fake "1–3 min", and a stop looked
 * busier the more rare lines were listed. This figure can't be gamed and names a
 * real direction. `headway` is the line's "svakih N min" string; `inPeak` is
 * false for a line that only runs outside the 07–09 window (all-day gap shown).
 */
export function mostFrequentLine(
  data: StopPageData
): { line: StopLine; headway: string; inPeak: boolean } | null {
  let best: StopLine | null = null
  let bestKey = Infinity
  for (const l of data.lines) {
    const key = l.peakHeadwayMin ?? l.allDayHeadwayMin
    if (key == null) continue
    if (key < bestKey) {
      bestKey = key
      best = l
    }
  }
  if (!best) return null
  const inPeak = best.peakRangeMin != null || best.peakHeadwayMin != null
  // Reuse lineHeadway for the range / all-day branches; add the peak-scalar tier
  // it doesn't cover. The selection above guarantees a non-null result.
  const headway =
    best.peakRangeMin == null && best.peakHeadwayMin != null
      ? `svakih ${Math.round(best.peakHeadwayMin)} min`
      : lineHeadway(best)!
  return { line: best, headway, inPeak }
}

/**
 * Distinct outbound directions the lines leave on. Reads the generator's
 * `directionGroups`; until the next feed regen ships that field, falls back to
 * the legacy binary `bothDirections` so existing pages keep their suffix.
 */
function directionCount(data: StopPageData): number {
  const g = (data as { directionGroups?: number }).directionGroups
  return g ?? (data.bothDirections ? 2 : 1)
}

/** one-way / two-way / multi-corridor — classify the count once so the chip and
 *  the FAQ phrase can't drift apart. */
type DirectionKind = "one" | "two" | "multi"
function directionKind(data: StopPageData): DirectionKind {
  const g = directionCount(data)
  return g >= 3 ? "multi" : g === 2 ? "two" : "one"
}

/**
 * Direction chip for the subtitle/section: a normal two-way stop ("oba smjera"),
 * a small multi-corridor stop ("više smjerova"), or a genuine interchange with
 * many lines ("čvorište"). null for a one-way stop. Fixes "oba smjera" on hubs
 * like Glavni kolodvor, where the lines actually fan out several ways.
 */
export function directionLabel(data: StopPageData): string | null {
  switch (directionKind(data)) {
    case "multi":
      return data.lineCount >= 5 ? "čvorište" : "više smjerova"
    case "two":
      return "oba smjera"
    default:
      return null
  }
}

/** FAQ fragment for the line-count sentence, derived from the same direction
 *  kind as the chip (not by string-matching directionLabel's output). */
export function directionNote(data: StopPageData): string {
  switch (directionKind(data)) {
    case "multi":
      return ", iz više smjerova"
    case "two":
      return ", u oba smjera"
    default:
      return ""
  }
}

/** Lede paragraph under the title. */
export function introText(data: StopPageData): string {
  const n = data.lineCount
  const linije = `${numberWordF(n)} ${plural(n, "linija", "linije", "linija")}`
  const parts = [`Ovdje staje ${linije}: ${lineListProse(data)}.`]
  const mf = mostFrequentLine(data)
  if (mf) {
    parts.push(
      `Najčešća linija, ${lineModeNoun(mf.line)} ${mf.line.broj}, ${
        mf.inPeak ? "u špici " : ""
      }vozi ${mf.headway}.`
    )
  }
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
  const dir = directionLabel(data)
  const smjer = dir ? ` · ${dir}` : ""
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
