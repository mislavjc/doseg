import { readFileSync } from "node:fs"
import { join } from "node:path"

import { cache } from "react"

import {
  loadSaturdayScores,
  loadScores,
  loadTravelMatrix,
  type DistrictScore,
} from "@/app/statistika/stat-data"
import { getDataDir } from "@/lib/data-dir"
import type { LineIndexEntry } from "@/lib/generated/LineIndexEntry"
import { fastDistKm, pointInRing, type Ring } from "@/lib/geo"
import { kvartSlug } from "@/lib/kvart-slug"
import { loadLineIndex, type LineHeroMeta } from "@/lib/line-data"

/**
 * Assembles the per-kvart (district) scorecard view model from data that is
 * ALREADY committed: district-scores(+saturday), travel-matrix, the line index,
 * promjene entries, the POI snapshot (point-in-polygon), and the district-map
 * SVG polygons. Reachability cuts at 15/30/45 min and hourly frequency profiles
 * are intentionally absent — they need an isochrone/hourly build pass and are
 * left out of v1 rather than faked.
 */

export { kvartSlug }

/**
 * Read + parse JSON once per build process — SSG renders all 17 kvart pages in
 * the same process, so without this districts.geojson alone is parsed 17×.
 * Mirrors lib/line-data's jsonCache.
 */
const jsonCache = new Map<string, unknown>()
function readJson<T>(path: string): T | null {
  const cached = jsonCache.get(path)
  if (cached !== undefined && process.env.NODE_ENV === "production") return cached as T
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as T
    jsonCache.set(path, parsed)
    return parsed
  } catch {
    return null
  }
}

export interface KvartIndexEntry {
  slug: string
  name: string
}

export function loadKvartIndex(): KvartIndexEntry[] {
  const s = loadScores()
  if (!s) return []
  return s.districts.map((d) => ({ slug: kvartSlug(d.name), name: d.name }))
}

export interface CommuteRow {
  name: string
  slug: string
  min: number
  transfer: boolean
}

export interface KvartLine {
  broj: string
  mode: "tram" | "bus"
  isNight: boolean
  terminals: string[]
  headwayMin: number | null
}

export interface PoiCat {
  key: "hospital" | "school" | "park"
  count: number
  nearestName: string | null
  nearestKm: number | null
}

export interface KvartPromjena {
  id: string
  date: string
  kind: string
  title: string
  url: string
}

export interface ScoreBar {
  name: string
  score: number
  kind: "best" | "self" | "city" | "worst"
}

export interface KvartData {
  name: string
  slug: string
  score: number
  rank: number
  total: number
  population: number | null
  desertPct: number
  cityDesertPct: number
  avgNearestStopM: number
  reach: { min: number; median: number; max: number; avg: number }
  eveningPctOfPeak: number
  weekendRetentionPct: number | null
  weekdayHeadwayMin: number
  weekendHeadwayMin: number | null
  bajs: { stations: number; boostPct: number; coveragePct: number }
  tramCount: number
  busCount: number
  nightLines: string[]
  stops: number
  bestPoint: { lat: number; lon: number }
  commute: CommuteRow[]
  within30: number
  lines: KvartLine[]
  poi: PoiCat[]
  promjene: KvartPromjena[]
  bars: ScoreBar[]
  cityAvgScore: number
  boundary: [number, number][]
  hero: LineHeroMeta | null
}

// ── raw file loaders (kept local; all paths are committed) ───────────────────

interface GeoFeature {
  properties: { name: string }
  geometry: { type: string; coordinates: Ring[] }
}
function loadGeo(): GeoFeature[] {
  return readJson<{ features: GeoFeature[] }>(
    join(process.cwd(), "data/districts.geojson")
  )?.features ?? []
}

interface Poi {
  name: string
  lat: number
  lon: number
  category: string
}
function loadPois(): Poi[] {
  return readJson<{ pois: Poi[] }>(join(getDataDir(), "poi-snapshot.json"))?.pois ?? []
}

interface PromjenaEntry {
  id: string
  lines: string[]
  kind: string
  date: string
  title: string
  source: { url: string }
}
function loadPromjene(): PromjenaEntry[] {
  return (
    readJson<{ entries: PromjenaEntry[] }>(
      join(getDataDir(), "promjene", "entries.json")
    )?.entries ?? []
  )
}

/** Per-kvart baked dither hero crops (data/kvart/hero-meta.json from the bake). */
function loadHeroMeta(slug: string): LineHeroMeta | null {
  return (
    readJson<Record<string, LineHeroMeta>>(
      join(getDataDir(), "kvart", "hero-meta.json")
    )?.[slug] ?? null
  )
}

const NEARBY_KM = 4 // only consider POIs within 4 km of the kvart for "nearest"

function poiInDistrict(geo: GeoFeature | undefined, pois: Poi[]): PoiCat[] {
  const keys: PoiCat["key"][] = ["hospital", "school", "park"]
  if (!geo) return keys.map((key) => ({ key, count: 0, nearestName: null, nearestKm: null }))
  const [outer, ...holes] = geo.geometry.coordinates
  const inside = pois.filter(
    (p) =>
      pointInRing(p.lon, p.lat, outer) &&
      !holes.some((h) => pointInRing(p.lon, p.lat, h))
  )
  return keys.map((key) => ({ key, count: inside.filter((p) => p.category === key).length, nearestName: null, nearestKm: null }))
}

function nearestPoi(
  best: { lat: number; lon: number },
  pois: Poi[],
  key: string
): { name: string; km: number } | null {
  let bestName: string | null = null
  let bestKm = Infinity
  for (const p of pois) {
    if (p.category !== key) continue
    const km = fastDistKm(best.lat, best.lon, p.lat, p.lon)
    if (km < bestKm) {
      bestKm = km
      bestName = p.name
    }
  }
  return bestName && bestKm <= NEARBY_KM
    ? { name: bestName, km: Math.round(bestKm * 10) / 10 }
    : null
}

function buildCommute(name: string): { commute: CommuteRow[]; within30: number } {
  const commute: CommuteRow[] = []
  let within30 = 0
  const tm = loadTravelMatrix()
  if (tm) {
    const oi = tm.districts.indexOf(name)
    if (oi >= 0) {
      tm.districts.forEach((n, j) => {
        if (j === oi) return
        const min = Math.round(tm.matrix[oi][j])
        if (min <= 30) within30++
        commute.push({
          name: n,
          slug: kvartSlug(n),
          min,
          transfer: (tm.transferMatrix?.[oi]?.[j] ?? 0) > 0,
        })
      })
      commute.sort((a, b) => a.min - b.min)
    }
  }
  return { commute, within30 }
}

function buildLines(d: DistrictScore): {
  lines: KvartLine[]
  tramCount: number
  busCount: number
  nightLines: string[]
} {
  const idx = new Map<string, LineIndexEntry>(
    loadLineIndex().lines.map((l) => [l.broj, l])
  )
  const toLine = (broj: string, mode: "tram" | "bus"): KvartLine => {
    const e = idx.get(broj)
    return {
      broj,
      mode,
      isNight: e?.isNight ?? false,
      terminals: e?.terminals ?? [],
      headwayMin: e?.peakHeadwayMin ?? e?.avgHeadwayMin ?? null,
    }
  }
  const byNum = (a: KvartLine, b: KvartLine) => Number(a.broj) - Number(b.broj)
  const trams = (d.tramLines ?? []).map((b) => toLine(b, "tram")).sort(byNum)
  const buses = (d.busLines ?? []).map((b) => toLine(b, "bus")).sort(byNum)
  const lines = [...trams, ...buses]
  return {
    lines,
    tramCount: trams.length,
    busCount: buses.length,
    nightLines: lines.filter((l) => l.isNight).map((l) => l.broj),
  }
}

function buildBars(all: DistrictScore[], d: DistrictScore, cityAvg: number): ScoreBar[] {
  const best = all.reduce((a, b) => (b.score > a.score ? b : a))
  const worst = all.reduce((a, b) => (b.score < a.score ? b : a))
  return [
    { name: best.name, score: best.score, kind: "best" },
    { name: d.name, score: d.score, kind: "self" },
    { name: "prosjek grada", score: cityAvg, kind: "city" },
    { name: worst.name, score: worst.score, kind: "worst" },
  ]
}

function buildPromjene(d: DistrictScore): KvartPromjena[] {
  const set = new Set([...(d.tramLines ?? []), ...(d.busLines ?? [])])
  return loadPromjene()
    .filter((e) => e.lines.some((l) => set.has(l)))
    .map((e) => ({ id: e.id, date: e.date, kind: e.kind, title: e.title, url: e.source.url }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

function loadKvartImpl(slug: string): KvartData | null {
  if (!/^[a-z0-9-]+$/.test(slug)) return null
  const scores = loadScores()
  if (!scores) return null
  const d = scores.districts.find((x) => kvartSlug(x.name) === slug)
  if (!d) return null

  const all = scores.districts
  const cityAvgScore = Math.round(
    all.reduce((s, x) => s + x.score, 0) / all.length
  )
  const bars = buildBars(all, d, cityAvgScore)

  const { commute, within30 } = buildCommute(d.name)

  const { lines, tramCount, busCount, nightLines } = buildLines(d)

  // weekend retention + headway (Saturday scores)
  const sat = loadSaturdayScores()
  const satD = sat?.districts.find((x) => x.name === d.name)
  const weekendRetentionPct =
    satD && d.avgReachableCells
      ? Math.round((satD.avgReachableCells / d.avgReachableCells) * 100)
      : null

  // POI in the kvart (point-in-polygon) + nearest by straight-line distance
  const geo = loadGeo().find((f) => f.properties.name === d.name)
  const pois = loadPois()
  const poi = poiInDistrict(geo, pois).map((c) => {
    const near = nearestPoi(d.bestPoint, pois, c.key)
    return { ...c, nearestName: near?.name ?? null, nearestKm: near?.km ?? null }
  })

  const promjene = buildPromjene(d)

  return {
    name: d.name,
    slug,
    score: d.score,
    rank: d.rank,
    total: all.length,
    population: d.population,
    desertPct: d.desertPct,
    cityDesertPct: scores.cityDesertPct,
    avgNearestStopM: d.avgNearestStopM,
    reach: {
      min: d.minReachableCells,
      median: d.medianReachableCells,
      max: d.maxReachableCells,
      avg: d.avgReachableCells,
    },
    eveningPctOfPeak: d.avgReachableCells
      ? Math.round((d.eveningAvgReachableCells / d.avgReachableCells) * 100)
      : 100,
    weekendRetentionPct,
    weekdayHeadwayMin: d.medianHeadwayMin,
    weekendHeadwayMin: satD?.medianHeadwayMin ?? null,
    bajs: {
      stations: d.bajsStations,
      boostPct: d.bajsBoostPct,
      coveragePct: d.bajsStopCoveragePct ?? 0,
    },
    tramCount,
    busCount,
    nightLines,
    stops: d.stops,
    bestPoint: d.bestPoint,
    commute,
    within30,
    lines,
    poi,
    promjene,
    bars,
    cityAvgScore,
    boundary: geo?.geometry.coordinates[0] ?? [],
    hero: loadHeroMeta(slug),
  }
}

/** Cached so generateMetadata + the page render don't both run the assembly. */
export const loadKvart = cache(loadKvartImpl)

export interface KvartBoardRow {
  slug: string
  name: string
  rank: number
  score: number
  lineCount: number
  desertPct: number
}

export interface KvartBoard {
  rows: KvartBoardRow[]
  cityAvgScore: number
  cityDesertPct: number
  best: KvartBoardRow
  worst: KvartBoardRow
  generatedAt: string
}

/** All kvarts ranked best→worst by connectivity, for the /kvartovi hub board. */
export function loadKvartBoard(): KvartBoard | null {
  const s = loadScores()
  if (!s) return null
  const rows: KvartBoardRow[] = [...s.districts]
    .sort((a, b) => a.rank - b.rank)
    .map((d) => ({
      slug: kvartSlug(d.name),
      name: d.name,
      rank: d.rank,
      score: d.score,
      lineCount: (d.tramLines?.length ?? 0) + (d.busLines?.length ?? 0),
      desertPct: d.desertPct,
    }))
  return {
    rows,
    cityAvgScore: Math.round(
      s.districts.reduce((x, d) => x + d.score, 0) / s.districts.length
    ),
    cityDesertPct: s.cityDesertPct,
    best: rows[0],
    worst: rows[rows.length - 1],
    generatedAt: s.generatedAt,
  }
}
