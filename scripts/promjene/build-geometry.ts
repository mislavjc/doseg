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
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { entryId } from "../../app/promjene/lib"
import { genDiff, genOneSided, loadFeed, type Line, type Mode, type Result } from "../lib/gtfs-feed"

const REGISTRY = "/tmp/feeds/registry.json" // [{version, validFrom, dir, hasShapes}], sorted by validFrom

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
