/** Precomputed geographic constants for Zagreb latitude (~45.8°) */
const COS_LAT = Math.cos((45.8 * Math.PI) / 180)
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

/** Geographic bounds of a baked hero crop (subset of LineHeroCrop). */
export interface CropBounds {
  west: number
  east: number
  north: number
  south: number
}

/** lon/lat → hero-crop viewBox coordinates (Mercator-true vertically) — the
 *  shared projector behind every baked-hero overlay (line/stop/home heroes). */
export function projector(crop: CropBounds, viewW: number, viewH: number) {
  const yTop = mercatorY(crop.north)
  const yBottom = mercatorY(crop.south)
  return (lon: number, lat: number): [number, number] => [
    ((lon - crop.west) / (crop.east - crop.west)) * viewW,
    ((mercatorY(lat) - yTop) / (yBottom - yTop)) * viewH,
  ]
}

/** A linear ring of [lon, lat] positions (GeoJSON order, closed or not). */
export type Ring = Array<[number, number]>

/** Ring → closed SVG path in hero-crop units, plus a name badge box centred
 *  on the ring's x mean and its y mean (`centroid`) or lowest point
 *  (`bottom`), clamped clear of the nav strip and the band edges. */
export function boundaryLabel(
  ring: Ring,
  crop: CropBounds,
  viewW: number,
  viewH: number,
  label: string,
  anchor: "centroid" | "bottom"
) {
  const project = projector(crop, viewW, viewH)
  const pts = ring.map(([lon, lat]) => project(lon, lat))
  const path =
    pts.length > 0
      ? `M ${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ")} Z`
      : ""
  const cx = pts.reduce((s, p) => s + p[0], 0) / (pts.length || 1)
  const cy =
    anchor === "centroid"
      ? pts.reduce((s, p) => s + p[1], 0) / (pts.length || 1)
      : pts.reduce((s, p) => Math.max(s, p[1]), 0)
  const w = label.length * 8.9 + 20
  const h = 28
  const x = Math.min(Math.max(cx - w / 2, 8), viewW - w - 8)
  const y = Math.min(Math.max(cy - h / 2, 84), viewH - h - 8)
  return { path, box: { x, y, w, h } }
}

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
  coordinates: Array<Array<Ring>>
): boolean {
  for (const polygon of coordinates) {
    if (!pointInRing(lon, lat, polygon[0])) {
      continue
    }
    let inHole = false
    for (let r = 1; r < polygon.length; r++) {
      if (pointInRing(lon, lat, polygon[r])) {
        inHole = true
        break
      }
    }
    if (!inHole) {
      return true
    }
  }
  return false
}

/** Shoelace area of one ring in km², flat-earth projection at Zagreb latitude. */
function ringAreaKm2(ring: Ring): number {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum +=
      (ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]) *
      KM_PER_DEG_LON *
      KM_PER_DEG_LAT
  }
  return Math.abs(sum) / 2
}

/** Area of GeoJSON MultiPolygon coordinates in km² (outer rings minus holes). */
export function multiPolygonAreaKm2(coordinates: Array<Array<Ring>>): number {
  let area = 0
  for (const polygon of coordinates) {
    for (let r = 0; r < polygon.length; r++) {
      area += (r === 0 ? 1 : -1) * ringAreaKm2(polygon[r])
    }
  }
  return Math.max(0, area)
}

/** Shared walking pace (~4.5 km/h) for "N min hoda" copy across surfaces. */
const WALK_M_PER_MIN = 75

/** Straight-line metres → whole walking minutes, never less than 1. */
export function walkMin(distM: number): number {
  return Math.max(1, Math.round(distM / WALK_M_PER_MIN))
}
