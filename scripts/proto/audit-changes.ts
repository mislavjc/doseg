/**
 * PROTOTYPE AUDIT — classify each line's change between two GTFS feeds using
 * robust signals (route_long_name + dominant headsign per direction), not the
 * fragile "dominant shape" the diff used. Run: bun scripts/proto/audit-changes.ts <oldDir> <newDir>
 */
import { join } from "node:path"
import { readCsv } from "../lib/gtfs-csv"

const [, , OLD, NEW] = process.argv

function rows(path: string) {
  const { header, rows: data } = readCsv(path)
  return { idx: (n: string) => header.indexOf(n), data }
}

interface Line { short: string; long: string; type: number; head: Record<string, Record<string, number>> } // head[dir][headsign]=count

function load(dir: string): Map<string, Line> {
  const r = rows(join(dir, "routes.txt"))
  const rId = r.idx("route_id"), rShort = r.idx("route_short_name"), rLong = r.idx("route_long_name"), rType = r.idx("route_type")
  const byId = new Map<string, Line>()
  for (const row of r.data) byId.set(row[rId], { short: row[rShort], long: row[rLong], type: Number(row[rType]), head: {} })

  const t = rows(join(dir, "trips.txt"))
  const tRoute = t.idx("route_id"), tDir = t.idx("direction_id"), tHead = t.idx("trip_headsign")
  for (const row of t.data) {
    const L = byId.get(row[tRoute]); if (!L) continue
    const d = row[tDir] || "0", h = row[tHead] || "?"
    ;(L.head[d] ??= {})[h] = (L.head[d]?.[h] ?? 0) + 1
  }
  // key by short_name (the stable line number)
  const byShort = new Map<string, Line>()
  for (const L of byId.values()) if (L.short) byShort.set(L.short, L)
  return byShort
}

const topHead = (L: Line, d: string) => Object.entries(L.head[d] ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—"

const oldF = load(OLD), newF = load(NEW)
const oldS = new Set(oldF.keys()), newS = new Set(newF.keys())

console.log(`\nADDED lines:   ${[...newS].filter((s) => !oldS.has(s)).sort().join(", ")}`)
console.log(`REMOVED lines: ${[...oldS].filter((s) => !newS.has(s)).sort().join(", ")}`)

console.log(`\nLINES WITH A REAL TERMINAL / NAME CHANGE (long_name or dominant headsign moved):`)
const real: string[] = []
for (const s of [...newS].filter((x) => oldS.has(x)).sort((a, b) => (+a || 1e9) - (+b || 1e9))) {
  const o = oldF.get(s)!, n = newF.get(s)!
  const longChg = o.long !== n.long
  const h0o = topHead(o, "0"), h0n = topHead(n, "0"), h1o = topHead(o, "1"), h1n = topHead(n, "1")
  const headChg = h0o !== h0n || h1o !== h1n
  if (longChg || headChg) {
    real.push(s)
    console.log(`  ${s.padEnd(5)} ${longChg ? `long_name: "${o.long}" → "${n.long}"` : `long_name same ("${n.long}")`}`)
    if (headChg) console.log(`        headsign dir0: "${h0o}"→"${h0n}"   dir1: "${h1o}"→"${h1n}"`)
  }
}
if (!real.length) console.log("  (none)")

console.log(`\nVERDICT on the proto's 6 cards:`)
for (const s of ["2", "295", "217", "3", "162", "207"]) {
  const o = oldF.get(s), n = newF.get(s)
  if (!o && n) { console.log(`  ${s.padEnd(5)} REAL — new line (not in old feed). long_name "${n.long}"`); continue }
  if (o && !n) { console.log(`  ${s.padEnd(5)} REAL — removed line (gone from new feed). long_name "${o.long}"`); continue }
  if (!o || !n) continue
  const longChg = o.long !== n.long
  const headChg = topHead(o, "0") !== topHead(n, "0") || topHead(o, "1") !== topHead(n, "1")
  console.log(`  ${s.padEnd(5)} ${longChg || headChg ? "REAL terminal/route change" : "ARTIFACT — long_name & headsigns identical, no terminal change"}  [${n.long}]  dir0 ${topHead(o, "0")}→${topHead(n, "0")} · dir1 ${topHead(o, "1")}→${topHead(n, "1")}`)
}
