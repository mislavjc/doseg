import { join } from "node:path"

import { loadScores, reachKm2 } from "@/lib/district-scores"
import { fastDistKm, pointInRing, type Ring } from "@/lib/geo"
import { kvartSlug } from "@/lib/kvart-slug"
import { readJsonCached } from "@/lib/page-data"
import { loadStopData, loadStopIndex } from "@/lib/stop-data"

/**
 * Doseg readout for a geocoded point: the kvart the point falls in (with its
 * reach numbers from the day-filtered district scores), the nearest stop
 * pages on foot, and the union of lines calling within a short walk. Kvart
 * reach is deliberately the KVART figure, not a per-address isochrone — the
 * true per-address answer lives on /karta; the payload says so via
 * `basis: "kvart"` and the UI labels it "prosjek kvarta". Renders server-side
 * on the /adresa/[slug] page.
 */

const WALK_M_PER_MIN = 75 // ~4.5 km/h
const NEARBY_MAX = 3
const NEARBY_RADIUS_KM = 0.8
/** Lines are aggregated over stops within this radius (~5 min walk). */
const LINES_RADIUS_KM = 0.45

interface GeoFeature {
  properties: { name: string }
  geometry: { type: string; coordinates: Ring[] }
}

/** Name of the gradska četvrt containing the point (holes respected). */
export function districtAt(lon: number, lat: number): string | null {
  const features =
    readJsonCached<{ features: GeoFeature[] }>(
      join(process.cwd(), "data/districts.geojson")
    )?.features ?? []
  for (const f of features) {
    const [outer, ...holes] = f.geometry.coordinates
    if (pointInRing(lon, lat, outer) && !holes.some((h) => pointInRing(lon, lat, h)))
      return f.properties.name
  }
  return null
}

export interface NearbyStop {
  slug: string
  name: string
  kvart: string | null
  distM: number
  walkMin: number
  lineCount: number
}

export interface NearbyLine {
  broj: string
  mode: "tram" | "bus"
  isNight: boolean
}

export interface DosegAtPayload {
  found: boolean
  kvart?: {
    name: string
    slug: string
    rank: number
    total: number
    score: number
  }
  /** Avg 30-min reach across the kvart's sample grid, km². */
  reachKm2?: number
  basis?: "kvart"
  /** Nearest stop pages, deduped by name (platform pairs collapse). */
  nearby?: NearbyStop[]
  /** Distinct lines calling within LINES_RADIUS_KM, trams first. */
  lines?: NearbyLine[]
  /** Stops reachable in 30 min transit from the nearest stop (its page data). */
  stations30?: number | null
}

function nearbyBlock(lon: number, lat: number): Pick<DosegAtPayload, "nearby" | "lines" | "stations30"> {
  let stops
  try {
    stops = loadStopIndex().stops
  } catch {
    return { nearby: [], lines: [], stations30: null }
  }

  const inRange = stops
    .map((s) => ({ s, km: fastDistKm(lat, lon, s.lat, s.lon) }))
    .filter((x) => x.km <= NEARBY_RADIUS_KM)
    .sort((a, b) => a.km - b.km)

  // Platform pairs share a name — keep only the nearest of each.
  const seen = new Set<string>()
  const nearby: NearbyStop[] = []
  for (const { s, km } of inRange) {
    if (seen.has(s.name)) continue
    seen.add(s.name)
    const distM = Math.round(km * 1000)
    nearby.push({
      slug: s.slug,
      name: s.name,
      kvart: s.kvart,
      distM,
      walkMin: Math.max(1, Math.round(distM / WALK_M_PER_MIN)),
      lineCount: s.lineCount,
    })
    if (nearby.length >= NEARBY_MAX) break
  }

  // Union of calling lines over ALL stops within the walk radius (platform
  // pairs included — directions can differ), from the per-stop page files.
  const lineMap = new Map<string, NearbyLine>()
  for (const { s, km } of inRange) {
    if (km > LINES_RADIUS_KM) break
    const data = loadStopData(s.slug)
    for (const l of data?.lines ?? [])
      if (!lineMap.has(l.broj))
        lineMap.set(l.broj, { broj: l.broj, mode: l.mode, isNight: l.isNight })
  }
  const lines = [...lineMap.values()].sort(
    (a, b) =>
      (a.mode === "tram" ? 0 : 1) - (b.mode === "tram" ? 0 : 1) ||
      Number(a.broj) - Number(b.broj)
  )

  const stations30 = nearby[0]
    ? (loadStopData(nearby[0].slug)?.reach?.stations30 ?? null)
    : null

  return { nearby, lines, stations30 }
}

export function dosegAt(lon: number, lat: number): DosegAtPayload {
  const scores = loadScores()
  const name = districtAt(lon, lat)
  const d = name ? scores?.districts.find((x) => x.name === name) : null
  if (!scores || !d) return { found: false }

  return {
    found: true,
    kvart: {
      name: d.name,
      slug: kvartSlug(d.name),
      rank: d.rank,
      total: scores.districts.length,
      score: d.score,
    },
    reachKm2: reachKm2(scores, d.avgReachableCells),
    basis: "kvart",
    ...nearbyBlock(lon, lat),
  }
}
