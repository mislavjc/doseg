/**
 * Shared dithered-map crop machinery for the baked pSEO heroes (lines + stops).
 *
 * Fetches CARTO dark_nolabels tiles around a lon/lat bbox and renders the
 * blue-on-white figure-ground: building footprints (gray < buildingGray in the
 * current CARTO style) become Zagreb blue, everything else white. Tiles are
 * fetched ~oversampleZoom levels above the fitting zoom and box-downscaled, so
 * the urban fabric keeps its texture. Tiles cache under cacheDir so re-runs and
 * overlapping crops are cheap.
 *
 * Used by scripts/build-line-heroes.ts (route bbox) and
 * scripts/build-stop-heroes.ts (junction window around a stop).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import sharp from "sharp"

import { mercatorX, mercatorY } from "../../lib/geo"

const TILE_SIZE = 256

export interface HeroCrop {
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

export interface DitherCropperOptions {
  /** Tile cache directory (e.g. .cache/tiles/dark_nolabels). */
  cacheDir: string
  tileUrl?: string
  /** Coverage cutoff 0–255: how much of a display pixel must be building to turn blue. */
  cutoff?: number
  buildingGray?: number
  blue?: [number, number, number]
  zoomOverride?: number
  zoomMin?: number
  zoomMax?: number
  oversampleZoom?: number
  fetchConcurrency?: number
}

type Cfg = Required<Omit<DitherCropperOptions, "zoomOverride">> & {
  zoomOverride?: number
}

const mercX = (lon: number, worldPx: number) => mercatorX(lon) * worldPx
const mercY = (lat: number, worldPx: number) => mercatorY(lat) * worldPx
const invMercX = (x: number, worldPx: number) => (x / worldPx) * 360 - 180
const invMercY = (y: number, worldPx: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / worldPx))) * 180) / Math.PI

export async function mapConcurrent<T, R>(
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

function whiteTile(): Promise<Buffer> {
  return sharp({ create: { width: TILE_SIZE, height: TILE_SIZE, channels: 3, background: "#fff" } })
    .png()
    .toBuffer()
}

async function fetchTile(cfg: Cfg, z: number, x: number, y: number): Promise<Buffer> {
  const max = 2 ** z
  if (x < 0 || y < 0 || x >= max || y >= max) return whiteTile()
  const cachePath = join(cfg.cacheDir, String(z), String(x), `${y}.png`)
  if (existsSync(cachePath)) return readFileSync(cachePath)
  // Retry transient failures (CDN throttling on a big z17/z18 sweep), then fall
  // back to a white tile so one bad tile can't abort the whole batch.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`${cfg.tileUrl}/${z}/${x}/${y}.png`)
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        mkdirSync(join(cfg.cacheDir, String(z), String(x)), { recursive: true })
        writeFileSync(cachePath, buf)
        return buf
      }
    } catch {
      // network error — fall through to backoff/retry
    }
    await new Promise((r) => setTimeout(r, 250 * (attempt + 1)))
  }
  console.error(`tile ${z}/${x}/${y}: gave up after retries, using white`)
  return whiteTile()
}

/** Fetch + stitch tiles covering a native crop rect, return grayscale pixels. */
async function stitchGrayCrop(
  cfg: Cfg,
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
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) tiles.push({ x: tx, y: ty })

  const buffers = await mapConcurrent(tiles, cfg.fetchConcurrency, (t) => fetchTile(cfg, zoom, t.x, t.y))

  const canvasW = (tx1 - tx0 + 1) * TILE_SIZE
  const stitched = await sharp({
    create: { width: canvasW, height: (ty1 - ty0 + 1) * TILE_SIZE, channels: 3, background: "#fff" },
    limitInputPixels: false,
  })
    .composite(tiles.map((t, i) => ({ input: buffers[i], left: (t.x - tx0) * TILE_SIZE, top: (t.y - ty0) * TILE_SIZE })))
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

function cropSig(cfg: Cfg, bbox: number[], outW: number, outH: number, pad: number): string {
  return [
    bbox.map((v) => v.toFixed(5)).join(","),
    `${outW}x${outH}`,
    pad,
    cfg.cutoff,
    cfg.buildingGray,
    cfg.zoomOverride ?? "",
    `zmax${cfg.zoomMax}`,
  ].join(":")
}

/** Threshold the box-averaged building coverage into a 2-colour blue/white raster. */
function thresholdToBlue(cfg: Cfg, data: Buffer, outW: number, outH: number, scale: number): Buffer {
  const out = Buffer.alloc(outW * outH * 3)
  const natW = outW * scale
  const minSub = Math.max(1, Math.round((cfg.cutoff / 255) * scale * scale))
  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      let sub = 0
      const baseY = oy * scale
      const baseX = ox * scale
      for (let dy = 0; dy < scale; dy++) {
        const row = (baseY + dy) * natW + baseX
        for (let dx = 0; dx < scale; dx++) if (data[row + dx] < cfg.buildingGray) sub++
      }
      const isBlue = sub >= minSub
      const i = (oy * outW + ox) * 3
      out[i] = isBlue ? cfg.blue[0] : 255
      out[i + 1] = isBlue ? cfg.blue[1] : 255
      out[i + 2] = isBlue ? cfg.blue[2] : 255
    }
  }
  return out
}

async function buildCrop(
  cfg: Cfg,
  outPng: string,
  bbox: number[],
  outW: number,
  outH: number,
  pad: number,
  prev?: HeroCrop
): Promise<HeroCrop> {
  const sig = cropSig(cfg, bbox, outW, outH, pad)
  if (prev?.sig === sig && existsSync(outPng)) return prev

  const [w, s, e, n] = bbox
  const padLon = (e - w) * pad
  const padLat = (n - s) * pad
  const west = w - padLon
  const east = e + padLon
  const south = s - padLat
  const north = n + padLat

  let fitZoom = cfg.zoomMax
  while (fitZoom > cfg.zoomMin) {
    const worldPx = TILE_SIZE * 2 ** fitZoom
    if (mercX(east, worldPx) - mercX(west, worldPx) <= outW && mercY(south, worldPx) - mercY(north, worldPx) <= outH)
      break
    fitZoom--
  }
  const zoom = cfg.zoomOverride ?? Math.min(fitZoom + cfg.oversampleZoom, cfg.zoomMax)

  const worldPx = TILE_SIZE * 2 ** zoom
  const scale = 2 ** (zoom - fitZoom)
  const natW = outW * scale
  const natH = outH * scale
  const cx = (mercX(west, worldPx) + mercX(east, worldPx)) / 2
  const cy = (mercY(north, worldPx) + mercY(south, worldPx)) / 2
  const x0 = Math.round(cx - natW / 2)
  const y0 = Math.round(cy - natH / 2)

  const data = await stitchGrayCrop(cfg, zoom, x0, y0, natW, natH)
  const out = thresholdToBlue(cfg, data, outW, outH, scale)

  mkdirSync(join(outPng, ".."), { recursive: true })
  await sharp(out, { raw: { width: outW, height: outH, channels: 3 } })
    .png({ palette: true, colors: 2, dither: 0 })
    .toFile(outPng)

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

export function createDitherCropper(opts: DitherCropperOptions) {
  const cfg: Cfg = {
    cacheDir: opts.cacheDir,
    tileUrl: opts.tileUrl ?? "https://basemaps.cartocdn.com/dark_nolabels",
    cutoff: opts.cutoff ?? 80,
    buildingGray: opts.buildingGray ?? 6,
    blue: opts.blue ?? [14, 81, 201],
    zoomOverride: opts.zoomOverride,
    zoomMin: opts.zoomMin ?? 12,
    zoomMax: opts.zoomMax ?? 16,
    oversampleZoom: opts.oversampleZoom ?? 2,
    fetchConcurrency: opts.fetchConcurrency ?? 24,
  }
  return {
    buildCrop: (outPng: string, bbox: number[], outW: number, outH: number, pad: number, prev?: HeroCrop) =>
      buildCrop(cfg, outPng, bbox, outW, outH, pad, prev),
  }
}
