/**
 * Shared constants, types and helpers for the /promjene changelog. Pure data —
 * no React, no server-only APIs — so both the server page (reads JSON, builds
 * the model) and the client timeline (search/filter/expand) can import it.
 */

export const INK = "#0A0A0A", MUTE = "#6A7178", FAINT = "#6E757C", OLD = "#565E68", BLUE = "#0E51C9", HAIR = "#E5E8EC", DOT = "#D8DCE2", KEPT = "#A3A9B0"
export const HEROS = "'TeX Gyre Heros', system-ui, sans-serif"
export const MONO = "'Geist Mono', ui-monospace, monospace"

export type LonLat = [number, number]
export type Pt = { lat: number; lon: number; name: string }
export interface Geom { line: string; mode: "diff" | "new" | "removed"; change?: "terminus" | "midroute"; stopConnected?: boolean; shared: Pt; newTip: Pt; oldTip: Pt; old: { shape: LonLat[] }; new: { shape: LonLat[] }; newStops: Pt[]; addedStops: Pt[]; removedStops: Pt[] }
export interface DiffStat { mode: "diff"; change: "terminus" | "midroute"; len_old_km: number; len_new_km: number; added: number; removed: number; oldTipName: string; newTipName: string; relacija: string }
export interface SideStat { mode: "new" | "removed"; len_km: number; stops_count: number; terminusName: string; originName: string }
export type Stat = DiffStat | SideStat
export interface Source { publisher: string; label: string; title: string; url: string; published?: string }
export interface Successor { line: string; url?: string }
export interface Entry { id: string; noticeId?: string; lines: string[]; mode: string; kind: string; date: string; permanent: boolean; title: string; summary: string; source: Source; maps: string[]; successor?: Successor }
export interface Data { generatedFrom: { oldFeed: { version: string; start: string }; newFeed: { version: string; start: string } }; entries: Entry[] }
export interface Cand { id: string; url: string; title: string; date: string | null; source: string; lines: string[]; category: string; permanence: string; listWorthy: boolean; displayTitle?: string; datePrecise?: boolean; review?: boolean }
export interface Candidates { candidates: Cand[] }

export interface MapEntryData { line: string; geom: Geom; stat: Stat }

/** A line change rich enough to feature: it has at least one before/after map.
 * `approxDate` = the date is a Wayback first-archived timestamp (≈ publish, not the
 * verified effective date), shown with a leading "~". */
export interface FeaturedItem { kind: "featured"; id: string; date: string; approxDate: boolean; category: string; mode: string; lines: string[]; title: string; summary?: string; source: Source; removed: boolean; successor?: Successor; maps: MapEntryData[] }
/** A line change announced but not mappable (no GTFS shape for the date). Renders
 * as a compact row, or an obituary when it was discontinued. */
export interface LineRowItem { kind: "linerow"; id: string; date: string; approxDate: boolean; category: string; lines: string[]; title: string; url: string; removed: boolean }
/** A stop relocation — the bulk of the register. Folded into the year ledger. */
export interface StopRowItem { kind: "stoprow"; id: string; date: string; approxDate: boolean; lines: string[]; title: string; url: string }
export type LineItem = FeaturedItem | LineRowItem

export interface YearGroup { year: string; lineItems: LineItem[]; stopItems: StopRowItem[] }
export interface Counts { total: number; line: number; stop: number; maps: number }
export interface TimelineModel { years: YearGroup[]; counts: Counts }

export const num = (n: number) => n.toLocaleString("hr")
const MJ_NOM = ["siječanj", "veljača", "ožujak", "travanj", "svibanj", "lipanj", "srpanj", "kolovoz", "rujan", "listopad", "studeni", "prosinac"]
export const shortDate = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d}.${m}.${y}.` }
/** Date label; archived-notice dates are approximate, marked with a leading "~". */
export const dateLabel = (iso: string, approx: boolean) => (approx ? "~" : "") + shortDate(iso)
/** "YYYY-MM" → "ožujak 2025." for ledger month sub-headers. */
export const monthLabel = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${MJ_NOM[m - 1]} ${y}.` }
export const idOf = (url: string) => { const m = url.match(/[?&]id=(\d+)/) ?? url.match(/\/(\d+)\/?$/); return m ? m[1] : url }
/** The geom/dedup key for a curated entry: its ZET notice id. Taken explicitly when
 * given (some source URLs point at an archived listing that lacks the id). This is the
 * join key between entries.json, geom/<id>-<line>.json, and the page's index lookup —
 * build-geometry writes under it and the page reads under it, so keep them identical. */
export const entryId = (e: { noticeId?: string; source: { url: string } }) => e.noticeId ?? idOf(e.source.url)

const WORDS = ["nula", "jedna", "dvije", "tri", "četiri", "pet", "šest", "sedam", "osam", "devet", "deset", "jedanaest", "dvanaest"]
/** Spell small counts (the funnel reads "Šest ima kartu…", not "6"). */
export const hrWord = (n: number) => (n >= 0 && n < WORDS.length ? WORDS[n] : String(n))

export const isTram = (l: string) => /^\d+$/.test(l) && (+l <= 17 || (+l >= 31 && +l <= 34))
export const joinLines = (ls: string[]) => (ls.length <= 1 ? ls[0] ?? "" : `${ls.slice(0, -1).join(", ")} i ${ls.at(-1)}`)

/** Expand the jarring GTFS abbreviation in endpoint labels ("Ivanja Reka-okret."
 * → "Ivanja Reka-okretište"). Only the unambiguous one. */
export const expandStop = (s: string) => s.replace(/okret\./gi, "okretište").replace(/\bokr\./gi, "okretište")

/** entries.json uses plural kinds ("ukinute"); candidates use singular category
 * ("ukinuta"). Normalise to the candidate vocabulary for tally + styling. */
export const normCategory = (k: string): string => ({ ukinute: "ukinuta", produljene: "produljena", skraćene: "skraćena", izmjena: "trasa" }[k] ?? k)

/** Clean Croatian headline for an auto-featured / un-curated change (wayback slug
 * titles lack diacritics + casing, so generate from line numbers + category). */
export function autoHeadline(lines: string[], category: string): string {
  if (!lines.length) return category === "nova" ? "Nova linija." : category === "ukinuta" ? "Ukinuta linija." : "Izmjena u mreži."
  const single = lines.length === 1, trams = lines.every(isTram)
  const noun = trams ? "Tramvaj" : "Autobus"
  if (category === "nova") return single ? `Nova ${trams ? "tramvajska" : "autobusna"} linija ${lines[0]}.` : `Nove linije ${joinLines(lines)}.`
  if (category === "ukinuta") return single ? `${noun} ${lines[0]} ukinut.` : `Ukinute linije ${joinLines(lines)}.`
  const m: Record<string, [string, string]> = { produljena: ["produljen", "produljene"], skraćena: ["skraćen", "skraćene"], trasa: ["preusmjeren", "preusmjerene"] }
  const [sg, pl] = m[category] ?? ["izmijenjen", "izmijenjene"]
  return single ? `${noun} ${lines[0]} ${sg}.` : `Linije ${joinLines(lines)} ${pl}.`
}

/** Compact-row tag (label + colour) per change category. Vocabulary matches the
 * tally + headline root ("preusmjeren") so a year header, its rows and the
 * headlines all name the same thing. */
export const TAG: Record<string, [string, string]> = {
  nova: ["nova linija", BLUE], ukinuta: ["ukinuta linija", OLD], produljena: ["produljena trasa", BLUE],
  skraćena: ["skraćena trasa", INK], trasa: ["preusmjerena trasa", BLUE], stajalište: ["stajalište", MUTE],
  "vozni red": ["vozni red", MUTE], ostalo: ["promjena", MUTE],
}

/** Year-tally token: plural label + singular form (for count 1) + colour + order. */
export const TALLY: Record<string, { label: string; one: string; color: string; order: number }> = {
  nova: { label: "nove", one: "nova", color: BLUE, order: 0 },
  produljena: { label: "produljene", one: "produljena", color: BLUE, order: 1 },
  trasa: { label: "preusmjerene", one: "preusmjerena", color: BLUE, order: 2 },
  skraćena: { label: "skraćene", one: "skraćena", color: INK, order: 3 },
  ukinuta: { label: "ukinute", one: "ukinuta", color: OLD, order: 4 },
  stajalište: { label: "stajališta", one: "stajalište", color: MUTE, order: 5 },
}

/** Diacritic-insensitive lowercase for the finder's substring match. */
export const norm = (s: string) => s.toLowerCase().replace(/\u0111/g, "d").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
