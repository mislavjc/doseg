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

const WALK_GRAPH_PATH = join(process.cwd(), "data/walk-graph.bin")
const BIKE_GRAPH_PATH = join(process.cwd(), "data/bike-graph.bin")
const GRID_CELL_SIZE = 0.002 // ~200m in degrees

const cached = new Map<string, WalkingGraph>()

function loadGraph(
  path: string,
  label: string,
  buildCommand: string
): WalkingGraph {
  const existing = cached.get(path)
  if (existing) return existing

  let buf: Buffer
  try {
    buf = readFileSync(path)
  } catch {
    throw new Error(
      `${label} graph not found at ${path}. Run "${buildCommand}" to generate it.`
    )
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)

  const nodeCount = view.getUint32(0, true)
  const edgeCount = view.getUint32(4, true)

  // Read node coordinates — bulk copy via DataView
  const coordsBytes = nodeCount * 2 * 8
  const coords = new Float64Array(nodeCount * 2)
  const coordSrc = new Uint8Array(buf.buffer, buf.byteOffset + 8, coordsBytes)
  new Uint8Array(coords.buffer).set(coordSrc)

  // Read CSR offsets — bulk copy
  const offsetsStart = 8 + coordsBytes
  const offsetsBytes = (nodeCount + 1) * 4
  const offsets = new Uint32Array(nodeCount + 1)
  new Uint8Array(offsets.buffer).set(
    new Uint8Array(buf.buffer, buf.byteOffset + offsetsStart, offsetsBytes)
  )

  // Read edges — interleaved [target, dist, target, dist, ...], deinterleave
  const edgesStart = offsetsStart + offsetsBytes
  const edgeTargets = new Uint32Array(edgeCount)
  const edgeDistCm = new Uint32Array(edgeCount)
  for (let i = 0; i < edgeCount; i++) {
    const off = edgesStart + i * 8
    edgeTargets[i] = view.getUint32(off, true)
    edgeDistCm[i] = view.getUint32(off + 4, true)
  }

  // Build spatial grid for nearest-node lookup
  const grid = new Map<string, number[]>()
  for (let i = 0; i < nodeCount; i++) {
    const cx = Math.floor(coords[i * 2 + 1] / GRID_CELL_SIZE) // lon
    const cy = Math.floor(coords[i * 2] / GRID_CELL_SIZE) // lat
    const key = `${cx},${cy}`
    let cell = grid.get(key)
    if (!cell) {
      cell = []
      grid.set(key, cell)
    }
    cell.push(i)
  }

  const graph = {
    nodeCount,
    edgeCount,
    coords,
    offsets,
    edgeTargets,
    edgeDistCm,
    grid,
    gridCellSize: GRID_CELL_SIZE,
  }

  cached.set(path, graph)
  return graph
}

export function getWalkGraph(): WalkingGraph {
  return loadGraph(WALK_GRAPH_PATH, "Walking", "npm run build:walk-graph")
}

export function getBikeGraph(): WalkingGraph {
  return loadGraph(BIKE_GRAPH_PATH, "Bike", "bun scripts/build-bike-graph.ts")
}
