/**
 * Shared dithered-map crop machinery for the baked heroes (lines, stops,
 * kvartovi, home, bajs).
 *
 * Rasterises OSM building footprints (scripts/lib/osm-buildings.ts) around a
 * lon/lat bbox into the blue-on-white figure-ground: buildings become Zagreb
 * blue, everything else white. The mask is drawn ~oversampleZoom levels above
 * the fitting zoom and box-downscaled, so the urban fabric keeps its texture.
 */

import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"

import sharp from "sharp"

import { mercatorX, mercatorY } from "../../lib/geo"
import { mapConcurrent } from "./concurrency"
import { loadFootprints, rasterizeFootprints } from "./osm-buildings"
import type { Footprints } from "./osm-buildings"

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

/** The desktop + mobile crop pair every per-page hero bakes. */
export interface HeroMeta {
  desktop: HeroCrop
  mobile: HeroCrop
}

export interface DitherCropperOptions {
  /** Coverage cutoff 0–255: how much of a display pixel must be building to turn blue. */
  cutoff?: number
  blue?: [number, number, number]
  zoomOverride?: number
  zoomMin?: number
  zoomMax?: number
  oversampleZoom?: number
}

type Cfg = Required<Omit<DitherCropperOptions, "zoomOverride">> & {
  zoomOverride?: number
}

export const mercX = (lon: number, worldPx: number) => mercatorX(lon) * worldPx
export const mercY = (lat: number, worldPx: number) => mercatorY(lat) * worldPx
const invMercX = (x: number, worldPx: number) => (x / worldPx) * 360 - 180
const invMercY = (y: number, worldPx: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / worldPx))) * 180) / Math.PI

let footprints: Promise<Footprints> | undefined

/** Building mask for a native crop rect at the given zoom (1 = building). */
async function buildingMask(
  zoom: number,
  x0: number,
  y0: number,
  natW: number,
  natH: number
) {
  footprints ??= loadFootprints()
  return rasterizeFootprints(
    await footprints,
    TILE_SIZE * 2 ** zoom,
    x0,
    y0,
    natW,
    natH
  )
}

async function cropSig(
  cfg: Cfg,
  bbox: Array<number>,
  outW: number,
  outH: number,
  pad: number
): Promise<string> {
  footprints ??= loadFootprints()
  return [
    (await footprints).source,
    bbox.map((v) => v.toFixed(5)).join(","),
    `${outW}x${outH}`,
    pad,
    cfg.cutoff,
    cfg.zoomOverride ?? "",
    `zmax${cfg.zoomMax}`,
  ].join(":")
}

/** Threshold the box-averaged building coverage into a 2-colour blue/white raster. */
function thresholdToBlue(
  cfg: Cfg,
  mask: Uint8Array,
  outW: number,
  outH: number,
  scale: number
): Buffer {
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
        for (let dx = 0; dx < scale; dx++) {
          sub += mask[row + dx]
        }
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
  bbox: Array<number>,
  outW: number,
  outH: number,
  pad: number,
  prev?: HeroCrop
): Promise<HeroCrop> {
  const sig = await cropSig(cfg, bbox, outW, outH, pad)
  if (prev?.sig === sig && existsSync(outPng)) {
    return prev
  }

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
    if (
      mercX(east, worldPx) - mercX(west, worldPx) <= outW &&
      mercY(south, worldPx) - mercY(north, worldPx) <= outH
    ) {
      break
    }
    fitZoom--
  }
  const zoom =
    cfg.zoomOverride ?? Math.min(fitZoom + cfg.oversampleZoom, cfg.zoomMax)

  const worldPx = TILE_SIZE * 2 ** zoom
  const scale = 2 ** (zoom - fitZoom)
  const natW = outW * scale
  const natH = outH * scale
  const cx = (mercX(west, worldPx) + mercX(east, worldPx)) / 2
  const cy = (mercY(north, worldPx) + mercY(south, worldPx)) / 2
  const x0 = Math.round(cx - natW / 2)
  const y0 = Math.round(cy - natH / 2)

  const mask = await buildingMask(zoom, x0, y0, natW, natH)
  const out = thresholdToBlue(cfg, mask, outW, outH, scale)

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

export interface TilePyramidOptions {
  /** Root of the XYZ tree; tiles land at outDir/{z}/{x}/{y}.png. */
  outDir: string
  /** [west, south, east, north] — only tiles touching this box are baked. */
  bbox: Array<number>
  minZoom: number
  maxZoom: number
  /**
   * Pixels per baked tile. 512 fills a 256-slot at 2x, which is what keeps the
   * dither crisp on a retina screen and buys a zoom level of headroom before
   * MapLibre has to interpolate.
   */
  tileSize?: number
  /** Deepest mask zoom to sample. Bounds the raster, not the output. */
  sourceZoomMax?: number
  /** Rebake tiles that already exist on disk. */
  force?: boolean
  onZoom?: (z: number, count: number) => void
}

export interface TilePyramid {
  minZoom: number
  maxZoom: number
  /** Pixels per baked tile; the map declares half this to draw them at 2x. */
  tileSize: number
  /** [west, south, east, north] of the baked area, snapped out to tile edges. */
  bounds: [number, number, number, number]
}

/**
 * Bake one XYZ tile of the blue-on-white fabric.
 *
 * Sampling mirrors buildCrop: read the tile's extent at a deeper mask zoom and
 * box-average down, so a display pixel turns blue on the share of building under
 * it rather than on whichever single source pixel it happened to land on.
 */
async function buildTile(
  cfg: Cfg,
  z: number,
  x: number,
  y: number,
  outPath: string,
  tileSize: number,
  sourceZoomMax: number
): Promise<void> {
  const zs = Math.min(z + 1 + cfg.oversampleZoom, sourceZoomMax)
  const native = TILE_SIZE * 2 ** (zs - z)
  const scale = native / tileSize
  if (!Number.isInteger(scale) || scale < 1) {
    throw new Error(
      `tile z${z}: source zoom ${zs} gives ${native}px for a ${tileSize}px tile; ` +
        `raise sourceZoomMax to at least ${z + Math.log2(tileSize / TILE_SIZE)}`
    )
  }

  const mask = await buildingMask(zs, x * native, y * native, native, native)
  const out = thresholdToBlue(cfg, mask, tileSize, tileSize, scale)

  mkdirSync(join(outPath, ".."), { recursive: true })
  await sharp(out, { raw: { width: tileSize, height: tileSize, channels: 3 } })
    .png({ palette: true, colors: 2, dither: 0 })
    .toFile(outPath)
}

/**
 * Bake a whole XYZ pyramid over a bbox, so the fabric can back a pannable map
 * instead of a single frozen crop. Existing tiles are left alone unless forced,
 * which makes a re-run after an interrupted bake cheap.
 */
async function buildTilePyramid(
  cfg: Cfg,
  opts: TilePyramidOptions
): Promise<TilePyramid> {
  const tileSize = opts.tileSize ?? 512
  const sourceZoomMax = opts.sourceZoomMax ?? 16
  const [west, south, east, north] = opts.bbox

  let bounds: [number, number, number, number] | null = null

  for (let z = opts.minZoom; z <= opts.maxZoom; z++) {
    const n = 2 ** z
    const x0 = Math.floor(mercatorX(west) * n)
    const x1 = Math.floor(mercatorX(east) * n)
    const y0 = Math.floor(mercatorY(north) * n)
    const y1 = Math.floor(mercatorY(south) * n)

    const jobs: Array<{ x: number; y: number; path: string }> = []
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const path = join(opts.outDir, String(z), String(x), `${y}.png`)
        if (!opts.force && existsSync(path)) {
          continue
        }
        jobs.push({ x, y, path })
      }
    }

    // Deepest zoom wins the reported bounds: its tile grid is the finest, so
    // snapping out to tile edges overshoots the stations least.
    const worldPx = TILE_SIZE * n
    bounds = [
      invMercX(x0 * TILE_SIZE, worldPx),
      invMercY((y1 + 1) * TILE_SIZE, worldPx),
      invMercX((x1 + 1) * TILE_SIZE, worldPx),
      invMercY(y0 * TILE_SIZE, worldPx),
    ]

    // oxlint-disable-next-line no-await-in-loop -- zoom levels build in order so onZoom reports progress level by level
    await mapConcurrent(jobs, 4, (j) =>
      buildTile(cfg, z, j.x, j.y, j.path, tileSize, sourceZoomMax)
    )
    opts.onZoom?.(z, jobs.length)
  }

  if (!bounds) {
    throw new Error("empty zoom range")
  }
  return { minZoom: opts.minZoom, maxZoom: opts.maxZoom, tileSize, bounds }
}

export function createDitherCropper(opts: DitherCropperOptions) {
  const cfg: Cfg = {
    cutoff: opts.cutoff ?? 80,
    blue: opts.blue ?? [14, 81, 201],
    zoomOverride: opts.zoomOverride,
    zoomMin: opts.zoomMin ?? 12,
    zoomMax: opts.zoomMax ?? 16,
    oversampleZoom: opts.oversampleZoom ?? 2,
  }
  return {
    buildCrop: (
      outPng: string,
      bbox: Array<number>,
      outW: number,
      outH: number,
      pad: number,
      prev?: HeroCrop
    ) => buildCrop(cfg, outPng, bbox, outW, outH, pad, prev),
    buildTilePyramid: (pyramid: TilePyramidOptions) =>
      buildTilePyramid(cfg, pyramid),
  }
}
