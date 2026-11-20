import { getBajsData } from "@/lib/bajs"
import { fastDistKm, walkMin } from "@/lib/geo"
import { loadPois } from "@/lib/kvart-data"
import type { PoiKey } from "@/lib/kvart-data"

/**
 * Address surroundings for /adresa/[slug]: nearest named POI per category
 * (baked OSM snapshot, same loader as the kvart Blizina section) and nearest
 * Bajs stations with live bike counts (GBFS via lib/bajs, TTL-cached, names
 * already de-shouted at the feed adapter). Distances are straight-line; walk
 * minutes use the shared 75 m/min pace from lib/geo.
 */

const BAJS_MAX = 3
const BAJS_RADIUS_KM = 1.2

const POI_KEYS: ReadonlyArray<string> = [
  "hospital",
  "school",
  "park",
] satisfies Array<PoiKey>

function isPoiKey(category: string): category is PoiKey {
  return POI_KEYS.includes(category)
}

export interface NearestPoi {
  key: PoiKey
  name: string
  lat: number
  lon: number
  distM: number
  walkMin: number
}

/** Nearest NAMED poi per category, sorted by walk time (closest first). */
export function nearestPois(lon: number, lat: number): Array<NearestPoi> {
  const best = new Map<string, NearestPoi>()
  for (const p of loadPois()) {
    if (!p.name || !isPoiKey(p.category)) {
      continue
    }
    const distM = Math.round(fastDistKm(lat, lon, p.lat, p.lon) * 1000)
    const seen = best.get(p.category)
    if (!seen || distM < seen.distM) {
      best.set(p.category, {
        key: p.category,
        name: p.name,
        lat: p.lat,
        lon: p.lon,
        distM,
        walkMin: walkMin(distM),
      })
    }
  }
  return [...best.values()].toSorted((a, b) => a.distM - b.distM)
}

export interface NearestBajs {
  name: string
  distM: number
  walkMin: number
  bikesAvailable: number
}

/** Nearest Bajs stations with live bike counts; [] when the feed is down or
 *  nothing is within riding-relevant walking distance. */
export async function nearestBajs(
  lon: number,
  lat: number
): Promise<Array<NearestBajs>> {
  try {
    const { stations } = await getBajsData()
    return stations
      .map((s) => {
        const distM = Math.round(fastDistKm(lat, lon, s.lat, s.lon) * 1000)
        return {
          name: s.name,
          distM,
          walkMin: walkMin(distM),
          bikesAvailable: s.bikesAvailable,
        }
      })
      .filter((s) => s.distM <= BAJS_RADIUS_KM * 1000)
      .toSorted((a, b) => a.distM - b.distM)
      .slice(0, BAJS_MAX)
  } catch {
    return []
  }
}
