import { join } from "node:path"

import { loadScores, reachKm2 } from "@/lib/district-scores"
import { fastDistKm, pointInRing, walkMin, type Ring } from "@/lib/geo"
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
  /** Best (smallest) peak headway among nearby stops, minutes; null when the
   *  feed has no headway for this line (known gap on central hubs). */
  peakMin: number | null
  /** Headsign at the stop that provided peakMin — "prema X" in the UI. */
  headsign: string | null
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
  /** First/last departure at the nearest stop ("4:10" / "0:49"). */
  firstDeparture?: string | null
  lastDeparture?: string | null
}

function nearbyBlock(
  lon: number,
  lat: number
): Pick<DosegAtPayload, "nearby" | "lines" | "firstDeparture" | "lastDeparture"> {
  let stops
  try {
    stops = loadStopIndex().stops
  } catch {
    return { nearby: [], lines: [] }
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
      walkMin: walkMin(distM),
      lineCount: s.lineCount,
    })
    if (nearby.length >= NEARBY_MAX) break
  }

  // Union of calling lines over ALL stops within the walk radius (platform
  // pairs included — directions can differ), from the per-stop page files.
  // Each line keeps its best peak headway across those stops.
  const lineMap = new Map<string, NearbyLine>()
  for (const { s, km } of inRange) {
    if (km > LINES_RADIUS_KM) break
    const data = loadStopData(s.slug)
    for (const l of data?.lines ?? []) {
      const seen = lineMap.get(l.broj)
      const peakMin = l.peakHeadwayMin ?? null
      if (!seen) {
        lineMap.set(l.broj, {
          broj: l.broj,
          mode: l.mode,
          isNight: l.isNight,
          peakMin,
          headsign: l.headsign ?? null,
        })
      } else if (peakMin !== null && (seen.peakMin === null || peakMin < seen.peakMin)) {
        seen.peakMin = peakMin
        seen.headsign = l.headsign ?? seen.headsign
      }
    }
  }
  const lines = [...lineMap.values()].sort(
    (a, b) =>
      (a.mode === "tram" ? 0 : 1) - (b.mode === "tram" ? 0 : 1) ||
      Number(a.broj) - Number(b.broj)
  )

  const nearestData = nearby[0] ? loadStopData(nearby[0].slug) : null
  return {
    nearby,
    lines,
    firstDeparture: nearestData?.firstDeparture ?? null,
    lastDeparture: nearestData?.lastDeparture ?? null,
  }
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
