import { readFileSync } from "fs"
import { join } from "path"

/**
 * Compact walking graph in CSR (Compressed Sparse Row) format.
 * Loaded from the binary file produced by scripts/build-walk-graph.ts.
 */
export interface WalkingGraph {
  nodeCount: number
  edgeCount: number
  /** Interleaved [lat, lon, lat, lon, ...] for each node */
  coords: Float64Array
  /** CSR offset array: edges for node i are at indices offsets[i]..offsets[i+1] */
  offsets: Uint32Array
  /** Edge targets: toIdx for each edge */
  edgeTargets: Uint32Array
  /** Edge distances in centimeters */
  edgeDistCm: Uint32Array
  /** Spatial grid for nearest-node lookup */
  grid: Map<string, number[]>
  gridCellSize: number
}

const GRAPH_PATH = join(process.cwd(), "data/walk-graph.bin")
const GRID_CELL_SIZE = 0.002 // ~200m in degrees

let cached: WalkingGraph | null = null

export function getWalkGraph(): WalkingGraph {
  if (cached) return cached

  const buf = readFileSync(GRAPH_PATH)
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let pos = 0

  const nodeCount = view.getUint32(pos, true)
  pos += 4
  const edgeCount = view.getUint32(pos, true)
  pos += 4

  // Read node coordinates
  const coords = new Float64Array(nodeCount * 2)
  for (let i = 0; i < nodeCount; i++) {
    coords[i * 2] = view.getFloat64(pos, true) // lat
    pos += 8
    coords[i * 2 + 1] = view.getFloat64(pos, true) // lon
    pos += 8
  }

  // Read CSR offsets
  const offsets = new Uint32Array(nodeCount + 1)
  for (let i = 0; i <= nodeCount; i++) {
    offsets[i] = view.getUint32(pos, true)
    pos += 4
  }

  // Read edges
  const edgeTargets = new Uint32Array(edgeCount)
  const edgeDistCm = new Uint32Array(edgeCount)
  for (let i = 0; i < edgeCount; i++) {
    edgeTargets[i] = view.getUint32(pos, true)
    pos += 4
    edgeDistCm[i] = view.getUint32(pos, true)
    pos += 4
  }

  // Build spatial grid for nearest-node lookup
  const grid = new Map<string, number[]>()
  for (let i = 0; i < nodeCount; i++) {
    const lat = coords[i * 2]
    const lon = coords[i * 2 + 1]
    const cx = Math.floor(lon / GRID_CELL_SIZE)
    const cy = Math.floor(lat / GRID_CELL_SIZE)
    const key = `${cx},${cy}`
    let cell = grid.get(key)
    if (!cell) {
      cell = []
      grid.set(key, cell)
    }
    cell.push(i)
  }

  cached = {
    nodeCount,
    edgeCount,
    coords,
    offsets,
    edgeTargets,
    edgeDistCm,
    grid,
    gridCellSize: GRID_CELL_SIZE,
  }

  return cached
}
