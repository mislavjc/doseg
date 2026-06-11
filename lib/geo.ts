/** Precomputed geographic constants for Zagreb latitude (~45.8°) */
export const COS_LAT = Math.cos((45.8 * Math.PI) / 180)
export const KM_PER_DEG_LAT = 111.32
export const KM_PER_DEG_LON = 111.32 * COS_LAT

/** Normalized Web Mercator x (0..1 world) */
export function mercatorX(lon: number): number {
  return (lon + 180) / 360
}

/** Normalized Web Mercator y (0..1 world) */
export function mercatorY(lat: number): number {
  const r = (lat * Math.PI) / 180
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2
}

/** Fast approximate distance in km using flat-earth projection at Zagreb latitude */
export function fastDistKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dlat = (lat2 - lat1) * KM_PER_DEG_LAT
  const dlon = (lon2 - lon1) * KM_PER_DEG_LON
  return Math.sqrt(dlat * dlat + dlon * dlon)
}

/** A linear ring of [lon, lat] positions (GeoJSON order, closed or not). */
export type Ring = [number, number][]

/** Ray-casting point-in-ring test ([lon, lat] GeoJSON order). */
export function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside
    }
  }
  return inside
}

/** Point-in-polygon over GeoJSON MultiPolygon coordinates (holes respected). */
export function pointInMultiPolygon(
  lon: number,
  lat: number,
  coordinates: Ring[][]
): boolean {
  for (const polygon of coordinates) {
    if (!pointInRing(lon, lat, polygon[0])) continue
    let inHole = false
    for (let r = 1; r < polygon.length; r++) {
      if (pointInRing(lon, lat, polygon[r])) {
        inHole = true
        break
      }
    }
    if (!inHole) return true
  }
  return false
}

/** Shoelace area of one ring in km², flat-earth projection at Zagreb latitude. */
export function ringAreaKm2(ring: Ring): number {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]) * KM_PER_DEG_LON * KM_PER_DEG_LAT
  }
  return Math.abs(sum) / 2
}

/** Area of GeoJSON MultiPolygon coordinates in km² (outer rings minus holes). */
export function multiPolygonAreaKm2(coordinates: Ring[][]): number {
  let area = 0
  for (const polygon of coordinates) {
    for (let r = 0; r < polygon.length; r++) {
      area += (r === 0 ? 1 : -1) * ringAreaKm2(polygon[r])
    }
  }
  return Math.max(0, area)
}
