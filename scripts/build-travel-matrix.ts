/**
 * Compute a cross-district travel time matrix (17x17) using OTP plan queries.
 *
 * For each pair of districts, queries OTP for a transit itinerary from
 * district A's bestPoint to district B's bestPoint and records travel time,
 * transfers, and walking distance.
 *
 * Requires OTP to be running (docker compose up otp).
 *
 * Usage: bun scripts/build-travel-matrix.ts [--time HH:MM] [--date YYYY-MM-DD] [--concurrency N]
 */

import { readFileSync, writeFileSync } from "fs"
import { join } from "path"

// --- Config ---

const OTP_URL = process.env.OTP_URL || "http://localhost:8080"
const DEFAULT_CONCURRENCY = 5

// --- CLI args ---

function parseArgs() {
  const args = process.argv.slice(2)
  let time = "08:00"
  let date = ""
  let concurrency = DEFAULT_CONCURRENCY

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--time" && args[i + 1]) time = args[++i]
    else if (args[i] === "--date" && args[i + 1]) date = args[++i]
    else if (args[i] === "--concurrency" && args[i + 1])
      concurrency = parseInt(args[++i])
  }

  // If no date given, find the next weekday
  if (!date) {
    const d = new Date()
    // Advance to next weekday (Mon-Fri)
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + 1)
    }
    date = d.toISOString().split("T")[0]
  }

  return { time, date, concurrency }
}

// --- District data ---

interface DistrictScore {
  name: string
  bestPoint: { lat: number; lon: number }
}

interface DistrictScoresFile {
  districts: DistrictScore[]
}

function loadDistricts(): DistrictScore[] {
  const raw = readFileSync(
    join(process.cwd(), "data/district-scores.json"),
    "utf-8"
  )
  const data = JSON.parse(raw) as DistrictScoresFile
  return data.districts
}

// --- OTP plan query ---

interface PlanResult {
  durationMin: number
  transfers: number
  walkDistanceM: number
}

async function queryPlan(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  date: string,
  time: string
): Promise<PlanResult | null> {
  const query = `
    {
      plan(
        from: { lat: ${fromLat}, lon: ${fromLon} }
        to: { lat: ${toLat}, lon: ${toLon} }
        date: "${date}"
        time: "${time}"
        numItineraries: 1
        transportModes: [
          { mode: TRANSIT }
          { mode: WALK }
        ]
      ) {
        itineraries {
          duration
          numberOfTransfers
          walkDistance
          legs {
            mode
            duration
            distance
          }
        }
      }
    }
  `

  const res = await fetch(`${OTP_URL}/otp/gtfs/v1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  })

  if (!res.ok) {
    console.error(`  OTP returned ${res.status}`)
    return null
  }

  const json = await res.json()
  const itineraries = json.data?.plan?.itineraries
  if (!itineraries || itineraries.length === 0) {
    return null
  }

  const it = itineraries[0]
  return {
    durationMin: Math.round(it.duration / 60),
    transfers: it.numberOfTransfers,
    walkDistanceM: Math.round(it.walkDistance),
  }
}

// --- Concurrency limiter ---

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
  onProgress?: (done: number, total: number) => void
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let nextIdx = 0
  let doneCount = 0

  async function runNext(): Promise<void> {
    while (nextIdx < tasks.length) {
      const idx = nextIdx++
      results[idx] = await tasks[idx]()
      doneCount++
      onProgress?.(doneCount, tasks.length)
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () =>
    runNext()
  )
  await Promise.all(workers)
  return results
}

// --- Main ---

async function main() {
  const { time, date, concurrency } = parseArgs()

  console.error("Loading district data...")
  const districts = loadDistricts()
  console.error(`  ${districts.length} districts loaded`)
  console.error(`  Date: ${date}, Time: ${time}, Concurrency: ${concurrency}`)

  const n = districts.length
  const totalPairs = n * n
  const names = districts.map((d) => d.name)

  // Initialize matrix with -1 (no route)
  const matrix: number[][] = Array.from({ length: n }, () =>
    new Array(n).fill(-1)
  )
  const transferMatrix: number[][] = Array.from({ length: n }, () =>
    new Array(n).fill(-1)
  )
  const walkMatrix: number[][] = Array.from({ length: n }, () =>
    new Array(n).fill(-1)
  )

  // Build task list for all pairs
  interface PairResult {
    i: number
    j: number
    result: PlanResult | null
  }

  const tasks: (() => Promise<PairResult>)[] = []
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const fromD = districts[i]
      const toD = districts[j]
      if (i === j) {
        // Same district: zero travel time
        tasks.push(async () => ({
          i,
          j,
          result: { durationMin: 0, transfers: 0, walkDistanceM: 0 },
        }))
      } else {
        tasks.push(async () => {
          const result = await queryPlan(
            fromD.bestPoint.lat,
            fromD.bestPoint.lon,
            toD.bestPoint.lat,
            toD.bestPoint.lon,
            date,
            time
          )
          return { i, j, result }
        })
      }
    }
  }

  console.error(`\nComputing ${totalPairs} district pairs...`)
  const t0 = performance.now()

  const results = await runWithConcurrency(
    tasks,
    concurrency,
    (done, total) => {
      process.stderr.write(`\r  Computing ${done}/${total}...`)
    }
  )
  console.error() // newline after progress

  // Fill matrices
  let noRouteCount = 0
  for (const { i, j, result } of results) {
    if (result) {
      matrix[i][j] = result.durationMin
      transferMatrix[i][j] = result.transfers
      walkMatrix[i][j] = result.walkDistanceM
    } else {
      noRouteCount++
      matrix[i][j] = -1
      transferMatrix[i][j] = -1
      walkMatrix[i][j] = -1
    }
  }

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
  console.error(`\nDone in ${elapsed}s`)
  if (noRouteCount > 0) {
    console.error(`  ${noRouteCount} pairs had no route found`)
  }

  // Output
  const output = {
    generatedAt: new Date().toISOString(),
    departureTime: time,
    date,
    districts: names,
    matrix,
    transferMatrix,
    walkDistanceMatrix: walkMatrix,
  }

  const outPath = join(process.cwd(), "data/travel-matrix.json")
  writeFileSync(outPath, JSON.stringify(output, null, 2))
  console.error(`\nWritten to ${outPath}`)

  // Print summary table
  console.error(`\n${"From \\ To".padEnd(22)}${names.map((n) => n.slice(0, 5).padStart(6)).join("")}`)
  console.error("─".repeat(22 + names.length * 6))
  for (let i = 0; i < n; i++) {
    const row = matrix[i]
      .map((v) => (v === -1 ? "  --" : v.toString().padStart(6)))
      .join("")
    console.error(`${names[i].padEnd(22)}${row}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
