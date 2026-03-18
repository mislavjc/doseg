/**
 * Extracts the walkable street network from an OSM PBF file for a given
 * bounding box and writes a compact binary graph file.
 *
 * Usage: bun scripts/build-walk-graph.ts
 *
 * Binary format (all little-endian):
 *   4 bytes  nodeCount  (uint32)
 *   4 bytes  edgeCount  (uint32)
 *   nodeCount × 16 bytes  [lat f64, lon f64]
 *   (nodeCount+1) × 4 bytes  CSR offsets (uint32)
 *   edgeCount × 8 bytes  [toIdx uint32, distCm uint32]
 */

import { createReadStream, readFileSync, writeFileSync } from "fs"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const createParser = require("osm-pbf-parser")
// eslint-disable-next-line @typescript-eslint/no-require-imports
const through2 = require("through2")

const INPUT = "data/osm/croatia.osm.pbf"
const OUTPUT = "data/walk-graph.bin"

// Zagreb bounding box (generous)
const BBOX = {
  minLat: 45.7,
  maxLat: 45.92,
  minLon: 15.75,
  maxLon: 16.2,
}

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

import { KM_PER_DEG_LAT, KM_PER_DEG_LON, fastDistKm as distKm } from "../lib/geo"

// --- SRTM elevation data ---

const SRTM_SIZE = 3601 // 1 arc-second resolution
const SRTM_DIR = "data/srtm"

function loadSRTMTiles(): Map<string, Int16Array> {
  const tiles = new Map<string, Int16Array>()
  for (const name of ["N45E015", "N45E016"]) {
    try {
      const buf = readFileSync(`${SRTM_DIR}/${name}.hgt`)
      const data = new Int16Array(SRTM_SIZE * SRTM_SIZE)
      for (let i = 0; i < data.length; i++) {
        data[i] = (buf[i * 2] << 8) | buf[i * 2 + 1] // big-endian
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
  if (!tile) return 0

  const row = Math.round((tileLat + 1 - lat) * (SRTM_SIZE - 1))
  const col = Math.round((lon - tileLon) * (SRTM_SIZE - 1))
  const idx = row * SRTM_SIZE + col
  if (idx < 0 || idx >= tile.length) return 0

  const elev = tile[idx]
  return elev === -32768 ? 0 : elev // -32768 = void
}

/**
 * Tobler's hiking function: speed factor relative to flat walking.
 * Returns >1 for mild downhill (faster), <1 for uphill/steep downhill (slower).
 */
function toblerFactor(slope: number): number {
  return Math.exp(-3.5 * (Math.abs(slope + 0.05) - 0.05))
}

interface OsmItem {
  type: "node" | "way" | "relation"
  id: number
  lat?: number
  lon?: number
  tags?: Record<string, string>
  refs?: number[]
}

async function main() {
  console.log("Collecting walkable ways and all nodes within bbox...")
  const nodeCoords = new Map<number, { lat: number; lon: number }>()
  const walkableWays: { refs: number[] }[] = []

  await new Promise<void>((resolve, reject) => {
    createReadStream(INPUT)
      .pipe(createParser())
      .pipe(
        through2.obj((items: OsmItem[], _enc: string, next: () => void) => {
          for (const item of items) {
            if (item.type === "node") {
              const lat = item.lat!
              const lon = item.lon!
              if (
                lat >= BBOX.minLat &&
                lat <= BBOX.maxLat &&
                lon >= BBOX.minLon &&
                lon <= BBOX.maxLon
              ) {
                nodeCoords.set(item.id, { lat, lon })
              }
            } else if (item.type === "way" && item.tags) {
              const hw = item.tags.highway
              if (!hw || !WALKABLE_HIGHWAYS.has(hw)) continue
              if (item.tags.access === "private" || item.tags.foot === "no")
                continue
              walkableWays.push({ refs: item.refs! })
            }
          }
          next()
        })
      )
      .on("finish", resolve)
      .on("error", reject)
  })

  console.log(
    `  ${nodeCoords.size} nodes in bbox, ${walkableWays.length} walkable ways`
  )

  // Build adjacency list
  // Only include ways where ALL referenced nodes are in our bbox node set
  console.log("Building graph...")

  // Assign compact indices to nodes that are actually used by walkable ways
  const usedNodeIds = new Set<number>()
  const validWays: number[][] = []

  for (const way of walkableWays) {
    // Check that at least some consecutive pair of nodes are both in bbox
    const validRefs: number[] = []
    for (const ref of way.refs) {
      if (nodeCoords.has(ref)) {
        validRefs.push(ref)
        usedNodeIds.add(ref)
      } else {
        // Break the way at nodes outside bbox
        if (validRefs.length >= 2) {
          validWays.push([...validRefs])
        }
        validRefs.length = 0
      }
    }
    if (validRefs.length >= 2) {
      validWays.push(validRefs)
    }
  }

  console.log(
    `  ${usedNodeIds.size} used nodes, ${validWays.length} valid way segments`
  )

  // Assign compact indices
  const nodeIdToIdx = new Map<number, number>()
  const nodeList: { lat: number; lon: number }[] = []

  for (const id of usedNodeIds) {
    const coord = nodeCoords.get(id)!
    nodeIdToIdx.set(id, nodeList.length)
    nodeList.push(coord)
  }

  // Load SRTM elevation data
  console.log("Loading SRTM elevation data...")
  const srtmTiles = loadSRTMTiles()
  const hasElevation = srtmTiles.size > 0
  if (hasElevation) {
    console.log(`  ${srtmTiles.size} tiles loaded`)
  }

  // Build edge list (bidirectional, elevation-adjusted)
  interface Edge {
    from: number
    to: number
    distCm: number
  }
  const edges: Edge[] = []

  for (const refs of validWays) {
    for (let i = 0; i < refs.length - 1; i++) {
      const fromIdx = nodeIdToIdx.get(refs[i])!
      const toIdx = nodeIdToIdx.get(refs[i + 1])!
      const fromCoord = nodeList[fromIdx]
      const toCoord = nodeList[toIdx]
      const d = distKm(fromCoord.lat, fromCoord.lon, toCoord.lat, toCoord.lon)

      if (!hasElevation || d < 0.01) {
        // No elevation data or edge too short (<10m) for reliable gradient
        const distCm = Math.round(d * 100000)
        edges.push({ from: fromIdx, to: toIdx, distCm })
        edges.push({ from: toIdx, to: fromIdx, distCm })
      } else {
        const elevFrom = getElevation(fromCoord.lat, fromCoord.lon, srtmTiles)
        const elevTo = getElevation(toCoord.lat, toCoord.lon, srtmTiles)
        const rise = elevTo - elevFrom // meters
        const run = d * 1000 // km to meters
        const slope = rise / run

        // Forward (from→to): equivalent flat distance accounting for terrain
        const fwd = Math.round((d / toblerFactor(slope)) * 100000)
        // Reverse (to→from): opposite slope
        const rev = Math.round((d / toblerFactor(-slope)) * 100000)

        edges.push({ from: fromIdx, to: toIdx, distCm: fwd })
        edges.push({ from: toIdx, to: fromIdx, distCm: rev })
      }
    }
  }

  console.log(`  ${edges.length} directed edges`)

  // Sort edges by fromIdx for CSR format
  edges.sort((a, b) => a.from - b.from)

  // Build CSR offsets
  const nodeCount = nodeList.length
  const edgeCount = edges.length
  const offsets = new Uint32Array(nodeCount + 1)

  for (const e of edges) {
    offsets[e.from + 1]++
  }
  for (let i = 1; i <= nodeCount; i++) {
    offsets[i] += offsets[i - 1]
  }

  // Write binary file
  console.log(`Writing ${OUTPUT}...`)

  const headerSize = 8
  const nodesSize = nodeCount * 16
  const offsetsSize = (nodeCount + 1) * 4
  const edgesSize = edgeCount * 8
  const totalSize = headerSize + nodesSize + offsetsSize + edgesSize

  const buffer = Buffer.alloc(totalSize)
  const view = new DataView(buffer.buffer)
  let pos = 0

  // Header
  view.setUint32(pos, nodeCount, true)
  pos += 4
  view.setUint32(pos, edgeCount, true)
  pos += 4

  // Nodes
  for (const node of nodeList) {
    view.setFloat64(pos, node.lat, true)
    pos += 8
    view.setFloat64(pos, node.lon, true)
    pos += 8
  }

  // CSR offsets
  for (let i = 0; i <= nodeCount; i++) {
    view.setUint32(pos, offsets[i], true)
    pos += 4
  }

  // Edges
  for (const e of edges) {
    view.setUint32(pos, e.to, true)
    pos += 4
    view.setUint32(pos, e.distCm, true)
    pos += 4
  }

  writeFileSync(OUTPUT, buffer)

  const sizeMB = (totalSize / 1024 / 1024).toFixed(1)
  console.log(`Done! ${nodeCount} nodes, ${edgeCount} edges, ${sizeMB} MB`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
