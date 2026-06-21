/**
 * /promjene geometry generator — announcement-driven, GTFS-illustrated.
 *
 * The announcement is the source of truth for WHAT changed (entries.json curated +
 * candidates.json scraped). This draws the before/after map for each line-change by
 * BRACKETING it: pull the line's canonical route from the archived feed just-before
 * and just-after the change date (registry at /tmp/feeds/registry.json), diff them,
 * and emit the geometry <DiffMap> renders. It does NOT detect change — the change
 * list is the announcements; the feeds only illustrate. A map is kept only when the
 * GTFS shows a real, visible difference (weak/no-diff changes stay text rows).
 *
 * Feeds: run /tmp/fetch-feeds.ts first (downloads archived ZET feeds → registry.json).
 * Run: bun scripts/promjene/build-geometry.ts
 *
 * NOTE: TS for now to iterate the data shape; per repo convention the committed
 * generator should move into the Rust transit crate before this is "done".
 */
import { createReadStream, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { entryId } from "../../app/promjene/lib"

const REGISTRY = "/tmp/feeds/registry.json" // [{version, validFrom, dir, hasShapes}], sorted by validFrom

const REF_LAT = 45.8 // Zagreb, for the local equirectangular projection
const MX = 111320 * Math.cos((REF_LAT * Math.PI) / 180)
const MY = 110540
type LonLat = [number, number]
const toM = ([lon, lat]: LonLat): [number, number] => [lon * MX, lat * MY]

function splitCsv(line: string): string[] {
  const out: string[] = []
  let cur = "", q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c
    } else if (c === '"') q = true
    else if (c === ",") { out.push(cur); cur = "" }
    else cur += c
  }
  out.push(cur)
  return out
}
function readCsv(path: string): { header: string[]; rows: string[][] } {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.length)
  return { header: splitCsv(lines[0]), rows: lines.slice(1).map(splitCsv) }
}
const idx = (header: string[], name: string) => header.indexOf(name)
async function streamCsv(path: string, onRow: (cols: string[], col: (n: string) => number) => void) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity })
  let header: string[] | null = null
  let col: (n: string) => number = () => -1
  for await (const line of rl) {
    if (!line) continue
    if (!header) { header = splitCsv(line); col = (n) => header!.indexOf(n); continue }
    onRow(splitCsv(line), col)
  }
}

interface Stop { id: string; name: string; lat: number; lon: number }
// shape = real GTFS polyline ([] when the feed ships none); headsign = ZET's own
// destination text for that direction (the right terminus label — GTFS last-stop
// names drift from it, e.g. line 145's terminus stop is "Ratarska" but ZET calls
// the destination "Oranice").
interface DirData { shape: LonLat[]; stops: Stop[]; headsign: string }
interface Line { short: string; type: number; dirs: Record<number, DirData> }

/** Load a feed, picking per line+direction the trip that visits the MOST stops —
 * i.e. the full canonical route, not a short-turn / depot run (those fooled the
 * old "dominant shape" pick: line 145 came out as a 6-stop stub to "Ratarska").
 * Keeps the rep trip's real shape if the feed has one; otherwise leaves shape
 * empty and the caller draws a stop-connected line (ZET often ships a reroute
 * with no geometry — e.g. line 101 → Šestine has no shape in any feed). */
async function loadFeed(dir: string, wanted: Set<string>): Promise<Map<string, Line>> {
  const routes = readCsv(join(dir, "routes.txt"))
  const rId = idx(routes.header, "route_id"), rShort = idx(routes.header, "route_short_name"), rType = idx(routes.header, "route_type")
  const routeMeta = new Map<string, { short: string; type: number }>()
  const keepRoutes = new Set<string>()
  for (const r of routes.rows) {
    const short = r[rShort]
    routeMeta.set(r[rId], { short, type: Number(r[rType]) })
    if (wanted.has(short)) keepRoutes.add(r[rId])
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

// ---- geometry helpers (from the proto, geometry-only) ----
function ptSegM(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}
const lenM = (line: LonLat[]) => { let s = 0; for (let i = 1; i < line.length; i++) { const a = toM(line[i - 1]), b = toM(line[i]); s += Math.hypot(b[0] - a[0], b[1] - a[1]) } return s }
function dp(points: LonLat[], tol: number): LonLat[] {
  if (points.length <= 2) return points
  let maxD = 0, maxI = 0
  const a = points[0], b = points[points.length - 1]
  for (let i = 1; i < points.length - 1; i++) { const d = ptSegM(points[i], a, b); if (d > maxD) { maxD = d; maxI = i } }
  return maxD > tol ? [...dp(points.slice(0, maxI + 1), tol).slice(0, -1), ...dp(points.slice(maxI), tol)] : [a, b]
}
const simplify = (line: LonLat[]) => (line.length > 140 ? dp(line, 6e-5) : line)
function snap(p: LonLat, line: LonLat[]): LonLat {
  if (line.length < 2) return p
  const P = toM(p)
  let best = p, bestD = Infinity
  for (let i = 1; i < line.length; i++) {
    const A = toM(line[i - 1]), B = toM(line[i]), dx = B[0] - A[0], dy = B[1] - A[1], l2 = dx * dx + dy * dy
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / l2))
    const d = Math.hypot(P[0] - (A[0] + t * dx), P[1] - (A[1] + t * dy))
    if (d < bestD) { bestD = d; best = [line[i - 1][0] + t * (line[i][0] - line[i - 1][0]), line[i - 1][1] + t * (line[i][1] - line[i - 1][1])] }
  }
  return best
}
const dist = (a: Stop, b: Stop) => { const p = toM([a.lon, a.lat]), q = toM([b.lon, b.lat]); return Math.hypot(p[0] - q[0], p[1] - q[1]) }
const snapStop = (s: { lat: number; lon: number; name: string }, line: LonLat[]) => { const [lon, lat] = snap([s.lon, s.lat], line); return { lat: +lat.toFixed(6), lon: +lon.toFixed(6), name: s.name } }

const TERMINUS_M = 300 // a tip that moved more than this = a terminus change, not a mid-route reroute

/** Pick the direction with the most visible change: terminus move + how many stops
 * differ by name (a mid-route reroute keeps termini but swaps stops). */
function pickChangedDir(o: Line, n: Line): number {
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

type Mode = "diff" | "new" | "removed"
interface Result { geom: object; stat: Record<string, unknown> }

/** Before/after reroute geometry for one line between two loaded feeds. */
function genDiff(line: string, o: Line, n: Line): Result | null {
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
function genOneSided(line: string, mode: "new" | "removed", L: Line): Result | null {
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

/** Is an auto (non-curated) reroute visible enough to be worth a map? */
function visibleDiff(stat: Record<string, unknown>): boolean {
  if (stat.mode !== "diff") return true // new/removed always meaningful
  const added = stat.added as number, removed = stat.removed as number
  const dLen = Math.abs((stat.len_new_km as number) - (stat.len_old_km as number))
  return stat.change === "terminus" || added + removed >= 3 || dLen >= 0.6
}

interface Reg { version: string; validFrom: string; dir: string; hasShapes: boolean }
interface Entry { source: { url: string }; date: string; kind: string; maps: string[]; noticeId?: string }
interface Cand { id: string; date: string | null; lines: string[]; category: string; listWorthy: boolean }
interface Spec { id: string; date: string; lines: string[]; mode: Mode; curated: boolean }

const kindMode = (k: string): Mode => /ukinut/i.test(k) ? "removed" : /nova/i.test(k) ? "new" : "diff"
const catMode = (c: string): Mode => c === "ukinuta" ? "removed" : c === "nova" ? "new" : "diff"
const LINE_CATS = new Set(["nova", "ukinuta", "produljena", "skraćena", "trasa"])

async function main() {
  const dataDir = join(process.cwd(), "data", "promjene")
  // Include shapeless feeds too — genDiff/genOneSided fall back to stop-connected
  // drawing when a feed ships no shapes.txt (ZET feeds before ~2024-10).
  const registry: Reg[] = JSON.parse(readFileSync(REGISTRY, "utf8")).sort((a: Reg, b: Reg) => a.validFrom.localeCompare(b.validFrom))
  if (!registry.length) throw new Error("no feeds in registry — run /tmp/fetch-feeds.ts first")

  // Build the change list: curated entries (always mapped) + scraped line-changes.
  const entries: Entry[] = JSON.parse(readFileSync(join(dataDir, "entries.json"), "utf8")).entries
  const cands: Cand[] = JSON.parse(readFileSync(join(dataDir, "candidates.json"), "utf8")).candidates
  // key geom by the ZET notice id (matches the page's lookup); some source URLs point at
  // an archived listing that doesn't carry the id, so take noticeId explicitly when given.
  const curated: Spec[] = entries.map((e) => ({ id: entryId(e), date: e.date, lines: e.maps, mode: kindMode(e.kind), curated: true }))
  const curatedIds = new Set(curated.map((s) => s.id))
  const auto: Spec[] = cands
    .filter((c) => c.listWorthy && c.date && c.lines.length >= 1 && LINE_CATS.has(c.category) && !curatedIds.has(c.id))
    .map((c) => ({ id: c.id, date: c.date!, lines: c.lines, mode: catMode(c.category), curated: false }))
  const specs = [...curated, ...auto]

  // Load every feed (for the union of changed lines), then bracket each change by
  // LINE PRESENCE, not just the announcement date: a removed line is drawn from the
  // latest feed that still has it, a new line from the earliest — because the GTFS
  // change can lead/lag the announcement (line 145 vanished months before its notice).
  const allLines = new Set(specs.flatMap((s) => s.lines))
  const loaded = new Map<string, Map<string, Line>>()
  for (const r of registry) { console.error(`loading v${r.version} ${r.validFrom}…`); loaded.set(r.dir, await loadFeed(r.dir, allLines)) }
  const has = (r: Reg, line: string) => loaded.get(r.dir)?.has(line) ?? false
  const get = (r: Reg, line: string) => loaded.get(r.dir)!.get(line)!
  const feedsWith = (line: string) => registry.filter((r) => has(r, line)) // sorted by validFrom
  const first = registry[0], last = registry.at(-1)!

  const geomDir = join(dataDir, "geom")
  mkdirSync(geomDir, { recursive: true })
  const index: Record<string, Record<string, unknown>> = {}
  let maps = 0, skipped = 0
  for (const s of specs) {
    for (const line of s.lines) {
      const fw = feedsWith(line)
      let res: Result | null = null
      let bestSpan = 0 // days between the winning diff's bracketing feeds
      if (s.mode === "diff") {
        // The actual GTFS reroute can land a feed or two off the announcement date,
        // so scan consecutive feed transitions near the date and keep the one where
        // the route changes MOST (a date-aligned pair often straddles no change).
        const D = Date.parse(s.date), WIN = 80 * 86400000
        let bestMag = -1
        for (let i = 0; i < fw.length - 1; i++) {
          const o = fw[i], n = fw[i + 1]
          if (D < Date.parse(o.validFrom) - WIN || D > Date.parse(n.validFrom) + WIN) continue
          const r = genDiff(line, get(o, line), get(n, line))
          if (!r) continue
          const st = r.stat as { added: number; removed: number }
          const mag = st.added + st.removed // the genuine biggest stop-change (no terminus bias → avoids depot-variant blips)
          if (mag > bestMag) { bestMag = mag; res = r; bestSpan = Date.parse(n.validFrom) - Date.parse(o.validFrom) }
        }
      } else if (s.mode === "removed") {
        const lastWith = fw.at(-1) // latest feed that still has the line
        if (lastWith && (s.curated || (last.validFrom > lastWith.validFrom && !has(last, line)))) res = genOneSided(line, "removed", get(lastWith, line))
      } else { // new
        const firstWith = fw[0] // earliest feed that has the line
        if (firstWith && (s.curated || (first.validFrom < firstWith.validFrom && !has(first, line)))) res = genOneSided(line, "new", get(firstWith, line))
      }
      if (!res) { skipped++; continue }
      if (!s.curated && !visibleDiff(res.stat)) { skipped++; continue } // auto weak/no-diff → stays a text row
      // A wide bracket accumulates unrelated drift, so a MIXED add+remove diff over
      // one is unreliable (the genuine reroute is muddied by months of other edits).
      // A monotonic change (pure extension / pure truncation) survives — the old
      // route is still a clean sub/superset of the new one. Curated entries trusted.
      if (!s.curated && bestSpan > 150 * 86400000) {
        const st = res.stat as { added: number; removed: number }
        if (st.added > 0 && st.removed > 0) { skipped++; continue }
      }
      writeFileSync(join(geomDir, `${s.id}-${line}.json`), JSON.stringify(res.geom))
      ;(index[s.id] ??= {})[line] = res.stat
      maps++
    }
  }
  writeFileSync(join(geomDir, "index.json"), JSON.stringify(index, null, 2))
  console.error(`\nwrote ${maps} maps across ${Object.keys(index).length} announcements (skipped ${skipped} no/weak-diff). feeds: ${registry[0].validFrom}..${registry.at(-1)!.validFrom}`)
}
main()
