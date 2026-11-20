/**
 * Bakes the still that sits under the /karta map while MapLibre boots: the
 * dithered figure-ground of central Zagreb, framed on the map's opening view
 * (KARTA_CENTER at KARTA_ZOOM, lib/map-styles.ts), so the vector map lands on
 * top of it instead of replacing a blank screen. It is server-rendered, so it
 * is the page's LCP instead of the map attribution.
 *
 * The fabric is cut from the /bajs tile pyramid (public/bajs-tiles, baked by
 * build-bajs-tiles.ts), which covers the whole service area, and recoloured
 * from Zagreb blue to --blue-pale: the light basemap paints over it, so it has
 * to read as the same quiet ground, not as a second, louder map.
 *
 * Two crops, both centred on the map centre and drawn centred on the page:
 *   - public/karta-placeholder.png    wide screens, covers 1920x1200 css px
 *   - public/karta-placeholder-m.png  phones, covers 480x1000 css px
 *
 * Run: bun scripts/build-karta-placeholder.ts
 */

import { join } from "node:path"

import sharp from "sharp"

import { mercatorX, mercatorY } from "../lib/geo"
import {
  KARTA_CENTER,
  KARTA_PLACEHOLDER_SCALE,
  KARTA_PLACEHOLDER_ZOOM,
} from "../lib/map-styles"

const CROPS = [
  { out: "karta-placeholder.png", cssW: 1920, cssH: 1200 },
  { out: "karta-placeholder-m.png", cssW: 480, cssH: 1000 },
]

/** --blue-pale in app/globals.css. */
const PALE: [number, number, number] = [194, 210, 242]

/** The pyramid's 512 px tiles are drawn at 256, so tile zoom z holds the
 * detail of a 256 px map at z + 1. */
const TILE_PX = 512
const tileZoom = KARTA_PLACEHOLDER_ZOOM - 1
const tilesDir = join(process.cwd(), "public", "bajs-tiles", String(tileZoom))

async function bake(out: string, cssW: number, cssH: number) {
  const w = Math.round(cssW / KARTA_PLACEHOLDER_SCALE / 2) * 2
  const h = Math.round(cssH / KARTA_PLACEHOLDER_SCALE / 2) * 2
  const worldPx = TILE_PX * 2 ** tileZoom
  const x0 = Math.round(mercatorX(KARTA_CENTER[0]) * worldPx - w / 2)
  const y0 = Math.round(mercatorY(KARTA_CENTER[1]) * worldPx - h / 2)

  const tiles = []
  for (let tx = Math.floor(x0 / TILE_PX); tx <= Math.floor((x0 + w - 1) / TILE_PX); tx++)
    {for (let ty = Math.floor(y0 / TILE_PX); ty <= Math.floor((y0 + h - 1) / TILE_PX); ty++)
      {tiles.push({
        input: join(tilesDir, String(tx), `${ty}.png`),
        left: tx * TILE_PX - x0,
        top: ty * TILE_PX - y0,
      })}}

  // Composite onto an oversized canvas (tiles hang off every edge), then cut.
  const pad = TILE_PX
  const canvas = await sharp({
    create: { width: w + 2 * pad, height: h + 2 * pad, channels: 3, background: "#ffffff" },
  })
    .composite(tiles.map((t) => ({ ...t, left: t.left + pad, top: t.top + pad })))
    .png()
    .toBuffer()
  const stitched = await sharp(canvas)
    .extract({ left: pad, top: pad, width: w, height: h })
    .greyscale()
    .raw()
    .toBuffer()

  const rgb = Buffer.alloc(w * h * 3, 255)
  for (let i = 0; i < w * h; i++) {
    if (stitched[i] < 200) {rgb.set(PALE, i * 3)}
  }
  await sharp(rgb, { raw: { width: w, height: h, channels: 3 } })
    .png({ palette: true, colours: 2, dither: 0 })
    .toFile(join(process.cwd(), "public", out))
  console.error(`${out}: ${w}x${h} from bajs-tiles z${tileZoom}, ${tiles.length} tiles`)
}

await Promise.all(CROPS.map((c) => bake(c.out, c.cssW, c.cssH)))
