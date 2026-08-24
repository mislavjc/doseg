/**
 * Bakes the /bajs basemap: the blue-on-white dithered figure-ground of the Bajs
 * service area, cut into XYZ tiles so the hero can be panned and zoomed instead
 * of sitting there as one frozen crop.
 *
 * Tiles are 512 px filling a 256 slot (2x), which keeps the fabric crisp on a
 * retina screen and buys a zoom level before MapLibre has to interpolate.
 *
 * Run: bun scripts/build-bajs-tiles.ts [--force] [--cutoff 80] [--max-zoom 15]
 * Re-run when the station network grows past the current frame; existing tiles
 * are skipped, so extending the box only bakes what is new.
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { createDitherCropper } from "./lib/dither-crop"

const STATION_INFORMATION_URL =
  "https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_hd/hr/station_information.json"

const root = process.cwd()
const outDir = join(root, "public", "bajs-tiles")
const cacheDir = join(root, ".cache", "tiles", "dark_nolabels")
const metaPath = join(root, "data", "bajs-tiles.json")

const args = process.argv.slice(2)
const argValue = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined
}
const cutoff = Number(argValue("--cutoff") ?? 80)
const minZoom = Number(argValue("--min-zoom") ?? 11)
// 15 is the floor of the useful range, not the ceiling of the map: a 512 px
// tile at z15 already carries z16 detail, so the map stays sharp past it.
const maxZoom = Number(argValue("--max-zoom") ?? 15)
const force = args.includes("--force")

type Station = { lat: number; lon: number; is_virtual_station?: boolean }

/** Padded box around the real stations — the frame the map is allowed to roam. */
async function serviceBbox(): Promise<{ bbox: number[]; stations: number }> {
  const feed = (await (await fetch(STATION_INFORMATION_URL)).json()) as {
    data: { stations: Station[] }
  }
  const stations = feed.data.stations.filter((s) => !s.is_virtual_station)
  if (stations.length === 0) throw new Error("GBFS returned no stations")

  const lats = stations.map((s) => s.lat)
  const lons = stations.map((s) => s.lon)
  const west = Math.min(...lons)
  const east = Math.max(...lons)
  const south = Math.min(...lats)
  const north = Math.max(...lats)

  // Full extent, not percentiles: unlike the baked crop this box is the pannable
  // world, and a station outside it would sit on blank white.
  const padLon = (east - west) * 0.06
  const padLat = (north - south) * 0.12
  return {
    bbox: [west - padLon, south - padLat, east + padLon, north + padLat],
    stations: stations.length,
  }
}

async function main() {
  mkdirSync(join(root, "data"), { recursive: true })

  const { bbox, stations } = await serviceBbox()
  console.error(
    `${stations} stations, box ${bbox.map((v) => v.toFixed(4)).join(", ")}`
  )

  const cropper = createDitherCropper({ cacheDir, cutoff })
  const pyramid = await cropper.buildTilePyramid({
    outDir,
    bbox,
    minZoom,
    maxZoom,
    force,
    onZoom: (z, baked) => console.error(`  z${z}: ${baked} baked`),
  })

  writeFileSync(metaPath, `${JSON.stringify(pyramid, null, 2)}\n`)
  console.error(`z${minZoom}-z${maxZoom} → ${outDir}`)
  console.error(`bounds → ${metaPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
