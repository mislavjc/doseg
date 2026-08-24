/**
 * Bakes the still behind the /bajs hero: a blue-on-white dithered figure-ground
 * of the whole Bajs service area.
 *
 * This is only a backdrop. It is what fills the band while MapLibre boots and
 * all a reader without JavaScript ever sees; the live map draws its own ground
 * from the tile pyramid that `build-bajs-tiles.ts` bakes. Nothing is projected
 * onto this image, so it needs no bounds file and no per-breakpoint crop.
 *
 * Run: bun scripts/build-bajs-hero.ts [--cutoff 80] [--zoom 13]
 */

import { mkdirSync } from "node:fs"
import { join } from "node:path"

import { createDitherCropper } from "./lib/dither-crop"

const STATION_INFORMATION_URL =
  "https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_hd/hr/station_information.json"

// Wide and short: the band is a horizon, not a map you read distances off. The
// service area is ~2.8:1 in Mercator, so a squarer frame would be mostly empty
// countryside with the city shrunk into a strip across the middle.
const OUT_W = 2880
const OUT_H = 1040
const PAD = 0.04

const root = process.cwd()
const outPng = join(root, "public", "bajs-hero.png")
const cacheDir = join(root, ".cache", "tiles", "dark_nolabels")

const args = process.argv.slice(2)
const argValue = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined
}
const cutoff = Number(argValue("--cutoff") ?? 80)
const zoomOverride = argValue("--zoom") ? Number(argValue("--zoom")) : undefined

type Station = { lat: number; lon: number; is_virtual_station?: boolean }

async function stationBbox(): Promise<number[]> {
  const feed = (await (await fetch(STATION_INFORMATION_URL)).json()) as {
    data: { stations: Station[] }
  }
  const stations = feed.data.stations.filter((s) => !s.is_virtual_station)
  if (stations.length === 0) throw new Error("GBFS returned no stations")

  const lats = stations.map((s) => s.lat).sort((a, b) => a - b)
  const lons = stations.map((s) => s.lon).sort((a, b) => a - b)
  // Percentiles, not extremes: a handful of far-flung stations would otherwise
  // pull the frame wide and shrink the city everyone recognises to a smear.
  const pct = (v: number[], p: number) =>
    v[Math.min(v.length - 1, Math.floor(v.length * p))]

  console.error(`${stations.length} stations`)
  return [pct(lons, 0.01), pct(lats, 0.02), pct(lons, 0.99), pct(lats, 0.98)]
}

async function main() {
  mkdirSync(join(root, "public"), { recursive: true })

  // zoomMax 14: the whole service area is ~30 km across, so the fitting zoom is
  // low and the oversampling in the cropper is what keeps the fabric readable.
  const cropper = createDitherCropper({
    cacheDir,
    cutoff,
    zoomOverride,
    zoomMin: 11,
    zoomMax: 14,
  })

  const crop = await cropper.buildCrop(outPng, await stationBbox(), OUT_W, OUT_H, PAD)
  console.error(`bajs-hero.png z${crop.zoom} ${crop.width}x${crop.height}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
