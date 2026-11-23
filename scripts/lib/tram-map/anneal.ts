import type { Context, State } from "./layout"
import type { Breakdown } from "./score"
import { score } from "./score"

/**
 * Simulated annealing over skeleton node grid positions and chain bend
 * choices. Moves: nudge one node, flip one chain's bend, or shift every node
 * on one side of a cut (stretches the map where a region is crowded).
 */

export interface AnnealOptions {
  iterations: number
  t0: number
  seed: number
  onLog?: (iteration: number, current: Breakdown, best: Breakdown) => void
  logEvery?: number
}

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d_2b_79_f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

const clone = (s: State): State => ({
  x: s.x.slice(),
  y: s.y.slice(),
  bend: [...s.bend],
  river: [...s.river],
})

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

/**
 * Put one skeleton node of a random corridor onto the octilinear line
 * through another node of it, in the direction the corridor's two ends
 * currently point. Aligning a long street one random nudge at a time is
 * hopeless; this move does it directly.
 */
function snapToCorridor(
  ctx: Context,
  s: State,
  next: State,
  rand: () => number
) {
  const c = ctx.corridors[Math.floor(rand() * ctx.corridors.length)]
  if (c === undefined || c.nodes.length < 2) {
    return
  }
  const first = c.nodes[0]
  const last = c.nodes.at(-1) ?? first
  const angle = Math.atan2(s.y[last] - s.y[first], s.x[last] - s.x[first])
  const step = Math.round(angle / (Math.PI / 4))
  const [ux, uy] = [
    Math.round(Math.cos((step * Math.PI) / 4)),
    Math.round(Math.sin((step * Math.PI) / 4)),
  ]
  const anchor = c.nodes[Math.floor(rand() * c.nodes.length)]
  const moved = c.nodes[Math.floor(rand() * c.nodes.length)]
  const [dx, dy] = [s.x[moved] - s.x[anchor], s.y[moved] - s.y[anchor]]
  const t = Math.round((dx * ux + dy * uy) / (ux * ux + uy * uy))
  next.x[moved] = s.x[anchor] + t * ux
  next.y[moved] = s.y[anchor] + t * uy
}

function mutate(ctx: Context, s: State, rand: () => number): State {
  const next = clone(s)
  const n = s.x.length
  const roll = rand()
  if (roll > 0.9) {
    snapToCorridor(ctx, s, next, rand)
    return next
  }
  if (roll < 0.04) {
    next.river[Math.floor(rand() * 3)] += rand() < 0.5 ? 1 : -1
    return next
  }
  if (roll < 0.15) {
    const ci = Math.floor(rand() * s.bend.length)
    next.bend[ci] = next.bend[ci] === 0 ? 1 : 0
    return next
  }
  if (roll < 0.25) {
    const pivot = Math.floor(rand() * n)
    const horizontal = rand() < 0.5
    const step = rand() < 0.5 ? 1 : -1
    const cut = horizontal ? s.x[pivot] : s.y[pivot]
    for (let i = 0; i < n; i++) {
      if (horizontal && s.x[i] >= cut) {
        next.x[i] += step
      } else if (!horizontal && s.y[i] >= cut) {
        next.y[i] += step
      }
    }
    return next
  }
  const i = Math.floor(rand() * n)
  const [dx, dy] = DIRS[Math.floor(rand() * DIRS.length)]
  const k = rand() < 0.8 ? 1 : 2
  next.x[i] += dx * k
  next.y[i] += dy * k
  return next
}

export function anneal(ctx: Context, start: State, opts: AnnealOptions) {
  const rand = rng(opts.seed)
  let cur = start
  let curScore = score(ctx, cur)
  let best = cur
  let bestScore = curScore
  for (let it = 0; it < opts.iterations; it++) {
    const t = opts.t0 * (1 - it / opts.iterations) ** 2 + 1e-3
    const cand = mutate(ctx, cur, rand)
    const candScore = score(ctx, cand)
    const delta = candScore.total - curScore.total
    if (delta <= 0 || rand() < Math.exp(-delta / t)) {
      cur = cand
      curScore = candScore
      if (curScore.total < bestScore.total) {
        best = cur
        bestScore = curScore
      }
    }
    if (opts.onLog && it % (opts.logEvery ?? 1000) === 0) {
      opts.onLog(it, curScore, bestScore)
    }
  }
  return { state: best, score: bestScore }
}
