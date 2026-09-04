/**
 * Shared polyline geometry for route drawing/diffing, on a local equirectangular
 * projection centred on Zagreb. Distances are in metres (via `toM`); `ptSegM`
 * is plain 2D point-to-segment distance in whatever units its inputs are.
 *
 * Used by scripts/promjene/build-geometry.ts (via scripts/lib/gtfs-feed.ts) and
 * the scripts/proto/* prototypes.
 */

export const REF_LAT = 45.8 // Zagreb, for the local equirectangular projection
export const MX = 111320 * Math.cos((REF_LAT * Math.PI) / 180)
export const MY = 110540
export type LonLat = [number, number]
export const toM = ([lon, lat]: LonLat): [number, number] => [lon * MX, lat * MY]

/** Point-to-segment distance, same units as the inputs (metres when via `toM`). */
export function ptSegM(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Polyline length in metres. */
export const lenM = (line: LonLat[]) => { let s = 0; for (let i = 1; i < line.length; i++) { const a = toM(line[i - 1]), b = toM(line[i]); s += Math.hypot(b[0] - a[0], b[1] - a[1]) } return s }

/** Douglas–Peucker (lon/lat, tolerance in degrees). */
export function dp(points: LonLat[], tol: number): LonLat[] {
  if (points.length <= 2) return points
  let maxD = 0, maxI = 0
  const a = points[0], b = points[points.length - 1]
  for (let i = 1; i < points.length - 1; i++) { const d = ptSegM(points[i], a, b); if (d > maxD) { maxD = d; maxI = i } }
  return maxD > tol ? [...dp(points.slice(0, maxI + 1), tol).slice(0, -1), ...dp(points.slice(maxI), tol)] : [a, b]
}
export const simplify = (line: LonLat[]) => (line.length > 140 ? dp(line, 6e-5) : line)

/** Closest point on a polyline — GTFS stops sit a few metres off the shape, so
 * snap each onto the rendered line for clean dots-on-the-route. */
export function snap(p: LonLat, line: LonLat[]): LonLat {
  if (line.length < 2) return p
  const P = toM(p)
  let best = p, bestD = Infinity
  for (let i = 1; i < line.length; i++) {
    const A = toM(line[i - 1]), B = toM(line[i]), dx = B[0] - A[0], dy = B[1] - A[1], l2 = dx * dx + dy * dy
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / l2))
    const d = Math.hypot(P[0] - (A[0] + t * dx), P[1] - (A[1] + t * dy))
    if (d < bestD) { bestD = d; best = [line[i - 1][0] + t * (line[i][0] - line[i - 1][0]), line[i - 1][1] + t * (line[i][1] - line[i - 1][1])] }
  }
  return best
}

/** Straight-line distance in metres between two lon/lat points. */
export const distM = (a: LonLat, b: LonLat) => { const p = toM(a), q = toM(b); return Math.hypot(p[0] - q[0], p[1] - q[1]) }

/** Snap a stop onto the drawn line, rounded for compact JSON. */
export const snapStop = (s: { lat: number; lon: number; name: string }, line: LonLat[]) => { const [lon, lat] = snap([s.lon, s.lat], line); return { lat: +lat.toFixed(6), lon: +lon.toFixed(6), name: s.name } }
