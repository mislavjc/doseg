import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

import { readJson } from "../json"
import type { Pt } from "./geometry"
import type { Network } from "./graph"
import { toKm } from "./graph"

/**
 * Corridors: long runs of a line along one straight street (Ilica,
 * Maksimirska and Avenija Dubrava, Savska, Branimirova, ...). A run counts
 * when every stop sits within STOP_TOL of the chord between its ends and the
 * OSM tram track (Overpass, cached) stays within TRACK_TOL of that chord all
 * the way, so a gentle real curve or a turn between two stops breaks it. The
 * layout has to draw each corridor as one straight segment.
 */

const OVERPASS = "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
const QUERY =
  '[out:json][timeout:60];way["railway"="tram"](45.74,15.86,45.88,16.12);out geom;'

const MIN_KM = 1.2
const MIN_STOPS = 4
const TRACK_TOL = 0.1
const SAMPLE_KM = 0.05
/** A stop gap of at least GAP_MIN_KM heading more than GAP_TURN off the chord is a corner. */
const GAP_MIN_KM = 0.15
const GAP_TURN = (30 * Math.PI) / 180
/**
 * Neighbouring straight runs join into one corridor while every stop of the
 * joined run stays within this share of its length of the chord (a long
 * avenue that drifts gently, like Maksimirska into Avenija Dubrava).
 */
const MERGE_TOL = 0.08
const stopTol = (km: number) => Math.max(0.08, 0.03 * km)

type Seg = [Pt, Pt]

export async function loadTramTracks(cachePath: string): Promise<Array<Seg>> {
  if (!existsSync(cachePath)) {
    const res = await fetch(OVERPASS, {
      method: "POST",
      body: new URLSearchParams({ data: QUERY }),
    })
    if (!res.ok) {
      throw new Error(`Overpass ${res.status}`)
    }
    mkdirSync(dirname(cachePath), { recursive: true })
    writeFileSync(cachePath, await res.text())
  }
  const json = readJson<{
    elements: Array<{ geometry?: Array<{ lat: number; lon: number }> }>
  }>(cachePath)
  return json.elements.flatMap((e) => {
    const pts = (e.geometry ?? []).map((g) => {
      const { gx, gy } = toKm(g.lat, g.lon)
      return { x: gx, y: gy }
    })
    return pts.slice(1).map((b, i): Seg => [pts[i], b])
  })
}

function segDist(p: Pt, [a, b]: Seg) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  const t =
    l2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}

function perp(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return (
    Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / (Math.hypot(dx, dy) || 1)
  )
}

type Run = Array<number>

function straightTest(net: Network, tracks: Array<Seg>) {
  const at = (v: number): Pt => ({
    x: net.stations[v].gx,
    y: net.stations[v].gy,
  })
  const near = (p: Pt) =>
    tracks.some(
      (s) =>
        Math.min(s[0].x, s[1].x) - TRACK_TOL <= p.x &&
        Math.max(s[0].x, s[1].x) + TRACK_TOL >= p.x &&
        Math.min(s[0].y, s[1].y) - TRACK_TOL <= p.y &&
        Math.max(s[0].y, s[1].y) + TRACK_TOL >= p.y &&
        segDist(p, s) <= TRACK_TOL
    )
  /** No stop gap of GAP_MIN_KM or more turns over GAP_TURN off the chord. */
  const cornerFree = (seq: Run) => {
    const [a, b] = [at(seq[0]), at(seq.at(-1) ?? seq[0])]
    const chord = Math.atan2(b.y - a.y, b.x - a.x)
    return seq.slice(1).every((v, i) => {
      const [p, q] = [at(seq[i]), at(v)]
      const off = Math.atan2(q.y - p.y, q.x - p.x) - chord
      return (
        Math.hypot(q.x - p.x, q.y - p.y) < GAP_MIN_KM ||
        Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) <= GAP_TURN
      )
    })
  }
  const straight = (seq: Run) => {
    const [a, b] = [at(seq[0]), at(seq.at(-1) ?? seq[0])]
    const km = Math.hypot(b.x - a.x, b.y - a.y)
    if (seq.some((v) => perp(at(v), a, b) > stopTol(km))) {
      return false
    }
    if (!cornerFree(seq)) {
      return false
    }
    const steps = Math.ceil(km / SAMPLE_KM)
    for (let k = 0; k <= steps; k++) {
      const t = k / steps
      if (!near({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) {
        return false
      }
    }
    return true
  }
  const km = (seq: Run) => {
    const [a, b] = [at(seq[0]), at(seq.at(-1) ?? seq[0])]
    return Math.hypot(b.x - a.x, b.y - a.y)
  }
  const nearStraight = (seq: Run) => {
    const [a, b] = [at(seq[0]), at(seq.at(-1) ?? seq[0])]
    const tol = Math.max(0.15, MERGE_TOL * km(seq))
    return seq.every((v) => perp(at(v), a, b) <= tol) && cornerFree(seq)
  }
  return { straight, nearStraight, km }
}

/** A line's stops cut into maximal straight runs sharing their end stops. */
function straightRuns(stops: Run, straight: (seq: Run) => boolean) {
  const runs: Array<Run> = []
  let i = 0
  while (i < stops.length - 1) {
    let j = i + 1
    while (j + 1 < stops.length && straight(stops.slice(i, j + 2))) {
      j++
    }
    runs.push(stops.slice(i, j + 1))
    i = j
  }
  return runs
}

/** Join consecutive runs while the joined run stays near-straight. */
function mergeRuns(runs: Array<Run>, nearStraight: (seq: Run) => boolean) {
  const merged: Array<Run> = []
  for (const run of runs) {
    const last = merged.at(-1)
    const joined = last ? [...last, ...run.slice(1)] : run
    if (last && run.length >= 3 && last.length >= 3 && nearStraight(joined)) {
      last.push(...run.slice(1))
    } else {
      merged.push([...run])
    }
  }
  return merged
}

/** Drop corridors that another, longer corridor already contains. */
function maximal(all: Array<Run>) {
  const keys = all.map((c) => `>${c.join(">")}>`)
  const reversed = all.map((c) => `>${c.toReversed().join(">")}>`)
  return all.filter(
    (_, i) =>
      !keys.some(
        (k, j) =>
          j !== i &&
          k.length > keys[i].length &&
          (k.includes(keys[i]) || k.includes(reversed[i]))
      )
  )
}

export function findCorridors(net: Network, tracks: Array<Seg>): Array<Run> {
  const { straight, nearStraight, km } = straightTest(net, tracks)
  const found = new Map<string, Run>()
  for (const route of net.routes.filter((r) => !r.isNight)) {
    const runs = mergeRuns(straightRuns(route.stations, straight), nearStraight)
    for (const seq of runs) {
      if (seq.length >= MIN_STOPS && km(seq) >= MIN_KM) {
        const ordered = seq[0] > (seq.at(-1) ?? 0) ? seq.toReversed() : seq
        found.set(ordered.join(">"), ordered)
      }
    }
  }
  return maximal([...found.values()])
}
