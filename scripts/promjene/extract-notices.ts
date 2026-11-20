/**
 * /promjene LLM ingest — the trust layer.
 *
 * ingest-announcements.ts discovers notices and guesses permanence/category from the
 * URL slug, which is unreliable: it lists temporary roadworks/event diversions as
 * permanent network changes. This reads each list-worthy notice's ARCHIVED ARTICLE BODY
 * and classifies it with an LLM (gemini-3-flash via the Vercel AI Gateway), validated on
 * a 52-item hand-verified gold set at 100% permanence (see scripts/promjene/eval/README.md).
 *
 * For each list-worthy candidate it overwrites permanence/category/lines/effectiveDate/
 * displayTitle from the body, recomputes listWorthy (permanent network changes only), and
 * flags any model-permanent notice that still carries a bounded "do …" end-marker for
 * human review (a deterministic backstop on the one decision that matters).
 *
 * Bodies cache: data/promjene/notice-bodies.json (committed, reproducible), seeded from
 * the eval body cache. Run after ingest-announcements.ts:
 *   bun scripts/promjene/extract-notices.ts          # all list-worthy
 *   bun scripts/promjene/extract-notices.ts 9881 9894 # specific ids (e.g. verify curated)
 */
import { writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { mapConcurrent } from "../lib/concurrency"
import { readJson } from "../lib/json"
import { extractNotice, loadBody, loadEnvLocal } from './extract';
import type { Notice } from './extract';
import { autoHeadline, isTram } from "../../app/promjene/lib"

/** Page title for a classified notice. Stop notices use the model's faithful sentence.
 * Line changes use the terse autoHeadline, except: a re-established line is not "new",
 * and a partial/conditional change ("u pojedinim polascima", weekend-only, one-direction)
 * would be overclaimed by the terse form — there, keep the model's exact wording. */
function displayTitleFor(n: Notice, lines: Array<string>): string {
  if (n.category === "stajalište") {return n.cleanTitle}
  if (n.category === "nova" && /ponovno/iu.test(n.cleanTitle)) {return `Ponovno uvedena ${isTram(lines[0]) ? "tramvajska" : "autobusna"} linija ${lines.join(", ")}.`}
  if (/u pojedinim polascima|djelomično|djelomicno|vikendom|praznikom|samo u smjeru/iu.test(n.cleanTitle)) {return n.cleanTitle}
  return autoHeadline(lines, n.category)
}

loadEnvLocal()

const DATA = join(process.cwd(), "data/promjene/candidates.json")
const BODIES = join(process.cwd(), "data/promjene/notice-bodies.json")
const SEED = join(process.cwd(), "scripts/promjene/eval/bodies.json")
const MODEL = "google/gemini-3-flash"

const LIST_CATS = new Set(["nova", "ukinuta", "produljena", "skraćena", "trasa", "stajalište"])
const CHANGE_ROLES = new Set(["new", "extended", "shortened", "rerouted", "removed"])
// A permanent change has a start but no END. A bounded "do <završetka radova | date |
// weekday>" is the signature of a temporary diversion — if the model still calls such a
// notice permanent, that conflict is held back from the list for a human to check.
const END_MARKER = /\bdo\s+(zavr[šs]etka|dovr[šs]etka|ponovne|kraja|okon[čc]anja)\b|\bdo\s+\d{1,2}\.\s*(sije[čc]nj|velja[čc]|o[žz]uj|trav|svib|lip|srp|kolovoz|ruj|listopad|studen|prosin)|\bdo\s+(petka|subote|nedjelje|ponedjeljka|utorka|srijede|[čc]etvrtka)\b/iu

interface Cand { id: string; url: string; title: string; date: string | null; source: string; lines: Array<string>; category: string; permanence: string; listWorthy: boolean; illustratable?: boolean; displayTitle?: string; datePrecise?: boolean; review?: boolean; classifiedBy?: string; extracted?: Notice }

async function main() {
  const args = process.argv.slice(2)
  // also classify the slug-EXCLUDED notices, to surface false-negatives
  const sweep = args.includes("--sweep")
  const only = new Set(args.filter((a) => !a.startsWith("--")))
  const doc = readJson<{ candidates: Array<Cand>; counts?: Record<string, number> }>(DATA)
  const cands = doc.candidates
  const bodies = existsSync(BODIES) ? readJson<Record<string, string>>(BODIES) : {}
  if (existsSync(SEED)) {for (const [k, v] of Object.entries(readJson<Record<string, string>>(SEED))) {bodies[k] ??= v}}

  const targets = cands.filter((c) =>
    only.size > 0 ? only.has(c.id)
      : sweep ? (!c.classifiedBy && c.url.includes('web.archive.org'))
        : c.listWorthy)
  console.error(`classifying ${targets.length} notices with ${MODEL}…`)
  let done = 0, noBody = 0, perm = 0, temp = 0, flagged = 0
  const drops: Array<string> = [], reviews: Array<string> = []

  await mapConcurrent(targets, 10, async (c) => {
    const body = await loadBody(c.id, c.url, bodies)
    // can't verify → hold for review
    if (!body) { noBody++; c.review = true; return }
    let n: Notice
    try { n = await extractNotice(MODEL, body, c.date ?? undefined) } catch { noBody++; c.review = true; return }

    const changed = n.lines.filter((l) => CHANGE_ROLES.has(l.role)).map((l) => l.number)
    const lineNums = n.lines.map((l) => l.number)
    c.permanence = n.permanence
    c.category = n.category
    c.lines = n.category === "stajalište" ? lineNums : (changed.length > 0 ? changed : lineNums)
    c.displayTitle = displayTitleFor(n, c.lines)
    c.classifiedBy = MODEL
    c.extracted = n
    if (n.effectiveDate && /^\d{4}-\d{2}-\d{2}$/u.test(n.effectiveDate)) { c.date = n.effectiveDate; c.datePrecise = true } else { c.datePrecise = false }

    const conflict = n.permanence === "permanent" && END_MARKER.test(body)
    c.review = conflict
    c.listWorthy = n.permanence === "permanent" && LIST_CATS.has(n.category) && (n.category === "stajalište" || c.lines.length <= 7) && !conflict

    if (n.permanence === "permanent") {perm++;} else { temp++; if (only.size === 0 && !sweep) {drops.push(`${c.id} ${c.category} "${(c.displayTitle ?? c.title).slice(0, 48)}"`)} }
    if (conflict) { flagged++; reviews.push(`${c.id} ${c.category} "${n.cleanTitle.slice(0, 56)}"`) }
    if (++done % 20 === 0) {console.error(`  …${done}/${targets.length}`)}
  })

  const lw = cands.filter((c) => c.listWorthy)
  if (doc.counts) { doc.counts.listWorthy = lw.length }
  writeFileSync(BODIES, JSON.stringify(bodies, null, 2))
  writeFileSync(DATA, JSON.stringify(doc, null, 2))

  const stop = lw.filter((c) => c.category === "stajalište").length
  console.error(`\nclassified ${done} · ${perm} permanent / ${temp} temporary · ${noBody} no-body(held) · ${flagged} review-flagged`)
  console.error(`listWorthy now ${lw.length} (line ${lw.length - stop}, stop ${stop})`)
  if (reviews.length > 0) { console.error(`\nREVIEW (model=permanent but has a bounded end-marker — verify by hand):`); for (const r of reviews) {console.error(`  ${r}`)} }
  if (sweep) {
    const surfaced = targets.filter((c) => c.listWorthy)
    console.error(`\nSURFACED ${surfaced.length} false-negatives (slug excluded them, but they're permanent network changes — AUDIT):`)
    for (const c of surfaced.toSorted((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))) {console.error(`  ${c.id}  ${c.date}  ${c.category.padEnd(11)} "${c.displayTitle}"`)}
  } else if (drops.length > 0) { console.error(`\nDROPPED as temporary (${drops.length}):`); for (const d of drops.slice(0, 60)) {console.error(`  ${d}`)} }
}
await main()
