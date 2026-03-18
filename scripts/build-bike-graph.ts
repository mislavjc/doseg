/**
 * Extracts a bikeable street network from OSM and writes a compact binary graph.
 *
 * Usage: bun scripts/build-bike-graph.ts
 */

import { createReadStream, writeFileSync } from "fs"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const createParser = require("osm-pbf-parser")
// eslint-disable-next-line @typescript-eslint/no-require-imports
const through2 = require("through2")

const INPUT = "data/osm/croatia.osm.pbf"
const OUTPUT = "data/bike-graph.bin"

const BBOX = {
  minLat: 45.7,
  maxLat: 45.92,
  minLon: 15.75,
  maxLon: 16.2,
}

const BIKEABLE_HIGHWAYS = new Set([
  "residential",
  "living_street",
  "unclassified",
  "tertiary",
  "tertiary_link",
  "secondary",
  "secondary_link",
  "primary",
  "primary_link",
  "cycleway",
  "track",
  "service",
  "road",
  "path",
  "pedestrian",
  "footway",
])

const CONDITIONAL_BIKE_HIGHWAYS = new Set(["path", "pedestrian", "footway"])
const BIKE_ALLOWED_VALUES = new Set([
  "yes",
  "designated",
  "permissive",
  "official",
  "destination",
])

import { KM_PER_DEG_LAT, KM_PER_DEG_LON, fastDistKm as distKm } from "../lib/geo"

interface OsmItem {
  type: "node" | "way" | "relation"
  id: number
  lat?: number
  lon?: number
  tags?: Record<string, string>
  refs?: number[]
}

interface BikeableWay {
  refs: number[]
  forward: boolean
  backward: boolean
}

function isBikeAllowed(tags: Record<string, string>): boolean {
  const highway = tags.highway
  if (!highway || !BIKEABLE_HIGHWAYS.has(highway)) return false
  if (tags.access === "private" || tags.access === "no") return false
  if (tags.bicycle === "no" || tags.bicycle === "dismount") return false
  if (tags.motorroad === "yes") return false
  if (highway === "steps") return false

  if (CONDITIONAL_BIKE_HIGHWAYS.has(highway)) {
    const bicycle = tags.bicycle
    const segregated = tags.segregated
    const cycleway = tags.cycleway
    return (
      (bicycle ? BIKE_ALLOWED_VALUES.has(bicycle) : highway === "path") ||
      segregated === "yes" ||
      cycleway === "track"
    )
  }

  return true
}

function getDirection(tags: Record<string, string>) {
  let forward = true
  let backward = true

  const bicycleOnewayExemption =
    tags["oneway:bicycle"] === "no" ||
    tags.cycleway === "opposite" ||
    tags.cycleway === "opposite_lane" ||
    tags.cycleway === "opposite_track"

  if (!bicycleOnewayExemption) {
    const oneway = tags.oneway
    const roundabout = tags.junction === "roundabout"
    if (oneway === "-1") {
      forward = false
      backward = true
    } else if (
      oneway === "yes" ||
      oneway === "1" ||
      oneway === "true" ||
      roundabout
    ) {
      forward = true
      backward = false
    }
  }

  return { forward, backward }
}

async function main() {
  console.log("Collecting bikeable ways and all nodes within bbox...")
  const nodeCoords = new Map<number, { lat: number; lon: number }>()
  const bikeableWays: BikeableWay[] = []

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
              if (!isBikeAllowed(item.tags)) continue
              const { forward, backward } = getDirection(item.tags)
              bikeableWays.push({
                refs: item.refs ?? [],
                forward,
                backward,
              })
            }
          }
          next()
        })
      )
      .on("finish", resolve)
      .on("error", reject)
  })

  console.log(
    `  ${nodeCoords.size} nodes in bbox, ${bikeableWays.length} bikeable ways`
  )

  console.log("Building graph...")

  const usedNodeIds = new Set<number>()
  const validWays: BikeableWay[] = []

  for (const way of bikeableWays) {
    const validRefs: number[] = []
    for (const ref of way.refs) {
      if (nodeCoords.has(ref)) {
        validRefs.push(ref)
        usedNodeIds.add(ref)
      } else {
        if (validRefs.length >= 2) {
          validWays.push({
            refs: [...validRefs],
            forward: way.forward,
            backward: way.backward,
          })
        }
        validRefs.length = 0
      }
    }
    if (validRefs.length >= 2) {
      validWays.push({
        refs: validRefs,
        forward: way.forward,
        backward: way.backward,
      })
    }
  }

  console.log(
    `  ${usedNodeIds.size} used nodes, ${validWays.length} valid way segments`
  )

  const nodeIdToIdx = new Map<number, number>()
  const nodeList: { lat: number; lon: number }[] = []

  for (const id of usedNodeIds) {
    const coord = nodeCoords.get(id)
    if (!coord) continue
    nodeIdToIdx.set(id, nodeList.length)
    nodeList.push(coord)
  }

  interface Edge {
    from: number
    to: number
    distCm: number
  }
  const edges: Edge[] = []

  for (const way of validWays) {
    for (let i = 0; i < way.refs.length - 1; i++) {
      const fromIdx = nodeIdToIdx.get(way.refs[i])
      const toIdx = nodeIdToIdx.get(way.refs[i + 1])
      if (fromIdx === undefined || toIdx === undefined) continue

      const fromCoord = nodeList[fromIdx]
      const toCoord = nodeList[toIdx]
      const distCm = Math.round(
        distKm(fromCoord.lat, fromCoord.lon, toCoord.lat, toCoord.lon) * 100000
      )

      if (way.forward) edges.push({ from: fromIdx, to: toIdx, distCm })
      if (way.backward) edges.push({ from: toIdx, to: fromIdx, distCm })
    }
  }

  console.log(`  ${edges.length} directed edges`)

  edges.sort((a, b) => a.from - b.from)

  const nodeCount = nodeList.length
  const edgeCount = edges.length
  const offsets = new Uint32Array(nodeCount + 1)

  for (const e of edges) offsets[e.from + 1]++
  for (let i = 1; i <= nodeCount; i++) offsets[i] += offsets[i - 1]

  console.log(`Writing ${OUTPUT}...`)

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

  writeFileSync(OUTPUT, buffer)

  const sizeMB = (totalSize / 1024 / 1024).toFixed(1)
  console.log(`Done! ${nodeCount} nodes, ${edgeCount} edges, ${sizeMB} MB`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
