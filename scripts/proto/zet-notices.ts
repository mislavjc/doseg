/**
 * PROTOTYPE — ingest ZET's official service-change notices (RSS) and match them
 * to detected GTFS diffs. Source: https://www.zet.hr/rss_promet.aspx (rolling
 * window of recent notices). Writes data/proto/notices.json and prints how
 * current notices would attach to our diff categories.
 *
 * Fetching/parsing/classification comes from scripts/promjene/rss.ts (the
 * committed ingest pipeline) so the vocabulary matches LIST_CATEGORIES and
 * app/promjene/lib.ts; only the diff-matching experiment is proto-local.
 *
 * Run: bun scripts/proto/zet-notices.ts
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { classify as classifyBase, extractLines, fromRss } from "../promjene/rss"

const RSS = "https://www.zet.hr/rss_promet.aspx"
const root = process.cwd()

/** Pipeline vocabulary plus one proto-only bucket: "obustava" (temporary
 * suspension — kept here to show which notices should NOT attach to a diff). */
function classify(text: string): string {
  const c = classifyBase(text)
  if (c === "ostalo" && /obustav|ne prometuj|ne voz|zatvor/.test(text.toLowerCase())) return "obustava"
  return c
}

const CATEGORY_TO_DIFF: Record<string, string> = {
  "skraćena": "reroute (skraćena)", "produljena": "reroute (produljena)", "trasa": "reroute (preusmjerena)",
  "stajalište": "stop added/moved/removed", "nova": "new line", "ukinuta": "removed line",
  "vozni red": "frequency / schedule", "obustava": "temporary (no feed change)", "ostalo": "—",
}

interface Notice { date: string; title: string; lines: string[]; category: string; body: string; link: string }

async function main() {
  const items = await fromRss(RSS, "promet")
  const notices: Notice[] = [...items.values()].map((it) => ({
    date: it.date ?? "?", title: it.title, link: it.url, body: it.body,
    lines: extractLines(`${it.title} ${it.body}`), category: classify(`${it.title} ${it.body}`),
  }))
  writeFileSync(join(root, "data", "proto", "notices.json"), JSON.stringify(notices, null, 2))

  console.error(`\nparsed ${notices.length} notices from ${RSS}\n`)
  console.error("date".padEnd(18) + "category".padEnd(13) + "lines".padEnd(16) + "title")
  console.error("-".repeat(96))
  for (const n of notices)
    console.error(n.date.padEnd(18) + n.category.padEnd(13) + ("[" + n.lines.join(",") + "]").padEnd(16) + n.title.slice(0, 50))

  // Match against our detected diffs, scored by line + date proximity to the feed roll.
  const diffs = JSON.parse(readFileSync(join(root, "data", "proto", "diffs.json"), "utf8"))
  const rollMs = Date.parse(diffs.newFeed.start + "T00:00:00Z")
  const WINDOW = 21 // days: a notice this close to the feed roll is a strong match
  console.error(`\n— matching against ${diffs.changes.length} detected diffs, feed roll ${diffs.newFeed.start} —`)
  for (const c of diffs.changes) {
    const hits = notices.filter((n) => n.lines.includes(String(c.line)))
      .map((n) => ({ n, days: Math.round((Date.parse(n.date) - rollMs) / 86400000) }))
      .sort((a, b) => Math.abs(a.days) - Math.abs(b.days))
    if (!hits.length) { console.error(`  line ${c.line} (${c.kind}): no current notice (aged out of the rolling feed)`); continue }
    for (const { n, days } of hits) {
      const verdict = Math.abs(days) <= WINDOW ? "✓ STRONG" : "✗ reject (too far from roll)"
      console.error(`  line ${c.line} (${c.kind}): ${verdict}  Δ${days >= 0 ? "+" : ""}${days}d  "${n.title.slice(0, 42)}" [${n.category}]`)
    }
  }

  // What current notices WOULD attach to, if a feed diff existed for their line
  console.error(`\n— current notices that map to a diff category (the enrichment case) —`)
  for (const n of notices.filter((n) => ["skraćena", "produljena", "trasa", "stajalište", "nova", "ukinuta", "vozni red"].includes(n.category)))
    console.error(`  ${("[" + n.lines.join(",") + "]").padEnd(14)} ${(CATEGORY_TO_DIFF[n.category] ?? "?").padEnd(28)} ← "${n.title.slice(0, 46)}"`)

  console.error(`\nwrote data/proto/notices.json`)
}
main()
