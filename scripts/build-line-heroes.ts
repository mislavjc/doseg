/**
 * Per-line dithered hero maps for /linije/[broj].
 *
 * For each line in data/linije/, rasterises OSM building footprints around the
 * route bbox (scripts/lib/dither-crop.ts) into the blue-on-white
 * figure-ground, oversampled ~2 zoom levels and box-downscaled to a 2880×1320
 * band (2× of the 1440×660 hero), so the urban fabric keeps its texture at
 * route scale. Writes:
 *   - public/linije/hero-<broj>.png
 *   - data/linije/hero-meta.json  (lon/lat bounds per crop, for the SVG route overlay)
 *
 * Crops whose parameter signature is unchanged are skipped, so re-runs are
 * cheap. Run:
 *   bun scripts/build-line-heroes.ts [--line 109] [--zoom 15] [--cutoff 80]
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { argValue } from "./lib/args"
import { mapConcurrent } from "./lib/concurrency"
import { createDitherCropper, type HeroMeta, mercX, mercY } from "./lib/dither-crop"
import { readJson } from "./lib/json"

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
// 1440×660 @2x
const DESKTOP_CROP = { suffix: "", outW: 2880, outH: 1320, pad: 0.15 }
// 420 @2x
const MOBILE_W = 840
const MOBILE_H_MIN = 460
const MOBILE_H_MAX = 1120
const MOBILE_PAD = 0.24

const root = process.cwd()
const dataDir = join(root, "data", "linije")
const outDir = join(root, "public", "linije")

const onlyLine = argValue("--line")
const zoomOverride = argValue("--zoom") ? Number(argValue("--zoom")) : undefined
/** Coverage cutoff 0–255: how much of a display pixel must be building to turn blue. */
const cutoff = Number(argValue("--cutoff") ?? 80)

const cropper = createDitherCropper({ cutoff, zoomOverride })

async function buildHero(
  broj: string,
  bbox: number[],
  prev?: HeroMeta
): Promise<HeroMeta> {
  // Mobile band height follows the route's mercator aspect, clamped.
  const [w, s, e, n] = bbox
  // any zoom — only the ratio matters
  const worldPx = TILE_SIZE * 2 ** 14
  const routeAspect =
    (mercY(s, worldPx) - mercY(n, worldPx)) /
    Math.max(mercX(e, worldPx) - mercX(w, worldPx), 1e-9)
  const mobileH = Math.round(
    Math.min(Math.max(MOBILE_W * routeAspect, MOBILE_H_MIN), MOBILE_H_MAX)
  )

  const d = DESKTOP_CROP
  const [desktop, mobile] = await Promise.all([
    cropper.buildCrop(join(outDir, `hero-${broj}${d.suffix}.png`), bbox, d.outW, d.outH, d.pad, prev?.desktop),
    cropper.buildCrop(join(outDir, `hero-${broj}-m.png`), bbox, MOBILE_W, mobileH, MOBILE_PAD, prev?.mobile),
  ])
  return { desktop, mobile }
}

async function main() {
  mkdirSync(outDir, { recursive: true })
  const lines = readdirSync(dataDir)
    .filter((f) => /^\d+\.json$/u.test(f))
    .map((f) => f.replace(".json", ""))
    .filter((b) => !onlyLine || b === onlyLine)
    .toSorted((a, b) => Number(a) - Number(b))

  const metaPath = join(dataDir, "hero-meta.json")
  const meta: Record<string, HeroMeta> = existsSync(metaPath)
    ? readJson<Record<string, HeroMeta>>(metaPath)
    : {}

  let done = 0
  await mapConcurrent(lines, 4, async (broj) => {
    const { bbox } = readJson<{ bbox: number[] }>(join(dataDir, `${broj}.json`))
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

await main()
