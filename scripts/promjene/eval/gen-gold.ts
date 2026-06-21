/** Generate the eval gold set: run the strong baseline (gpt-5.5) over the cached
 * notice bodies, write gold.json. Spot-verify against the bodies before trusting it.
 * Run: bun scripts/promjene/eval/gen-gold.ts */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { extractNotice } from "../extract"

try { for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2] } } catch { /* ignore */ }

const bodies: Record<string, string> = JSON.parse(readFileSync("/tmp/zet-bodies.json", "utf8"))
const cands: { id: string; date: string | null }[] = JSON.parse(readFileSync("data/promjene/candidates.json", "utf8")).candidates
const pub = (id: string) => cands.find((c) => c.id === id)?.date ?? undefined
const gold: Record<string, unknown> = {}
for (const id of Object.keys(bodies)) {
  gold[id] = await extractNotice("openai/gpt-5.5", bodies[id], pub(id))
  const g = gold[id] as { permanence: string; category: string; cleanTitle: string }
  console.error(`${id}  ${g.permanence.padEnd(9)} ${g.category.padEnd(11)} "${g.cleanTitle.slice(0, 56)}"`)
}
writeFileSync(join(process.cwd(), "scripts/promjene/eval/gold.json"), JSON.stringify(gold, null, 2))
console.error(`\nwrote gold.json (${Object.keys(gold).length} items) — VERIFY a few against the bodies before trusting.`)
