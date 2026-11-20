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
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { entryId } from "../../app/promjene/lib"
import { genDiff, genOneSided, loadFeed } from "../lib/gtfs-feed"
import type { DiffResult, Line, Mode, Result } from "../lib/gtfs-feed"
import { readJson } from "../lib/json"

// [{version, validFrom, dir, hasShapes}], sorted by validFrom
const REGISTRY = "/tmp/feeds/registry.json"

/** Is an auto (non-curated) reroute visible enough to be worth a map? */
function visibleDiff(stat: Result["stat"]): boolean {
  // new/removed always meaningful
  if (stat.mode !== "diff") {
    return true
  }
  const { added, removed } = stat
  const dLen = Math.abs(stat.len_new_km - stat.len_old_km)
  return stat.change === "terminus" || added + removed >= 3 || dLen >= 0.6
}

interface Reg {
  version: string
  validFrom: string
  dir: string
  hasShapes: boolean
}
interface Entry {
  source: { url: string }
  date: string
  kind: string
  maps: Array<string>
  noticeId?: string
}
interface Cand {
  id: string
  date: string | null
  lines: Array<string>
  category: string
  listWorthy: boolean
}
interface Spec {
  id: string
  date: string
  lines: Array<string>
  mode: Mode
  curated: boolean
}

const kindMode = (k: string): Mode =>
  /ukinut/iu.test(k) ? "removed" : /nova/iu.test(k) ? "new" : "diff"
const catMode = (c: string): Mode =>
  c === "ukinuta" ? "removed" : c === "nova" ? "new" : "diff"
const LINE_CATS = new Set([
  "nova",
  "ukinuta",
  "produljena",
  "skraćena",
  "trasa",
])

// The actual GTFS reroute can land a feed or two off the announcement date,
// so scan consecutive feed transitions near the date and keep the one where
// the route changes MOST (a date-aligned pair often straddles no change).
function bestDiff(
  line: string,
  fw: Array<Reg>,
  date: string,
  get: (r: Reg, line: string) => Line
) {
  const D = Date.parse(date),
    WIN = 80 * 86_400_000
  let bestMag = -1,
    bestSpan = 0
  let res: DiffResult | null = null
  for (let i = 0; i < fw.length - 1; i++) {
    const o = fw[i],
      n = fw[i + 1]
    if (
      D < Date.parse(o.validFrom) - WIN ||
      D > Date.parse(n.validFrom) + WIN
    ) {
      continue
    }
    const r = genDiff(line, get(o, line), get(n, line))
    if (!r) {
      continue
    }
    // the genuine biggest stop-change (no terminus bias → avoids depot-variant blips)
    const mag = r.stat.added + r.stat.removed
    if (mag > bestMag) {
      bestMag = mag
      res = r
      bestSpan = Date.parse(n.validFrom) - Date.parse(o.validFrom)
    }
  }
  return { res, bestSpan }
}

function buildSpecs(dataDir: string): Array<Spec> {
  // Build the change list: curated entries (always mapped) + scraped line-changes.
  const { entries } = readJson<{ entries: Array<Entry> }>(
    join(dataDir, "entries.json")
  )
  const { candidates: cands } = readJson<{ candidates: Array<Cand> }>(
    join(dataDir, "candidates.json")
  )
  // key geom by the ZET notice id (matches the page's lookup); some source URLs point at
  // an archived listing that doesn't carry the id, so take noticeId explicitly when given.
  const curated: Array<Spec> = entries.map((e) => ({
    id: entryId(e),
    date: e.date,
    lines: e.maps,
    mode: kindMode(e.kind),
    curated: true,
  }))
  const curatedIds = new Set(curated.map((s) => s.id))
  const auto: Array<Spec> = cands.flatMap((c) =>
    c.listWorthy &&
    c.date !== null &&
    c.date !== "" &&
    c.lines.length > 0 &&
    LINE_CATS.has(c.category) &&
    !curatedIds.has(c.id)
      ? [
          {
            id: c.id,
            date: c.date,
            lines: c.lines,
            mode: catMode(c.category),
            curated: false,
          },
        ]
      : []
  )
  return [...curated, ...auto]
}

function isWorthMap(s: Spec, res: Result, bestSpan: number): boolean {
  // auto weak/no-diff → stays a text row
  if (!s.curated && !visibleDiff(res.stat)) {
    return false
  }
  // A wide bracket accumulates unrelated drift, so a MIXED add+remove diff over
  // one is unreliable (the genuine reroute is muddied by months of other edits).
  // A monotonic change (pure extension / pure truncation) survives — the old
  // route is still a clean sub/superset of the new one. Curated entries trusted.
  return !(
    !s.curated &&
    bestSpan > 150 * 86_400_000 &&
    res.stat.mode === "diff" &&
    res.stat.added > 0 &&
    res.stat.removed > 0
  )
}

async function main() {
  const dataDir = join(process.cwd(), "data", "promjene")
  // Include shapeless feeds too — genDiff/genOneSided fall back to stop-connected
  // drawing when a feed ships no shapes.txt (ZET feeds before ~2024-10).
  const registry = readJson<Array<Reg>>(REGISTRY).toSorted((a, b) =>
    a.validFrom.localeCompare(b.validFrom)
  )
  const last = registry.at(-1)
  if (!last) {
    throw new Error("no feeds in registry — run /tmp/fetch-feeds.ts first")
  }

  const specs = buildSpecs(dataDir)

  // Load every feed (for the union of changed lines), then bracket each change by
  // LINE PRESENCE, not just the announcement date: a removed line is drawn from the
  // latest feed that still has it, a new line from the earliest — because the GTFS
  // change can lead/lag the announcement (line 145 vanished months before its notice).
  const allLines = new Set(specs.flatMap((s) => s.lines))
  const loaded = new Map<string, Map<string, Line>>()
  for (const r of registry) {
    console.error(`loading v${r.version} ${r.validFrom}…`)
    // oxlint-disable-next-line no-await-in-loop -- feeds load one at a time to keep only one stop_times.txt stream in flight and the log in order
    loaded.set(r.dir, await loadFeed(r.dir, allLines))
  }
  const has = (r: Reg, line: string) => loaded.get(r.dir)?.has(line) ?? false
  const get = (r: Reg, line: string) => {
    const found = loaded.get(r.dir)?.get(line)
    if (!found) {
      throw new Error(`feed ${r.dir} has no line ${line}`)
    }
    return found
  }
  // sorted by validFrom
  const feedsWith = (line: string) => registry.filter((r) => has(r, line))
  const first = registry[0]

  const geomDir = join(dataDir, "geom")
  mkdirSync(geomDir, { recursive: true })
  const index: Record<string, Record<string, Result["stat"]>> = {}
  let maps = 0,
    skipped = 0
  for (const s of specs) {
    for (const line of s.lines) {
      const fw = feedsWith(line)
      let res: Result | null = null
      // days between the winning diff's bracketing feeds
      let bestSpan = 0
      if (s.mode === "diff") {
        ;({ res, bestSpan } = bestDiff(line, fw, s.date, get))
      } else if (s.mode === "removed") {
        // latest feed that still has the line
        const lastWith = fw.at(-1)
        if (
          lastWith &&
          (s.curated ||
            (last.validFrom > lastWith.validFrom && !has(last, line)))
        ) {
          res = genOneSided(line, "removed", get(lastWith, line))
        }
      } else {
        // new: earliest feed that has the line
        const firstWith = fw.at(0)
        if (
          firstWith &&
          (s.curated ||
            (first.validFrom < firstWith.validFrom && !has(first, line)))
        ) {
          res = genOneSided(line, "new", get(firstWith, line))
        }
      }
      if (!res || !isWorthMap(s, res, bestSpan)) {
        skipped++
        continue
      }
      writeFileSync(
        join(geomDir, `${s.id}-${line}.json`),
        JSON.stringify(res.geom)
      )
      ;(index[s.id] ??= {})[line] = res.stat
      maps++
    }
  }
  writeFileSync(join(geomDir, "index.json"), JSON.stringify(index, null, 2))
  console.error(
    `\nwrote ${maps} maps across ${Object.keys(index).length} announcements (skipped ${skipped} no/weak-diff). feeds: ${registry[0].validFrom}..${last.validFrom}`
  )
}
await main()
