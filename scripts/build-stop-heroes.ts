/**
 * Per-stop dithered hero maps for /stanice/[slug].
 *
 * For each stop (default: those with ≥3 lines, the set in the sitemap), bakes a
 * blue-on-white figure-ground crop of the junction window (data.hero.bbox) and
 * writes:
 *   - public/stanice/hero-<slug>.png       (desktop, 2880×1120 @2x)
 *   - public/stanice/hero-<slug>-m.png     (mobile,  1500×1180 @2x)
 *   - data/stanice/hero-meta.json          (lon/lat bounds per crop, for the SVG overlay)
 *
 * The SVG overlay (line corridors + stop marker + to/from points) is drawn at
 * runtime by app/stanice/stop-hero.tsx from data.hero — these baked maps are the
 * dithered ground under it. Stops without a baked map fall back to the overlay
 * on plain white. Tiles cache in .cache/tiles/ (shared with the line heroes).
 *
 *   bun scripts/build-stop-heroes.ts [--stop reljkoviceva] [--min-lines 3] [--cutoff 80]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { createDitherCropper, type HeroCrop, mapConcurrent } from "./lib/dither-crop"

const DESKTOP = { suffix: "", outW: 2880, outH: 1120, pad: 0.18 }
const MOBILE = { suffix: "-m", outW: 1500, outH: 1180, pad: 0.22 }

const root = process.cwd()
const dataDir = join(root, "data", "stanice")
const outDir = join(root, "public", "stanice")
const cacheDir = join(root, ".cache", "tiles", "dark_nolabels")

const args = process.argv.slice(2)
function argValue(name: string): string | undefined {
  const i = args.indexOf(name)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined
}
const onlyStop = argValue("--stop")
const minLines = Number(argValue("--min-lines") ?? 3)
const cutoff = Number(argValue("--cutoff") ?? 80)
const zoomOverride = argValue("--zoom") ? Number(argValue("--zoom")) : undefined

interface HeroMeta {
  desktop: HeroCrop
  mobile: HeroCrop
}

// Stops crop a junction window, deeper than the line heroes (km-wide routes).
// zoomMax 17 → a ~2.4 km-wide crop centred on the stop: enough surrounding city
// to recognise the part of town, while the junction stays legible. (z16 ≈ 4.8 km
// reads generic; z18 ≈ 1.2 km is too tight to place.) Tiles fetched on first run.
const cropper = createDitherCropper({ cacheDir, cutoff, zoomOverride, zoomMax: 17 })

async function main() {
  mkdirSync(outDir, { recursive: true })

  const index = JSON.parse(readFileSync(join(dataDir, "index.json"), "utf-8")) as {
    stops: { slug: string; lineCount: number }[]
  }
  const slugs = index.stops
    .filter((s) => (onlyStop ? s.slug === onlyStop : s.lineCount >= minLines))
    .map((s) => s.slug)

  const metaPath = join(dataDir, "hero-meta.json")
  const meta: Record<string, HeroMeta> = existsSync(metaPath)
    ? JSON.parse(readFileSync(metaPath, "utf-8"))
    : {}

  let done = 0
  await mapConcurrent(slugs, 4, async (slug) => {
    const { hero } = JSON.parse(readFileSync(join(dataDir, `${slug}.json`), "utf-8")) as {
      hero: { bbox: number[] }
    }
    const t0 = Date.now()
    const prev = meta[slug]
    const [desktop, mobile] = await Promise.all([
      cropper.buildCrop(join(outDir, `hero-${slug}${DESKTOP.suffix}.png`), hero.bbox, DESKTOP.outW, DESKTOP.outH, DESKTOP.pad, prev?.desktop),
      cropper.buildCrop(join(outDir, `hero-${slug}${MOBILE.suffix}.png`), hero.bbox, MOBILE.outW, MOBILE.outH, MOBILE.pad, prev?.mobile),
    ])
    meta[slug] = { desktop, mobile }
    // Persist after every stop so pages work while a long run is in flight.
    writeFileSync(metaPath, JSON.stringify(meta, null, 2))
    done++
    console.error(
      `  [${done}/${slugs.length}] hero-${slug}.png z${desktop.zoom}/m z${mobile.zoom} (${((Date.now() - t0) / 1000).toFixed(1)}s)`
    )
  })

  console.error(`Done: ${slugs.length} stop heroes, meta → ${metaPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
