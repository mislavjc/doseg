/** Build the eval body cache: pick a stratified sample of listWorthy ZET notices and
 * fetch each one's ARCHIVED article body (the real text the LLM/agents read), writing
 * scripts/promjene/eval/bodies.json — committed so the eval is reproducible without /tmp.
 *
 * Sampling over-weights the rare, high-signal line-changes (nova/produljena/skraćena/
 * trasa: all of them) and date-spreads the abundant stop notices, so the gold tests both
 * the keep/drop (permanence) call and category/role extraction across the real range.
 *
 * Run: bun scripts/promjene/eval/fetch-bodies.ts
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { loadBody, pool } from "../extract"

const DIR = join(process.cwd(), "scripts/promjene/eval")
const OUT = join(DIR, "bodies.json")
const STOP_TARGET = 16 // stop notices in the set (line-changes are all taken — they're rare/high-signal)

type Cand = { id: string; url: string; title: string; date: string | null; category: string; permanence: string; listWorthy: boolean }
const cands: Cand[] = JSON.parse(readFileSync(join(process.cwd(), "data/promjene/candidates.json"), "utf8")).candidates
const listWorthy = cands.filter((c) => c.listWorthy)

// Seed with whatever's already cached (committed file, then the old /tmp scratch) so we
// never re-fetch and the existing 16 gold ids stay in the set.
const bodies: Record<string, string> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {}
if (existsSync("/tmp/zet-bodies.json")) for (const [k, v] of Object.entries(JSON.parse(readFileSync("/tmp/zet-bodies.json", "utf8")))) bodies[k] ??= v as string
const already = new Set(Object.keys(bodies))

const LINE = new Set(["nova", "ukinuta", "produljena", "skraćena", "trasa"])
const lineCands = listWorthy.filter((c) => LINE.has(c.category))
// stop notices, oldest→newest, then sample evenly across the timeline up to STOP_TARGET
const stops = listWorthy.filter((c) => c.category === "stajalište").sort((a, b) => (a.date ?? "0").localeCompare(b.date ?? "0"))
const stopsCached = stops.filter((c) => already.has(c.id)).length
const stopBudget = Math.max(0, STOP_TARGET - stopsCached)
const stopPool = stops.filter((c) => !already.has(c.id))
const step = Math.max(1, Math.floor(stopPool.length / Math.max(1, stopBudget)))
const stopSample = [...stops.filter((c) => already.has(c.id)), ...stopPool.filter((_, i) => i % step === 0).slice(0, stopBudget)]

// Always include the already-cached ids; union with the stratified sample.
const wantIds = new Set<string>([...already, ...lineCands.map((c) => c.id), ...stopSample.map((c) => c.id)])
const toFetch = listWorthy.filter((c) => wantIds.has(c.id) && !already.has(c.id) && /web\.archive\.org/.test(c.url))
console.error(`have ${already.size} cached · selecting ${wantIds.size} (${lineCands.length} line-changes + ${stopSample.length} stops) · fetching ${toFetch.length} new`)

let ok = 0, fail = 0
await pool(toFetch, 5, async (c) => {
  const body = await loadBody(c.id, c.url, bodies)
  if (body) { ok++; console.error(`  ✓ ${c.id} ${c.category.padEnd(11)} ${c.date}  (${body.length}b)`) }
  else { fail++; console.error(`  ✗ ${c.id} ${c.category.padEnd(11)} ${c.date}  no body`) }
})

writeFileSync(OUT, JSON.stringify(bodies, null, 2))
console.error(`\nfetched ${ok} new (${fail} failed) · bodies.json now has ${Object.keys(bodies).length} notices`)
