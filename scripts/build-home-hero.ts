/**
 * City-wide dithered hero for the homepage banner (Paper "Home v2.0 — banner").
 * The homepage sibling of build-kvart-heroes: instead of one district's bbox,
 * it dissolves data/districts.geojson into the whole-Zagreb boundary ring
 * (districts partition the city, so shared edges cancel pairwise) and bakes a
 * low banner crop with the city sitting below the floating nav. Writes:
 *   - public/hero-zagreb.png     (desktop banner, 1440×320 @2x)
 *   - public/hero-zagreb-m.png   (mobile banner, 420×280 @2x)
 *   - data/home-hero.json        (crop bounds + simplified boundary ring)
 *
 * Tile/dither machinery is shared via scripts/lib/dither-crop.ts. Run:
 *   bun scripts/build-home-hero.ts [--zoom 14] [--cutoff 80]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { mercatorX, mercatorY, type Ring } from "../lib/geo"
import { createDitherCropper, type HeroCrop } from "./lib/dither-crop"

// topPx = city's north edge from the band top (@2x), leaving room for the
// floating nav strip; the rest of the band is fade/breathing room.
const DESKTOP = { out: "hero-zagreb.png", w: 2880, h: 640, topPx: 200 }
const MOBILE = { out: "hero-zagreb-m.png", w: 840, h: 560, topPx: 150 }
/**
 * Zoom at which the whole city fits the band height (~360 px @2x). Zoom is
 * quantized, so the band bbox is built in pixel space at this zoom — one level
 * higher and the city (719 px) overflows both bands.
 */
const Z_FIT = 10
/** Douglas-Peucker tolerance in degrees (~40 m) — banner pixels are ~60 m. */
const SIMPLIFY_TOLERANCE = 0.0004

const root = process.cwd()

const args = process.argv.slice(2)
const argValue = (n: string) => {
  const i = args.indexOf(n)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined
}

// The kvart defaults assume district scale; the city band fits at z10, so
// texture comes from deep oversampling. The default cutoff (80 ≈ 31% building
// coverage per display px) is tuned for district zoom — at ~60 m/px almost
// nothing outside the core reaches it, hence ~30 (≈12%). Desktop oversamples
// one level less than mobile: at ×16 its stitched canvas is 46080×10240
// (≈1.4 GB), which wedges sharp; ×8 keeps it in the same class as the mobile
// crop that bakes fine.
function makeCropper(oversampleZoom: number) {
  return createDitherCropper({
    cacheDir: join(root, ".cache", "tiles", "dark_nolabels"),
    cutoff: Number(argValue("--cutoff") ?? 30),
    zoomOverride: argValue("--zoom") ? Number(argValue("--zoom")) : undefined,
    zoomMin: 9,
    oversampleZoom,
  })
}
const desktopCropper = makeCropper(3)
const mobileCropper = makeCropper(4)

/** Inverse of the normalized Web Mercator y in lib/geo. */
function invMercatorY(y: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI
}

/** Shoelace signed area in lon/lat — only the sign matters here. */
function ringSignedArea(ring: Ring): number {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
  }
  return sum / 2
}

/**
 * Dissolve the district partition into the city's outer ring: edges shared by
 * two districts cancel, the surviving directed edges chain into the boundary.
 * Rings are first normalized to one winding — with mixed orientations the
 * surviving edges meet head-to-head at district junctions and the walk
 * dead-ends inside a single district.
 */
function dissolveBoundary(inputRings: Ring[]): Ring {
  const rings = inputRings.map((r) => (ringSignedArea(r) > 0 ? r : [...r].reverse()))
  const pt = ([lon, lat]: [number, number]) => `${lon.toFixed(6)},${lat.toFixed(6)}`
  const undirected = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

  const counts = new Map<string, number>()
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const k = undirected(pt(ring[i]), pt(ring[i + 1]))
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
  }

  // Surviving edges share the normalized orientation, so following next[]
  // walks the outer boundary in one consistent direction.
  const next = new Map<string, [number, number]>()
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const a = pt(ring[i])
      const b = pt(ring[i + 1])
      if (counts.get(undirected(a, b)) === 1) next.set(a, ring[i + 1])
    }
  }

  // The partition can leave tiny sliver loops besides the city ring — walk
  // every loop and keep the longest one that actually closes.
  const visited = new Set<string>()
  let best: Ring = []
  for (const start of next.keys()) {
    if (visited.has(start)) continue
    const loop: Ring = []
    let cur: string | undefined = start
    let closed = false
    while (cur) {
      if (cur === start && loop.length) {
        closed = true
        break
      }
      if (visited.has(cur)) break
      visited.add(cur)
      const n = next.get(cur)
      if (!n) break
      loop.push(n)
      cur = pt(n)
    }
    if (closed && loop.length > best.length) best = loop
  }
  console.error(`dissolve: ${next.size} boundary edges, city ring ${best.length} points`)
  if (best.length < next.size * 0.8) {
    throw new Error(
      `boundary walk incomplete: longest closed ring ${best.length} of ${next.size} edges`
    )
  }
  return best
}

/** Iterative Douglas-Peucker on [lon, lat] (lat weighted into the lon scale). */
function simplify(ring: Ring, tolerance: number): Ring {
  const keep = new Array<boolean>(ring.length).fill(false)
  keep[0] = keep[ring.length - 1] = true
  const stack: [number, number][] = [[0, ring.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    if (b - a < 2) continue
    const [ax, ay] = ring[a]
    const [bx, by] = ring[b]
    const dx = bx - ax
    const dy = (by - ay) * 1.435 // ~1/cos(45.8°): equalize degree lengths
    const len2 = dx * dx + dy * dy || 1e-12
    let maxD = -1
    let maxI = -1
    for (let i = a + 1; i < b; i++) {
      const px = ring[i][0] - ax
      const py = (ring[i][1] - ay) * 1.435
      const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2))
      const ddx = px - t * dx
      const ddy = py - t * dy
      const d = ddx * ddx + ddy * ddy
      if (d > maxD) {
        maxD = d
        maxI = i
      }
    }
    if (maxD > tolerance * tolerance) {
      keep[maxI] = true
      stack.push([a, maxI], [maxI, b])
    }
  }
  return ring.filter((_, i) => keep[i])
}

/**
 * Band bbox in pixel space at Z_FIT: horizontally centered on the city,
 * vertically placed so the city's north edge sits topPx from the band top.
 * Sized a hair under out dims so dither-crop's own fit loop lands on Z_FIT
 * and the crop window equals this bbox exactly.
 */
function bandBbox(
  bbox: number[],
  outW: number,
  outH: number,
  topPx: number
): number[] {
  const [w, , e, n] = bbox
  const worldPx = 256 * 2 ** Z_FIT
  const cx = ((mercatorX(w) + mercatorX(e)) / 2) * worldPx
  const top = mercatorY(n) * worldPx - topPx
  const invX = (x: number) => (x / worldPx) * 360 - 180
  return [
    invX(cx - (outW - 1) / 2),
    invMercatorY((top + outH - 1) / worldPx),
    invX(cx + (outW - 1) / 2),
    invMercatorY(top / worldPx),
  ]
}

interface HomeHeroData {
  desktop: HeroCrop
  mobile: HeroCrop
  boundary: Ring
}

async function main() {
  const geo = JSON.parse(readFileSync(join(root, "data/districts.geojson"), "utf-8")) as {
    features: { geometry: { coordinates: Ring[] } }[]
  }
  const boundary = simplify(
    dissolveBoundary(geo.features.map((f) => f.geometry.coordinates[0])),
    SIMPLIFY_TOLERANCE
  )
  console.error(`boundary: ${boundary.length} points after simplify`)

  let w = Infinity,
    s = Infinity,
    e = -Infinity,
    n = -Infinity
  for (const [lon, lat] of boundary) {
    if (lon < w) w = lon
    if (lon > e) e = lon
    if (lat < s) s = lat
    if (lat > n) n = lat
  }
  const bbox = [w, s, e, n]

  const outDir = join(root, "public")
  mkdirSync(outDir, { recursive: true })
  const metaPath = join(root, "data", "home-hero.json")
  const prev: HomeHeroData | undefined = existsSync(metaPath)
    ? JSON.parse(readFileSync(metaPath, "utf-8"))
    : undefined

  // Sequential on purpose: each stitch holds a few-hundred-MB canvas.
  const desktop = await desktopCropper.buildCrop(
    join(outDir, DESKTOP.out),
    bandBbox(bbox, DESKTOP.w, DESKTOP.h, DESKTOP.topPx),
    DESKTOP.w,
    DESKTOP.h,
    0,
    prev?.desktop
  )
  console.error(`desktop done (z${desktop.zoom})`)
  const mobile = await mobileCropper.buildCrop(
    join(outDir, MOBILE.out),
    bandBbox(bbox, MOBILE.w, MOBILE.h, MOBILE.topPx),
    MOBILE.w,
    MOBILE.h,
    0,
    prev?.mobile
  )
  console.error(`mobile done (z${mobile.zoom})`)

  const data: HomeHeroData = { desktop, mobile, boundary }
  writeFileSync(metaPath, JSON.stringify(data))
  console.error(
    `Done: ${DESKTOP.out} z${desktop.zoom}, ${MOBILE.out} z${mobile.zoom}, meta → ${metaPath}`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
