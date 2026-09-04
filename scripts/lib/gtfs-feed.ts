/**
 * Shared ZET GTFS feed model: load each line's canonical route per direction
 * (`loadFeed`) and turn a before/after pair into the geometry `<DiffMap>`
 * renders (`genDiff` / `genOneSided` / `pickChangedDir`).
 *
 * Moved verbatim out of scripts/promjene/build-geometry.ts (the committed
 * pipeline) so the scripts/proto/* prototypes diff feeds with the SAME loader
 * and diff logic instead of drifting copies — the old proto "dominant shape"
 * loader was a known false-positive source.
 */
import { join } from "node:path"
import { idx, readCsv, streamCsv } from "./gtfs-csv"
import { distM, lenM, simplify, snapStop, type LonLat } from "./geo-line"

export interface Stop { id: string; name: string; lat: number; lon: number }
// shape = real GTFS polyline ([] when the feed ships none); headsign = ZET's own
// destination text for that direction (the right terminus label — GTFS last-stop
// names drift from it, e.g. line 145's terminus stop is "Ratarska" but ZET calls
// the destination "Oranice").
export interface DirData { shape: LonLat[]; stops: Stop[]; headsign: string }
export interface Line { short: string; type: number; dirs: Record<number, DirData> }

/** Load a feed, picking per line+direction the trip that visits the MOST stops —
 * i.e. the full canonical route, not a short-turn / depot run (those fooled the
 * old "dominant shape" pick: line 145 came out as a 6-stop stub to "Ratarska").
 * Keeps the rep trip's real shape if the feed has one; otherwise leaves shape
 * empty and the caller draws a stop-connected line (ZET often ships a reroute
 * with no geometry — e.g. line 101 → Šestine has no shape in any feed).
 * `wanted` filters by route_short_name; omit it to load every line. */
export async function loadFeed(dir: string, wanted?: Set<string>): Promise<Map<string, Line>> {
  const routes = readCsv(join(dir, "routes.txt"))
  const rId = idx(routes.header, "route_id"), rShort = idx(routes.header, "route_short_name"), rType = idx(routes.header, "route_type")
  const routeMeta = new Map<string, { short: string; type: number }>()
  const keepRoutes = new Set<string>()
  for (const r of routes.rows) {
    const short = r[rShort]
    routeMeta.set(r[rId], { short, type: Number(r[rType]) })
    if (!wanted || wanted.has(short)) keepRoutes.add(r[rId])
  }

  // every trip of a wanted route, with its direction + shape_id + headsign
  const tripInfo = new Map<string, { route: string; dir: number; shape: string; headsign: string }>()
  await streamCsv(join(dir, "trips.txt"), (c, col) => {
    const route = c[col("route_id")]
    if (!keepRoutes.has(route)) return
    tripInfo.set(c[col("trip_id")], { route, dir: Number(c[col("direction_id")] || "0"), shape: c[col("shape_id")], headsign: c[col("trip_headsign")] })
  })

  // ordered stop sequence for those trips
  const tripStops = new Map<string, [number, string][]>()
  await streamCsv(join(dir, "stop_times.txt"), (c, col) => {
    const t = c[col("trip_id")]
    if (!tripInfo.has(t)) return
    tripStops.set(t, [...(tripStops.get(t) ?? []), [Number(c[col("stop_sequence")]), c[col("stop_id")]]])
  })

  // rep trip per (route|dir): pick the DOMINANT headsign (most trips) first, then
  // the most-stops trip within it. Headsign-first avoids both short-turns (few
  // trips) and depot runs (few trips, but the most stops — tram 8's rare
  // "Spr.Dubrava" depot leg fooled a plain most-stops pick).
  const headCount = new Map<string, number>() // route|dir|headsign -> trips
  for (const info of tripInfo.values()) headCount.set(`${info.route}|${info.dir}|${info.headsign}`, (headCount.get(`${info.route}|${info.dir}|${info.headsign}`) ?? 0) + 1)
  const domHead = new Map<string, { head: string; n: number }>() // route|dir -> dominant headsign
  for (const [gk, n] of headCount) {
    const i = gk.lastIndexOf("|"), rk = gk.slice(0, i), head = gk.slice(i + 1)
    if (n > (domHead.get(rk)?.n ?? -1)) domHead.set(rk, { head, n })
  }
  const rep = new Map<string, { trip: string; shape: string; headsign: string; count: number }>()
  for (const [trip, info] of tripInfo) {
    const rk = `${info.route}|${info.dir}`
    if (info.headsign !== domHead.get(rk)?.head) continue
    const n = tripStops.get(trip)?.length ?? 0
    if (n > (rep.get(rk)?.count ?? -1)) rep.set(rk, { trip, shape: info.shape, headsign: info.headsign, count: n })
  }

  const wantShapes = new Set([...rep.values()].map((v) => v.shape).filter(Boolean))
  const shapePts = new Map<string, [number, number, number][]>()
  if (wantShapes.size) await streamCsv(join(dir, "shapes.txt"), (c, col) => {
    const s = c[col("shape_id")]
    if (!wantShapes.has(s)) return
    shapePts.set(s, [...(shapePts.get(s) ?? []), [Number(c[col("shape_pt_sequence")]), Number(c[col("shape_pt_lon")]), Number(c[col("shape_pt_lat")])]])
  })
  const shapeLine = new Map<string, LonLat[]>()
  for (const [s, pts] of shapePts) { pts.sort((a, b) => a[0] - b[0]); shapeLine.set(s, pts.map((p) => [p[1], p[2]])) }

  const stops = readCsv(join(dir, "stops.txt"))
  const sId = idx(stops.header, "stop_id"), sName = idx(stops.header, "stop_name"), sLat = idx(stops.header, "stop_lat"), sLon = idx(stops.header, "stop_lon")
  const stopInfo = new Map<string, { name: string; lat: number; lon: number }>()
  for (const r of stops.rows) stopInfo.set(r[sId], { name: r[sName], lat: Number(r[sLat]), lon: Number(r[sLon]) })

  const lines = new Map<string, Line>()
  for (const [rk, r] of rep) {
    const [route, dir2] = rk.split("|")
    const meta = routeMeta.get(route)!
    const seq = (tripStops.get(r.trip) ?? []).sort((a, b) => a[0] - b[0])
    const stopList: Stop[] = seq.map(([, id]) => ({ id, ...(stopInfo.get(id) ?? { name: id, lat: 0, lon: 0 }) }))
    if (!lines.has(meta.short)) lines.set(meta.short, { short: meta.short, type: meta.type, dirs: {} })
    lines.get(meta.short)!.dirs[Number(dir2)] = { shape: shapeLine.get(r.shape) ?? [], stops: stopList, headsign: r.headsign }
  }
  return lines
}

const dist = (a: Stop, b: Stop) => distM([a.lon, a.lat], [b.lon, b.lat])

export const TERMINUS_M = 300 // a tip that moved more than this = a terminus change, not a mid-route reroute

/** Pick the direction with the most visible change: terminus move + how many stops
 * differ by name (a mid-route reroute keeps termini but swaps stops). */
export function pickChangedDir(o: Line, n: Line): number {
  let bestDir = 0, bestScore = -1
  for (const dir of [0, 1]) {
    const od = o.dirs[dir], nd = n.dirs[dir]
    if (!od?.stops.length || !nd?.stops.length) continue
    const move = Math.max(dist(nd.stops.at(-1)!, od.stops.at(-1)!), dist(nd.stops[0], od.stops[0]))
    const oN = new Set(od.stops.map((s) => s.name)), nN = new Set(nd.stops.map((s) => s.name))
    const diff = nd.stops.filter((s) => !oN.has(s.name)).length + od.stops.filter((s) => !nN.has(s.name)).length
    const score = move + diff * 200
    if (score > bestScore) { bestScore = score; bestDir = dir }
  }
  return bestDir
}

// Draw a direction's line: real GTFS shape when present, else stop-connected.
const stopLine = (d: DirData): LonLat[] => d.stops.map((s) => [s.lon, s.lat] as LonLat)
const km = (line: LonLat[]) => +(lenM(line) / 1000).toFixed(1)
const relabel = (s: Stop, name: string): Stop => ({ ...s, name })

export type Mode = "diff" | "new" | "removed"
export interface Result { geom: object; stat: Record<string, unknown> }

/** Before/after reroute geometry for one line between two loaded feeds. */
export function genDiff(line: string, o: Line, n: Line): Result | null {
  const dir = pickChangedDir(o, n)
  const od = o.dirs[dir], nd = n.dirs[dir]
  if (!od?.stops.length || !nd?.stops.length) return null
  const moveStart = dist(nd.stops[0], od.stops[0]), moveEnd = dist(nd.stops.at(-1)!, od.stops.at(-1)!)
  const change: "terminus" | "midroute" = Math.max(moveStart, moveEnd) > TERMINUS_M ? "terminus" : "midroute"
  // A headsign names the END of its direction — only labels a tip that IS the end.
  let shared: Stop, newTip: Stop, oldTip: Stop
  if (change === "midroute" || moveEnd >= moveStart) {
    shared = nd.stops[0]; newTip = relabel(nd.stops.at(-1)!, nd.headsign); oldTip = relabel(od.stops.at(-1)!, od.headsign)
  } else {
    shared = nd.stops.at(-1)!; newTip = nd.stops[0]; oldTip = od.stops[0]
  }
  const oNames = new Set(od.stops.map((s) => s.name)), nNames = new Set(nd.stops.map((s) => s.name))
  // Either side missing GTFS geometry → draw BOTH stop-connected so the shared
  // trunk overlaps exactly (mixing smooth + angular reads as "whole route changed").
  const real = od.shape.length > 0 && nd.shape.length > 0
  const sOld = real ? simplify(od.shape) : stopLine(od), sNew = real ? simplify(nd.shape) : stopLine(nd)
  const added = nd.stops.filter((s) => !oNames.has(s.name)), removed = od.stops.filter((s) => !nNames.has(s.name))
  return {
    geom: {
      line, mode: "diff", change, stopConnected: !real,
      shared: snapStop(shared, sNew), newTip: snapStop(newTip, sNew), oldTip: snapStop(oldTip, sOld),
      old: { shape: sOld }, new: { shape: sNew },
      newStops: nd.stops.map((s) => snapStop(s, sNew)),
      addedStops: added.map((s) => snapStop(s, sNew)), removedStops: removed.map((s) => snapStop(s, sOld)),
    },
    stat: {
      mode: "diff", change, len_old_km: km(sOld), len_new_km: km(sNew), added: added.length, removed: removed.length,
      oldTipName: oldTip.name, newTipName: newTip.name, relacija: `${nd.stops[0].name} – ${nd.headsign}`,
    },
  }
}

/** One-sided geometry for a new (read from after-feed) or removed (before-feed) line. */
export function genOneSided(line: string, mode: "new" | "removed", L: Line): Result | null {
  const d = L.dirs[0] ?? L.dirs[1]
  if (!d?.stops.length) return null
  const drawn = d.shape.length ? simplify(d.shape) : stopLine(d)
  const stops = d.stops.map((s) => snapStop(s, drawn))
  const origin = stops[0], terminus = snapStop(relabel(d.stops.at(-1)!, d.headsign), drawn)
  return {
    geom: {
      line, mode, stopConnected: !d.shape.length, shared: origin, newTip: terminus, oldTip: terminus,
      old: { shape: mode === "removed" ? drawn : [] }, new: { shape: mode === "new" ? drawn : [] },
      newStops: mode === "new" ? stops : [], addedStops: [], removedStops: mode === "removed" ? stops : [],
    },
    stat: { mode, len_km: km(drawn), stops_count: stops.length, terminusName: terminus.name, originName: origin.name },
  }
}
