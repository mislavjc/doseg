/**
 * Extracts a bikeable street network from OSM and writes a compact binary graph.
 *
 * Usage: bun scripts/build-bike-graph.ts
 */

import { collectStreetGraph, writeBinaryGraph } from "./lib/osm-graph"
import type { Coord, Edge, GraphWay } from "./lib/osm-graph"

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

function buildEdges(
  validWays: Array<GraphWay<ReturnType<typeof getDirection>>>,
  nodeIdToIdx: Map<number, number>,
  nodeList: Array<Coord>
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
  const { validWays, nodeIdToIdx, nodeList } = await collectStreetGraph(
    INPUT,
    "bikeable",
    (tags) => (isBikeAllowed(tags) ? getDirection(tags) : null)
  )

  const edges = buildEdges(validWays, nodeIdToIdx, nodeList)
  console.log(`  ${edges.length} directed edges`)

  console.log(`Writing ${OUTPUT}...`)
  writeBinaryGraph(OUTPUT, nodeList, edges)
}

await main()
