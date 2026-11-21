/**
 * Extracts the walkable street network from an OSM PBF file for a given
 * bounding box and writes a compact binary graph file.
 *
 * Usage: bun scripts/build-walk-graph.ts
 * Binary format: see writeBinaryGraph in scripts/lib/osm-graph.ts.
 */

import { readFileSync } from "node:fs"

import { collectStreetGraph, writeBinaryGraph } from "./lib/osm-graph"
import type { Coord, Edge } from "./lib/osm-graph"

const INPUT = "data/osm/croatia.osm.pbf"
const OUTPUT = "data/walk-graph.bin"

const WALKABLE_HIGHWAYS = new Set([
  "residential",
  "living_street",
  "unclassified",
  "tertiary",
  "tertiary_link",
  "secondary",
  "secondary_link",
  "primary",
  "primary_link",
  "pedestrian",
  "footway",
  "path",
  "steps",
  "cycleway",
  "track",
  "service",
])

import { fastDistKm as distKm } from "../lib/geo"

// 1 arc-second resolution
const SRTM_SIZE = 3601
const SRTM_DIR = "data/srtm"

function loadSRTMTiles(): Map<string, Int16Array> {
  const tiles = new Map<string, Int16Array>()
  for (const name of ["N45E015", "N45E016"]) {
    try {
      const buf = readFileSync(`${SRTM_DIR}/${name}.hgt`)
      const data = new Int16Array(SRTM_SIZE * SRTM_SIZE)
      for (let i = 0; i < data.length; i++) {
        // big-endian
        data[i] = (buf[i * 2] << 8) | buf[i * 2 + 1]
      }
      tiles.set(name, data)
    } catch {
      console.log(`  Warning: SRTM tile ${name} not found, skipping elevation`)
    }
  }
  return tiles
}

function getElevation(
  lat: number,
  lon: number,
  tiles: Map<string, Int16Array>
): number {
  const tileLat = Math.floor(lat)
  const tileLon = Math.floor(lon)
  const key = `N${tileLat}E${String(tileLon).padStart(3, "0")}`
  const tile = tiles.get(key)
  if (!tile) {
    return 0
  }

  const row = Math.round((tileLat + 1 - lat) * (SRTM_SIZE - 1))
  const col = Math.round((lon - tileLon) * (SRTM_SIZE - 1))
  const idx = row * SRTM_SIZE + col
  if (idx < 0 || idx >= tile.length) {
    return 0
  }

  const elev = tile[idx]
  // -32768 = void
  return elev === -32_768 ? 0 : elev
}

/**
 * Tobler's hiking function: speed factor relative to flat walking.
 * Returns >1 for mild downhill (faster), <1 for uphill/steep downhill (slower).
 */
function toblerFactor(slope: number): number {
  return Math.exp(-3.5 * (Math.abs(slope + 0.05) - 0.05))
}

function buildEdges(
  validWays: Array<{ refs: Array<number> }>,
  nodeIdToIdx: Map<number, number>,
  nodeList: Array<Coord>,
  srtmTiles: Map<string, Int16Array>
): Array<Edge> {
  const edges: Array<Edge> = []
  const hasElevation = srtmTiles.size > 0

  for (const { refs } of validWays) {
    for (let i = 0; i < refs.length - 1; i++) {
      const fromIdx = nodeIdToIdx.get(refs[i])
      const toIdx = nodeIdToIdx.get(refs[i + 1])
      if (fromIdx === undefined || toIdx === undefined) {
        continue
      }
      const fromCoord = nodeList[fromIdx]
      const toCoord = nodeList[toIdx]
      const d = distKm(fromCoord.lat, fromCoord.lon, toCoord.lat, toCoord.lon)

      if (!hasElevation || d < 0.01) {
        const distCm = Math.round(d * 100_000)
        edges.push(
          { from: fromIdx, to: toIdx, distCm },
          { from: toIdx, to: fromIdx, distCm }
        )
      } else {
        const elevFrom = getElevation(fromCoord.lat, fromCoord.lon, srtmTiles)
        const elevTo = getElevation(toCoord.lat, toCoord.lon, srtmTiles)
        const rise = elevTo - elevFrom
        const run = d * 1000
        const slope = rise / run

        const fwd = Math.round((d / toblerFactor(slope)) * 100_000)
        const rev = Math.round((d / toblerFactor(-slope)) * 100_000)

        edges.push(
          { from: fromIdx, to: toIdx, distCm: fwd },
          { from: toIdx, to: fromIdx, distCm: rev }
        )
      }
    }
  }

  return edges
}

async function main() {
  const { validWays, nodeIdToIdx, nodeList } = await collectStreetGraph(
    INPUT,
    "walkable",
    (tags) => {
      const hw = tags.highway
      if (!hw || !WALKABLE_HIGHWAYS.has(hw)) {
        return null
      }
      if (tags.access === "private" || tags.foot === "no") {
        return null
      }
      return {}
    }
  )

  console.log("Loading SRTM elevation data...")
  const srtmTiles = loadSRTMTiles()
  if (srtmTiles.size > 0) {
    console.log(`  ${srtmTiles.size} tiles loaded`)
  }

  const edges = buildEdges(validWays, nodeIdToIdx, nodeList, srtmTiles)
  console.log(`  ${edges.length} directed edges`)

  console.log(`Writing ${OUTPUT}...`)
  writeBinaryGraph(OUTPUT, nodeList, edges)
}

await main()
