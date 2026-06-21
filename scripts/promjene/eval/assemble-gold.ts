/** Assemble the verified gold set from the agent-panel part-files.
 *
 * The promjene-gold workflow wrote one reconciled record per notice to
 * scripts/promjene/eval/gold-parts/<id>.json (the adjudicator's body-grounded verdict
 * plus permanenceEvidence / disagreements / needsReview). This:
 *   - mirrors the pipeline's category derivation (categoryFromRoles, except stajalište)
 *     so the eval's category scorer compares like-for-like,
 *   - writes gold.json  — the clean noticeSchema record per id (what the eval scores against),
 *   - writes gold-review.json — the same plus evidence/disagreements/needsReview for audit.
 *
 * Run: bun scripts/promjene/eval/assemble-gold.ts
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { categoryFromRoles } from "../extract"

const DIR = join(process.cwd(), "scripts/promjene/eval")
const PARTS = join(DIR, "gold-parts")

const gold: Record<string, unknown> = {}
const reviewOut: Record<string, unknown> = {}
const flagged: { id: string; permanence: string; category: string; disagreements: string[]; evidence: string }[] = []

const ids = readdirSync(PARTS).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort((a, b) => +a - +b)
for (const id of ids) {
  const r = JSON.parse(readFileSync(join(PARTS, id + ".json"), "utf8"))
  // mirror extractNotice: category is a rollup of the line roles (stop notices keep theirs)
  const category = r.category === "stajalište" ? "stajalište" : categoryFromRoles(r.lines, r.category)
  gold[id] = { permanence: r.permanence, category, lines: r.lines, effectiveDate: r.effectiveDate ?? null, cleanTitle: r.cleanTitle }
  reviewOut[id] = { ...(gold[id] as object), permanenceEvidence: r.permanenceEvidence, disagreements: r.disagreements ?? [], needsReview: !!r.needsReview }
  if (r.needsReview) flagged.push({ id, permanence: r.permanence, category, disagreements: r.disagreements ?? [], evidence: r.permanenceEvidence })
}

writeFileSync(join(DIR, "gold.json"), JSON.stringify(gold, null, 2))
writeFileSync(join(DIR, "gold-review.json"), JSON.stringify(reviewOut, null, 2))

const all = Object.values(gold) as { permanence: string; category: string }[]
const perm = all.filter((g) => g.permanence === "permanent").length
const byCat = all.reduce<Record<string, number>>((a, g) => ((a[g.category] = (a[g.category] ?? 0) + 1), a), {})
console.error(`gold: ${ids.length} notices · ${perm} permanent / ${all.length - perm} temporary`)
console.error(`by category: ${JSON.stringify(byCat)}`)
console.error(`\n${flagged.length} flagged needsReview (adjudicate these by hand):`)
for (const f of flagged) console.error(`  ${f.id}  ${f.permanence.padEnd(9)} ${f.category.padEnd(11)} [${f.disagreements.join(",")}]  "${f.evidence.slice(0, 70)}"`)
