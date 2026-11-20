import { writeFileSync } from "node:fs"

/** An OSM element from the PBF parser. */
export interface OsmItem {
  type: "node" | "way" | "relation"
  id: number
  lat?: number
  lon?: number
  tags?: Record<string, string>
  refs?: Array<number>
}

/** A weighted graph edge (distance in centimeters). */
export interface Edge {
  from: number
  to: number
  distCm: number
}

/** Zagreb, generously: the area both street graphs are cut to. */
export const BBOX = {
  minLat: 45.7,
  maxLat: 45.92,
  minLon: 15.75,
  maxLon: 16.2,
}

/**
 * Binary format (all little-endian):
 *   4 bytes  nodeCount  (uint32)
 *   4 bytes  edgeCount  (uint32)
 *   nodeCount × 16 bytes  [lat f64, lon f64]
 *   (nodeCount+1) × 4 bytes  CSR offsets (uint32)
 *   edgeCount × 8 bytes  [toIdx uint32, distCm uint32]
 */
export function writeBinaryGraph(
  path: string,
  nodeList: Array<{ lat: number; lon: number }>,
  edges: Array<Edge>
) {
  edges.sort((a, b) => a.from - b.from)

  const nodeCount = nodeList.length
  const edgeCount = edges.length
  const offsets = new Uint32Array(nodeCount + 1)

  for (const e of edges) {offsets[e.from + 1]++}
  for (let i = 1; i <= nodeCount; i++) {offsets[i] += offsets[i - 1]}

  const headerSize = 8
  const nodesSize = nodeCount * 16
  const offsetsSize = (nodeCount + 1) * 4
  const edgesSize = edgeCount * 8
  const totalSize = headerSize + nodesSize + offsetsSize + edgesSize

  const buffer = Buffer.alloc(totalSize)
  const view = new DataView(buffer.buffer)
  let pos = 0

  view.setUint32(pos, nodeCount, true)
  pos += 4
  view.setUint32(pos, edgeCount, true)
  pos += 4

  for (const node of nodeList) {
    view.setFloat64(pos, node.lat, true)
    pos += 8
    view.setFloat64(pos, node.lon, true)
    pos += 8
  }

  for (let i = 0; i <= nodeCount; i++) {
    view.setUint32(pos, offsets[i], true)
    pos += 4
  }

  for (const e of edges) {
    view.setUint32(pos, e.to, true)
    pos += 4
    view.setUint32(pos, e.distCm, true)
    pos += 4
  }

  writeFileSync(path, buffer)

  const sizeMB = (totalSize / 1024 / 1024).toFixed(1)
  console.log(`Done! ${nodeCount} nodes, ${edgeCount} edges, ${sizeMB} MB`)
}
