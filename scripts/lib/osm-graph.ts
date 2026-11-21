import { createReadStream, writeFileSync } from "node:fs"
import createParser from "osm-pbf-parser"
import through2 from "through2"

/** An OSM element from the PBF parser. */
interface OsmItem {
  type: "node" | "way" | "relation"
  id: number
  lat?: number
  lon?: number
  tags?: Record<string, string>
  refs?: Array<number>
}

export type Coord = { lat: number; lon: number }

/** A weighted graph edge (distance in centimeters). */
export interface Edge {
  from: number
  to: number
  distCm: number
}

/** Zagreb, generously: the area both street graphs are cut to. */
const BBOX = {
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
  nodeList: Array<Coord>,
  edges: Array<Edge>
) {
  edges.sort((a, b) => a.from - b.from)

  const nodeCount = nodeList.length
  const edgeCount = edges.length
  const offsets = new Uint32Array(nodeCount + 1)

  for (const e of edges) {
    offsets[e.from + 1]++
  }
  for (let i = 1; i <= nodeCount; i++) {
    offsets[i] += offsets[i - 1]
  }

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

/** A way's node refs plus whatever its script keeps per way. */
export type GraphWay<T> = T & { refs: Array<number> }

function parseOsmData<T extends object>(
  input: string,
  toWay: (tags: Record<string, string>) => T | null
) {
  const nodeCoords = new Map<number, Coord>()
  const ways: Array<GraphWay<T>> = []
  return new Promise<{
    nodeCoords: Map<number, Coord>
    ways: Array<GraphWay<T>>
  }>((resolve, reject) => {
    createReadStream(input)
      .pipe(createParser())
      .pipe(
        through2.obj(
          (items: Array<OsmItem>, _enc: string, next: () => void) => {
            for (const item of items) {
              if (item.type === "node") {
                const { lat, lon } = item
                if (
                  lat !== undefined &&
                  lon !== undefined &&
                  lat >= BBOX.minLat &&
                  lat <= BBOX.maxLat &&
                  lon >= BBOX.minLon &&
                  lon <= BBOX.maxLon
                ) {
                  nodeCoords.set(item.id, { lat, lon })
                }
              } else if (item.type === "way" && item.tags) {
                const way = toWay(item.tags)
                if (way) {
                  ways.push({ ...way, refs: item.refs ?? [] })
                }
              }
            }
            next()
          }
        )
      )
      .on("finish", () => resolve({ nodeCoords, ways }))
      .on("error", reject)
  })
}

function filterValidWays<T>(
  ways: Array<GraphWay<T>>,
  nodeCoords: Map<number, Coord>
) {
  const usedNodeIds = new Set<number>()
  const validWays: Array<GraphWay<T>> = []

  for (const way of ways) {
    const validRefs: Array<number> = []
    for (const ref of way.refs) {
      if (nodeCoords.has(ref)) {
        validRefs.push(ref)
        usedNodeIds.add(ref)
      } else {
        if (validRefs.length >= 2) {
          validWays.push({ ...way, refs: [...validRefs] })
        }
        validRefs.length = 0
      }
    }
    if (validRefs.length >= 2) {
      validWays.push({ ...way, refs: validRefs })
    }
  }

  return { usedNodeIds, validWays }
}

/**
 * Streams the PBF, keeps nodes inside BBOX and the ways `toWay` accepts,
 * splits ways at nodes outside the bbox and indexes the nodes they use.
 */
export async function collectStreetGraph<T extends object>(
  input: string,
  kind: string,
  toWay: (tags: Record<string, string>) => T | null
) {
  console.log(`Collecting ${kind} ways and all nodes within bbox...`)
  const { nodeCoords, ways } = await parseOsmData(input, toWay)

  console.log(`  ${nodeCoords.size} nodes in bbox, ${ways.length} ${kind} ways`)

  console.log("Building graph...")
  const { usedNodeIds, validWays } = filterValidWays(ways, nodeCoords)

  console.log(
    `  ${usedNodeIds.size} used nodes, ${validWays.length} valid way segments`
  )

  const nodeIdToIdx = new Map<number, number>()
  const nodeList: Array<Coord> = []

  for (const id of usedNodeIds) {
    const coord = nodeCoords.get(id)
    if (!coord) {
      continue
    }
    nodeIdToIdx.set(id, nodeList.length)
    nodeList.push(coord)
  }

  return { validWays, nodeIdToIdx, nodeList }
}
