/**
 * Per-line dithered hero maps for /linije/[broj].
 *
 * For each line in data/linije/, fetches CARTO dark_nolabels tiles around the
 * route bbox and renders the blue-on-white figure-ground: building footprints
 * (gray < 6 in the current CARTO style) become Zagreb blue, everything else
 * white. Tiles are fetched ~2 zoom levels above the fitting zoom and the
 * binary mask is box-downscaled to a 2880×1320 band (2× of the 1440×660 hero),
 * so the urban fabric keeps its texture at route scale. Writes:
 *   - public/linije/hero-<broj>.png
 *   - data/linije/hero-meta.json  (lon/lat bounds per crop, for the SVG route overlay)
 *
 * Tiles are cached in .cache/tiles/ so re-runs are cheap. Run:
 *   bun scripts/build-line-heroes.ts [--line 109] [--zoom 15] [--cutoff 80]
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import sharp from "sharp"

import { mercatorX, mercatorY } from "../lib/geo"

const TILE_URL = "https://basemaps.cartocdn.com/dark_nolabels"
const TILE_SIZE = 256
/**
 * Two crops per line: a fixed landscape desktop band, and a mobile band whose
 * height adapts to the route's shape (N-S routes get a tall crop, E-W routes
 * a squat one) so the band hugs the route and the hero-cloud fade never eats
 * it. Mobile also gets more padding — the fade covers a wider share of the
 * small band.
 *
 * Contract with app/linije/line-hero.tsx: the desktop crop renders at
 * viewports ≥640px (Tailwind `sm`), the mobile crop below.
 */
const DESKTOP_CROP = { suffix: "", outW: 2880, outH: 1320, pad: 0.15 } // 1440×660 @2x
const MOBILE_W = 840 // 420 @2x
const MOBILE_H_MIN = 460
const MOBILE_H_MAX = 1120
const MOBILE_PAD = 0.24
const ZOOM_MIN = 12
const ZOOM_MAX = 16
/** Fetch this many zoom levels above the fitting zoom for supersampled coverage. */
const OVERSAMPLE_ZOOM = 2
/** Building-footprint gray threshold in the current CARTO dark style. */
const BUILDING_GRAY = 6
/** Zagreb blue (--zg-blue family, same as the baked statistika assets). */
const BLUE: [number, number, number] = [14, 81, 201]
const FETCH_CONCURRENCY = 24

const root = process.cwd()
const dataDir = join(root, "data", "linije")
const outDir = join(root, "public", "linije")
const cacheDir = join(root, ".cache", "tiles", "dark_nolabels")

// --- args ---
const args = process.argv.slice(2)
function argValue(name: string): string | undefined {
  const i = args.indexOf(name)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined
}
const onlyLine = argValue("--line")
const zoomOverride = argValue("--zoom") ? Number(argValue("--zoom")) : undefined
/** Coverage cutoff 0–255: how much of a display pixel must be building to turn blue. */
const cutoff = Number(argValue("--cutoff") ?? 80)

// --- Web Mercator (normalized helpers from lib/geo, scaled to world pixels) ---
function mercX(lon: number, worldPx: number): number {
  return mercatorX(lon) * worldPx
}
function mercY(lat: number, worldPx: number): number {
  return mercatorY(lat) * worldPx
}
function invMercX(x: number, worldPx: number): number {
  return (x / worldPx) * 360 - 180
}
function invMercY(y: number, worldPx: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / worldPx))) * 180) / Math.PI
}

interface HeroCrop {
  west: number
  south: number
  east: number
  north: number
  width: number
  height: number
  zoom: number
  /** Parameter signature — crops with a matching sig are skipped on re-runs. */
  sig?: string
}

interface HeroMeta {
  desktop: HeroCrop
  mobile: HeroCrop
}

async function fetchTile(z: number, x: number, y: number): Promise<Buffer> {
  const max = 2 ** z
  if (x < 0 || y < 0 || x >= max || y >= max) {
    return sharp({
      create: { width: TILE_SIZE, height: TILE_SIZE, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer()
  }
  const cachePath = join(cacheDir, String(z), String(x), `${y}.png`)
  if (existsSync(cachePath)) return readFileSync(cachePath)
  const res = await fetch(`${TILE_URL}/${z}/${x}/${y}.png`)
  if (!res.ok) throw new Error(`tile ${z}/${x}/${y}: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  mkdirSync(join(cacheDir, String(z), String(x)), { recursive: true })
  writeFileSync(cachePath, buf)
  return buf
}

async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await fn(items[i])
      }
    })
  )
  return results
}

/** Fetch + stitch tiles covering a native crop rect, return grayscale pixels. */
async function stitchGrayCrop(
  zoom: number,
  x0: number,
  y0: number,
  natW: number,
  natH: number
): Promise<Buffer> {
  const tx0 = Math.floor(x0 / TILE_SIZE)
  const ty0 = Math.floor(y0 / TILE_SIZE)
  const tx1 = Math.floor((x0 + natW - 1) / TILE_SIZE)
  const ty1 = Math.floor((y0 + natH - 1) / TILE_SIZE)

  const tiles: { x: number; y: number }[] = []
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) tiles.push({ x: tx, y: ty })

  const buffers = await mapConcurrent(tiles, FETCH_CONCURRENCY, (t) =>
    fetchTile(zoom, t.x, t.y)
  )

  // Composite to raw pixels — a PNG encode/decode round-trip on canvases up
  // to ~200 megapixels would just burn CPU.
  const canvasW = (tx1 - tx0 + 1) * TILE_SIZE
  const stitched = await sharp({
    create: {
      width: canvasW,
      height: (ty1 - ty0 + 1) * TILE_SIZE,
      channels: 3,
      background: "#fff",
    },
    limitInputPixels: false,
  })
    .composite(
      tiles.map((t, i) => ({
        input: buffers[i],
        left: (t.x - tx0) * TILE_SIZE,
        top: (t.y - ty0) * TILE_SIZE,
      }))
    )
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { data } = await sharp(stitched.data, {
    raw: { width: canvasW, height: stitched.info.height, channels: stitched.info.channels as 3 },
    limitInputPixels: false,
  })
    .extract({ left: x0 - tx0 * TILE_SIZE, top: y0 - ty0 * TILE_SIZE, width: natW, height: natH })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return data
}

function cropSig(bbox: number[], outW: number, outH: number, pad: number): string {
  return [
    bbox.map((v) => v.toFixed(5)).join(","),
    `${outW}x${outH}`,
    pad,
    cutoff,
    BUILDING_GRAY,
    zoomOverride ?? "",
  ].join(":")
}

async function buildCrop(
  broj: string,
  bbox: number[],
  suffix: string,
  outW: number,
  outH: number,
  pad: number,
  prev?: HeroCrop
): Promise<HeroCrop> {
  // Skip work when this exact crop already exists on disk.
  const sig = cropSig(bbox, outW, outH, pad)
  if (
    prev?.sig === sig &&
    existsSync(join(outDir, `hero-${broj}${suffix}.png`))
  ) {
    return prev
  }
  const [w, s, e, n] = bbox
  const padLon = (e - w) * pad
  const padLat = (n - s) * pad
  const west = w - padLon
  const east = e + padLon
  const south = s - padLat
  const north = n + padLat

  // Largest zoom where the padded bbox fits inside the output band.
  let fitZoom = ZOOM_MAX
  while (fitZoom > ZOOM_MIN) {
    const worldPx = TILE_SIZE * 2 ** fitZoom
    const wPx = mercX(east, worldPx) - mercX(west, worldPx)
    const hPx = mercY(south, worldPx) - mercY(north, worldPx)
    if (wPx <= outW && hPx <= outH) break
    fitZoom--
  }
  const zoom = zoomOverride ?? Math.min(fitZoom + OVERSAMPLE_ZOOM, ZOOM_MAX)

  // Native crop: the output band scaled up to the fetch zoom, centred on the bbox.
  const worldPx = TILE_SIZE * 2 ** zoom
  const scale = 2 ** (zoom - fitZoom)
  const natW = outW * scale
  const natH = outH * scale
  const cx = (mercX(west, worldPx) + mercX(east, worldPx)) / 2
  const cy = (mercY(north, worldPx) + mercY(south, worldPx)) / 2
  const x0 = Math.round(cx - natW / 2)
  const y0 = Math.round(cy - natH / 2)

  const data = await stitchGrayCrop(zoom, x0, y0, natW, natH)

  // Building mask at fetch zoom → exact box-averaged coverage at output size
  // (scale is a power of two; sharp's resize kernels stripe on binary input).
  const out = Buffer.alloc(outW * outH * 3)
  const area = scale * scale
  // cutoff is calibrated against 0–255 coverage: convert to subpixel count.
  const minSub = Math.max(1, Math.round((cutoff / 255) * area))
  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      let sub = 0
      const baseY = oy * scale
      const baseX = ox * scale
      for (let dy = 0; dy < scale; dy++) {
        const row = (baseY + dy) * natW + baseX
        for (let dx = 0; dx < scale; dx++) {
          if (data[row + dx] < BUILDING_GRAY) sub++
        }
      }
      const blue = sub >= minSub
      const i = (oy * outW + ox) * 3
      out[i] = blue ? BLUE[0] : 255
      out[i + 1] = blue ? BLUE[1] : 255
      out[i + 2] = blue ? BLUE[2] : 255
    }
  }

  await sharp(out, { raw: { width: outW, height: outH, channels: 3 } })
    .png({ palette: true, colors: 2, dither: 0 })
    .toFile(join(outDir, `hero-${broj}${suffix}.png`))

  return {
    west: invMercX(x0, worldPx),
    east: invMercX(x0 + natW, worldPx),
    north: invMercY(y0, worldPx),
    south: invMercY(y0 + natH, worldPx),
    width: outW,
    height: outH,
    zoom,
    sig,
  }
}

async function buildHero(
  broj: string,
  bbox: number[],
  prev?: HeroMeta
): Promise<HeroMeta> {
  // Mobile band height follows the route's mercator aspect, clamped.
  const [w, s, e, n] = bbox
  const worldPx = TILE_SIZE * 2 ** 14 // any zoom — only the ratio matters
  const routeAspect =
    (mercY(s, worldPx) - mercY(n, worldPx)) /
    Math.max(mercX(e, worldPx) - mercX(w, worldPx), 1e-9)
  const mobileH = Math.round(
    Math.min(Math.max(MOBILE_W * routeAspect, MOBILE_H_MIN), MOBILE_H_MAX)
  )

  const d = DESKTOP_CROP
  const [desktop, mobile] = await Promise.all([
    buildCrop(broj, bbox, d.suffix, d.outW, d.outH, d.pad, prev?.desktop),
    buildCrop(broj, bbox, "-m", MOBILE_W, mobileH, MOBILE_PAD, prev?.mobile),
  ])
  return { desktop, mobile }
}

async function main() {
  mkdirSync(outDir, { recursive: true })
  const lines = readdirSync(dataDir)
    .filter((f) => /^\d+\.json$/.test(f))
    .map((f) => f.replace(".json", ""))
    .filter((b) => !onlyLine || b === onlyLine)
    .sort((a, b) => Number(a) - Number(b))

  const metaPath = join(dataDir, "hero-meta.json")
  const meta: Record<string, HeroMeta> = existsSync(metaPath)
    ? JSON.parse(readFileSync(metaPath, "utf-8"))
    : {}

  let done = 0
  await mapConcurrent(lines, 4, async (broj) => {
    const { bbox } = JSON.parse(readFileSync(join(dataDir, `${broj}.json`), "utf-8"))
    const t0 = Date.now()
    const built = await buildHero(broj, bbox, meta[broj])
    meta[broj] = built
    // Persist after every line so pages work while a long run is in flight.
    writeFileSync(metaPath, JSON.stringify(meta, null, 2))
    done++
    console.error(
      `  [${done}/${lines.length}] hero-${broj}.png z${built.desktop.zoom}/m z${built.mobile.zoom} (${((Date.now() - t0) / 1000).toFixed(1)}s)`
    )
  })

  console.error(`Done: ${lines.length} heroes, meta → ${metaPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
