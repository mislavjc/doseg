/**
 * Per-kvart dithered hero maps for /kvartovi/[slug] — the district sibling of the
 * line/stop heroes. For each district in data/districts.geojson, bakes the
 * blue-on-white building figure-ground crop of its bbox via the shared
 * dither-crop engine, and writes:
 *   - public/kvart/hero-<slug>.png  (+ -m mobile crop)
 *   - data/kvart/hero-meta.json     (lon/lat bounds per crop, for the border overlay)
 *
 * Tile/dither machinery is shared via scripts/lib/dither-crop.ts (same as the
 * line + stop heroes); tiles cache at .cache/tiles/dark_nolabels. Run:
 *   bun scripts/build-kvart-heroes.ts [--kvart tresnjevka-sjever] [--zoom 14] [--cutoff 80]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { mercatorX, mercatorY, type Ring } from "../lib/geo"
import { kvartSlug } from "../lib/kvart-slug"
import { createDitherCropper, type HeroCrop, mapConcurrent } from "./lib/dither-crop"

// Slim band, zoomed out so the district sits clear of the nav with margin.
const DESKTOP_CROP = { suffix: "", outW: 2880, outH: 800, pad: 0.45 } // 1440×400 @2x
const MOBILE_W = 840
const MOBILE_H_MIN = 420
const MOBILE_H_MAX = 720
const MOBILE_PAD = 0.5

const root = process.cwd()
const outDir = join(root, "public", "kvart")
const dataDir = join(root, "data", "kvart")
const cacheDir = join(root, ".cache", "tiles", "dark_nolabels")

const args = process.argv.slice(2)
const argValue = (n: string) => {
  const i = args.indexOf(n)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined
}
const onlyKvart = argValue("--kvart")
const zoomOverride = argValue("--zoom") ? Number(argValue("--zoom")) : undefined
const cutoff = Number(argValue("--cutoff") ?? 80)

const cropper = createDitherCropper({ cacheDir, cutoff, zoomOverride })

interface HeroMeta {
  desktop: HeroCrop
  mobile: HeroCrop
}

function bboxOf(coords: Ring[]): number[] {
  let w = Infinity,
    s = Infinity,
    e = -Infinity,
    n = -Infinity
  for (const [lon, lat] of coords[0]) {
    if (lon < w) w = lon
    if (lon > e) e = lon
    if (lat < s) s = lat
    if (lat > n) n = lat
  }
  return [w, s, e, n]
}

async function buildHero(slug: string, bbox: number[], prev?: HeroMeta): Promise<HeroMeta> {
  // Mobile band height follows the district's mercator aspect, clamped (worldPx
  // cancels in the ratio, so the normalized mercator projections suffice).
  const [w, s, e, n] = bbox
  const aspect =
    (mercatorY(s) - mercatorY(n)) / Math.max(mercatorX(e) - mercatorX(w), 1e-9)
  const mobileH = Math.round(Math.min(Math.max(MOBILE_W * aspect, MOBILE_H_MIN), MOBILE_H_MAX))
  const d = DESKTOP_CROP
  const [desktop, mobile] = await Promise.all([
    cropper.buildCrop(join(outDir, `hero-${slug}${d.suffix}.png`), bbox, d.outW, d.outH, d.pad, prev?.desktop),
    cropper.buildCrop(join(outDir, `hero-${slug}-m.png`), bbox, MOBILE_W, mobileH, MOBILE_PAD, prev?.mobile),
  ])
  return { desktop, mobile }
}

async function main() {
  mkdirSync(outDir, { recursive: true })
  mkdirSync(dataDir, { recursive: true })
  const geo = JSON.parse(readFileSync(join(root, "data/districts.geojson"), "utf-8")) as {
    features: { properties: { name: string }; geometry: { coordinates: Ring[] } }[]
  }
  const districts = geo.features
    .map((f) => ({ slug: kvartSlug(f.properties.name), bbox: bboxOf(f.geometry.coordinates) }))
    .filter((d) => !onlyKvart || d.slug === onlyKvart)

  const metaPath = join(dataDir, "hero-meta.json")
  const meta: Record<string, HeroMeta> = existsSync(metaPath)
    ? JSON.parse(readFileSync(metaPath, "utf-8"))
    : {}

  let done = 0
  await mapConcurrent(districts, 3, async ({ slug, bbox }) => {
    const t0 = Date.now()
    meta[slug] = await buildHero(slug, bbox, meta[slug])
    // Persist after each district so a long run survives an interruption.
    writeFileSync(metaPath, JSON.stringify(meta, null, 2))
    done++
    console.error(
      `  [${done}/${districts.length}] hero-${slug}.png z${meta[slug].desktop.zoom}/m z${meta[slug].mobile.zoom} (${((Date.now() - t0) / 1000).toFixed(1)}s)`
    )
  })
  console.error(`Done: ${districts.length} kvart heroes, meta → ${metaPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
