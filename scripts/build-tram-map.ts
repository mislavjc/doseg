/**
 * Schematic layout for /karta-tramvaja.
 *
 *   bun scripts/build-tram-map.ts                 anneal from geography, 4 seeds in parallel
 *   bun scripts/build-tram-map.ts --refine        anneal again from the committed layout, cooler
 *   bun scripts/build-tram-map.ts --assemble      redraw the committed layout without annealing
 *
 * Options: --iterations N, --seeds 1,2,3,4, --renders DIR (PNG + score logs).
 *
 * Reads data/karta-tramvaja/network.json (transit crate, --tram-map) and
 * writes data/karta-tramvaja/layout.json. The objective is in
 * scripts/lib/tram-map/score.ts; every run logs its score per 1000 moves.
 */

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { spawn } from "node:child_process"
import { join } from "node:path"

import sharp from "sharp"

import { readJson } from "./lib/json"
import { anneal } from "./lib/tram-map/anneal"
import { assemble } from "./lib/tram-map/assemble"
import { loadNetwork } from "./lib/tram-map/graph"
import type { Context, State } from "./lib/tram-map/layout"
import { initialState, makeContext } from "./lib/tram-map/layout"
import { loadSava, riverFor, southBank } from "./lib/tram-map/river"
import type { Breakdown } from "./lib/tram-map/score"
import { score } from "./lib/tram-map/score"
import { layoutSvg } from "./lib/tram-map/svg"
import { validateLayout } from "./lib/tram-map/validate"
import type { TramMapLayout } from "@/lib/tram-map-layout"
import type { TramMapNetwork } from "@/lib/generated/TramMapNetwork"

const NETWORK = "data/karta-tramvaja/network.json"
const LAYOUT = "data/karta-tramvaja/layout.json"
const CACHE = ".cache/tram-map"

const argv = process.argv.slice(2)
const flag = (name: string) => argv.includes(name)
const opt = (name: string, fallback: string) => {
  const i = argv.indexOf(name)
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback
}

function stateFromLayout(ctx: Context, layout: TramMapLayout): State {
  const s = initialState(ctx)
  ctx.net.nodes.forEach((v, i) => {
    const hit = layout.skeleton.nodes[ctx.net.stations[v].id]
    if (hit !== undefined) {
      ;[s.x[i], s.y[i]] = hit
    }
  })
  ctx.net.chains.forEach((c, ci) => {
    const key = `${ctx.net.stations[c.a].id}>${ctx.net.stations[c.b].id}>${c.mids.length}`
    s.bend[ci] = layout.skeleton.bends[key] ?? 0
  })
  s.river = layout.skeleton.river ?? s.river
  return s
}

const readLayout = () => readJson<TramMapLayout>(LAYOUT)
const fmt = (b: Breakdown) =>
  Object.entries(b)
    .map(([k, v]) => `${k}=${Math.round(v)}`)
    .join(" ")

function runWorker(ctx: Context) {
  const seed = Number(opt("--seed", "1"))
  const iterations = Number(opt("--iterations", "60000"))
  const refine = flag("--refine")
  const start =
    refine && existsSync(LAYOUT)
      ? stateFromLayout(ctx, readLayout())
      : initialState(ctx)
  const log: Array<string> = [
    "iteration,current,best," + Object.keys(score(ctx, start)).join(","),
  ]
  const result = anneal(ctx, start, {
    iterations,
    t0: refine ? 40 : 300,
    seed,
    logEvery: 1000,
    onLog: (it, cur, best) => {
      log.push(
        [
          it,
          cur.total.toFixed(1),
          best.total.toFixed(1),
          ...Object.values(best).map((v) => v.toFixed(1)),
        ].join(",")
      )
    },
  })
  mkdirSync(join(CACHE, "runs"), { recursive: true })
  writeFileSync(join(CACHE, "runs", `seed-${seed}.csv`), log.join("\n") + "\n")
  writeFileSync(
    join(CACHE, "runs", `seed-${seed}.json`),
    JSON.stringify({
      ...result.state,
      x: [...result.state.x],
      y: [...result.state.y],
      total: result.score.total,
    })
  )
  console.log(`seed ${seed}: ${fmt(result.score)}`)
}

async function runSeeds(): Promise<State & { seed: number }> {
  const seeds = opt("--seeds", "1,2,3,4").split(",")
  const extra = flag("--refine") ? ["--refine"] : []
  await Promise.all(
    seeds.map(
      (seed) =>
        new Promise((resolve) => {
          const args = [
            process.argv[1],
            "--worker",
            "--seed",
            seed,
            "--iterations",
            opt("--iterations", "60000"),
            ...extra,
          ]
          spawn(process.execPath, args, { stdio: "inherit" }).on("exit", () => {
            resolve(null)
          })
        })
    )
  )
  const runs = seeds.map((seed) => {
    const r = readJson<{
      x: Array<number>
      y: Array<number>
      bend: Array<0 | 1>
      river: [number, number, number]
      total: number
    }>(join(CACHE, "runs", `seed-${seed}.json`))
    return {
      seed: Number(seed),
      bend: r.bend,
      river: r.river,
      total: r.total,
      x: Int32Array.from(r.x),
      y: Int32Array.from(r.y),
    }
  })
  return runs.toSorted((a, b) => a.total - b.total)[0]
}

async function main() {
  const net = loadNetwork(NETWORK)
  const sava = await loadSava(join(CACHE, "sava.json"))
  const ctx = makeContext(net, southBank(net.stations, sava))
  if (flag("--worker")) {
    runWorker(ctx)
    return
  }
  const best = flag("--assemble")
    ? { ...stateFromLayout(ctx, readLayout()), seed: 0 }
    : await runSeeds()
  const sc = score(ctx, best)
  const raw = readJson<TramMapNetwork>(NETWORK)
  const layout = assemble(ctx, best, raw, sc, riverFor(ctx))
  const errors = validateLayout(raw, layout, net)
  if (errors.length > 0) {
    console.error(errors.join("\n"))
    process.exit(1)
  }
  writeFileSync(LAYOUT, JSON.stringify(layout, null, 1) + "\n")
  console.log(
    `best seed ${best.seed}: ${fmt(sc)} riverSideErrors=${layout.score.riverSideErrors}`
  )
  const renders = opt("--renders", join(CACHE, "renders"))
  mkdirSync(renders, { recursive: true })
  const name = opt("--name", `layout-${Math.round(sc.total)}`)
  await sharp(
    Buffer.from(
      layoutSvg(layout, {
        title: `${name}  score ${sc.total.toFixed(0)}`,
        scale: 1.5,
      })
    )
  )
    .png()
    .toFile(join(renders, `${name}.png`))
  if (best.seed > 0) {
    copyFileSync(
      join(CACHE, "runs", `seed-${best.seed}.csv`),
      join(renders, `${name}-score-log.csv`)
    )
  }
  console.log(`wrote ${LAYOUT} and ${join(renders, name)}.png`)
}

await main()
