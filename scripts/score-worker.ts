/**
 * Worker thread for parallel district scoring.
 * Each worker loads its own walk graph and receives the transit graph
 * from the main thread, then processes batches of sample points.
 */
import { parentPort } from "worker_threads"
import {
  computeAvgTravelTimes,
  type TransitGraph,
} from "../lib/transit-graph"
import { countReachableCells } from "../lib/walk-expand"
import { getWalkGraph } from "../lib/walk-graph"
import type { BajsStation } from "../lib/bajs"
import type { TransitMode } from "../lib/transit"

// Each worker loads its own walk graph from the binary file
const walkGraph = getWalkGraph()
const walkBuf = new Float64Array(walkGraph.nodeCount)
walkBuf.fill(Infinity) // one-time init; countReachableCells maintains via tracked reset

let graph: TransitGraph
let storedBajsStations: BajsStation[] = []
let storedBajsStopMap: Map<string, { lat: number; lon: number }> = new Map()

parentPort!.on("message", (msg) => {
  if (msg.type === "init") {
    graph = msg.graph
    storedBajsStations = msg.bajsStations ?? []
    storedBajsStopMap = msg.bajsStopMap ?? new Map()
    parentPort!.postMessage({ type: "ready" })
    return
  }

  if (msg.type === "batch") {
    const { points, departureTimes, maxSeconds, useBajs, excludeModes } = msg
    const excludeSet = excludeModes
      ? new Set<TransitMode>(excludeModes)
      : undefined
    const stations = useBajs ? storedBajsStations : undefined
    const stopMap = useBajs ? storedBajsStopMap : graph.stops

    const scores: number[] = []
    for (const p of points) {
      let total = 0
      for (const dep of departureTimes) {
        const times = computeAvgTravelTimes(
          graph,
          p.lat,
          p.lon,
          dep,
          maxSeconds,
          stations,
          excludeSet
        )
        total += countReachableCells(
          walkGraph,
          times,
          stopMap,
          p.lat,
          p.lon,
          maxSeconds,
          walkBuf
        )
      }
      scores.push(Math.round(total / departureTimes.length))
    }
    parentPort!.postMessage({ type: "result", scores })
  }
})
