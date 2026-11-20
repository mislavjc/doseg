/** Generate the eval gold set: run the strong baseline (gpt-5.5) over the cached
 * notice bodies, write gold.json. Spot-verify against the bodies before trusting it.
 * Run: bun scripts/promjene/eval/gen-gold.ts */
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { readJson } from "../../lib/json"
import { extractNotice, loadEnvLocal } from '../extract';
import type { Notice } from '../extract';

loadEnvLocal()

const bodies = readJson<Record<string, string>>("/tmp/zet-bodies.json")
const { candidates: cands } = readJson<{ candidates: Array<{ id: string; date: string | null }> }>("data/promjene/candidates.json")
const pub = (id: string) => cands.find((c) => c.id === id)?.date ?? undefined
const gold: Record<string, Notice> = {}
for (const id of Object.keys(bodies)) {
  // oxlint-disable-next-line no-await-in-loop -- one model call at a time, in id order, to stay under the gateway rate limit and keep the log readable
  const g = await extractNotice("openai/gpt-5.5", bodies[id], pub(id))
  gold[id] = g
  console.error(`${id}  ${g.permanence.padEnd(9)} ${g.category.padEnd(11)} "${g.cleanTitle.slice(0, 56)}"`)
}
writeFileSync(join(process.cwd(), "scripts/promjene/eval/gold.json"), JSON.stringify(gold, null, 2))
console.error(`\nwrote gold.json (${Object.keys(gold).length} items) — VERIFY a few against the bodies before trusting.`)
