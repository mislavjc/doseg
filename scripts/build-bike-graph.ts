/**
 * Extracts a bikeable street network from OSM and writes a compact binary graph.
 *
 * Usage: bun scripts/build-bike-graph.ts
 */

import { createReadStream } from "node:fs"
import createParser from "osm-pbf-parser"
import through2 from "through2"

import { BBOX, writeBinaryGraph } from "./lib/osm-graph"
import type { Edge, OsmItem } from "./lib/osm-graph"

const INPUT = "data/osm/croatia.osm.pbf"
const OUTPUT = "data/bike-graph.bin"

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

import { fastDistKm as distKm } from "../lib/geo"

interface BikeableWay {
  refs: Array<number>
  forward: boolean
  backward: boolean
}

function isBikeAllowed(tags: Record<string, string>): boolean {
  const highway = tags.highway
  if (!highway || !BIKEABLE_HIGHWAYS.has(highway)) {
    return false
  }
  if (tags.access === "private" || tags.access === "no") {
    return false
  }
  if (tags.bicycle === "no" || tags.bicycle === "dismount") {
    return false
  }
  if (tags.motorroad === "yes") {
    return false
  }
  if (highway === "steps") {
    return false
  }

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

function parseOsmData(
  nodeCoords: Map<number, { lat: number; lon: number }>,
  bikeableWays: Array<BikeableWay>
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    createReadStream(INPUT)
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
                if (!isBikeAllowed(item.tags)) {
                  continue
                }
                const { forward, backward } = getDirection(item.tags)
                bikeableWays.push({
                  refs: item.refs ?? [],
                  forward,
                  backward,
                })
              }
            }
            next()
          }
        )
      )
      .on("finish", resolve)
      .on("error", reject)
  })
}

function filterValidWays(
  bikeableWays: Array<BikeableWay>,
  nodeCoords: Map<number, { lat: number; lon: number }>
) {
  const usedNodeIds = new Set<number>()
  const validWays: Array<BikeableWay> = []

  for (const way of bikeableWays) {
    const validRefs: Array<number> = []
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

  return { usedNodeIds, validWays }
}

function buildEdges(
  validWays: Array<BikeableWay>,
  nodeIdToIdx: Map<number, number>,
  nodeList: Array<{ lat: number; lon: number }>
): Array<Edge> {
  const edges: Array<Edge> = []

  for (const way of validWays) {
    for (let i = 0; i < way.refs.length - 1; i++) {
      const fromIdx = nodeIdToIdx.get(way.refs[i])
      const toIdx = nodeIdToIdx.get(way.refs[i + 1])
      if (fromIdx === undefined || toIdx === undefined) {
        continue
      }

      const fromCoord = nodeList[fromIdx]
      const toCoord = nodeList[toIdx]
      const distCm = Math.round(
        distKm(fromCoord.lat, fromCoord.lon, toCoord.lat, toCoord.lon) * 100_000
      )

      if (way.forward) {
        edges.push({ from: fromIdx, to: toIdx, distCm })
      }
      if (way.backward) {
        edges.push({ from: toIdx, to: fromIdx, distCm })
      }
    }
  }

  return edges
}

async function main() {
  console.log("Collecting bikeable ways and all nodes within bbox...")
  const nodeCoords = new Map<number, { lat: number; lon: number }>()
  const bikeableWays: Array<BikeableWay> = []

  await parseOsmData(nodeCoords, bikeableWays)

  console.log(
    `  ${nodeCoords.size} nodes in bbox, ${bikeableWays.length} bikeable ways`
  )

  console.log("Building graph...")
  const { usedNodeIds, validWays } = filterValidWays(bikeableWays, nodeCoords)

  console.log(
    `  ${usedNodeIds.size} used nodes, ${validWays.length} valid way segments`
  )

  const nodeIdToIdx = new Map<number, number>()
  const nodeList: Array<{ lat: number; lon: number }> = []

  for (const id of usedNodeIds) {
    const coord = nodeCoords.get(id)
    if (!coord) {
      continue
    }
    nodeIdToIdx.set(id, nodeList.length)
    nodeList.push(coord)
  }

  const edges = buildEdges(validWays, nodeIdToIdx, nodeList)
  console.log(`  ${edges.length} directed edges`)

  console.log(`Writing ${OUTPUT}...`)
  writeBinaryGraph(OUTPUT, nodeList, edges)
}

await main()
