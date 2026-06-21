/**
 * /promjene announcement ingest — the backfill spine.
 *
 * ZET's official notices are the source of truth for what permanently changed.
 * This pulls them from three places and merges into one candidate worklist:
 *   1. RSS (rss_promet.aspx)        — recent, with precise pubDate + body text.
 *   2. Live listing (paginated)     — the current ~2 pages, title + url.
 *   3. Wayback CDX index            — EVERY historical izmjene-u-prometu article
 *                                     URL back to 2017 (slug encodes lines + type
 *                                     + reason; first-seen timestamp ≈ the date).
 *
 * It does NOT decide truth — it classifies each notice (lines, type, permanence)
 * and flags the permanent-looking ones for a human to verify and promote into
 * data/promjene/entries.json (which then gets a before/after map via build-geometry).
 *
 * Output: data/promjene/candidates.json. Run: bun scripts/promjene/ingest-announcements.ts
 */
import { writeFileSync, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const UA = { "User-Agent": "Mozilla/5.0 doseg-promjene" }
const EARLIEST_FEED = "2025-04-07" // before this we lack a shapes-bearing GTFS feed to illustrate from

// Reasons a change is TEMPORARY (roadworks, races, events, one-off/partial diversions).
// NOTE: run against a SPACE-normalized basis (hyphens→spaces) so slug + title match
// the same patterns. Day names are temporary only after "u " ("u ponedjeljak" = this
// Monday) — NOT after "od " ("od ponedjeljka" = a permanent change's effective date).
const TEMP = /radov|asfaltir|utrk|maraton|advent|obustav|privremen|izvanredn|zatvor|regulacij|posebn|\bhod\b|procesij|koncert|vatromet|obilazno|\bzbog\b|sajam|fašnik|fasnik|doček|docek|blagdan|prvomaj|\bsvet|izlet|snij|vremen|\bkvar\b|prosvjed|derbi|utakmic|\brun\b|cestovn|zabav|festival|polumaraton|biciklijad|hodočašć|hodocasc|skije|skijaš|zaobilaz|tijekom vikenda|u večernjim|u vecernjim|u jutarnjim|u zadnjim|u posljednjim|u ranim jutarnjim|\bu (ponedjeljak|utorak|srijedu|četvrtak|cetvrtak|petak|subotu|nedjelju)\b|ljetni vozni red|zimski vozni red|ljetni raspored|sezonsk|prometuje skraćen|prometuje skracen|vozi skraćen|vozi skracen|od \d+ sati/
// Strong signals a change is PERMANENT (network redesign, not an event diversion).
const PERM = /ukidanj|ukida|ukinut|produljen|produžen|produzen|nova linij|nove linij|nova autobusn|uspostavlj|uvodi se|uvode se|novi vozni red|trajno|preimenovan|preimenuje/

// Categories that represent a real network change (not pure schedule or grab-bag).
const LIST_CATEGORIES = new Set(["nova", "ukinuta", "produljena", "skraćena", "trasa", "stajalište"])

/** Classify the change category from text (title preferred, slug fallback). */
function classify(t: string): string {
  const s = t.toLowerCase()
  if (/ukidanj|ukida|ukinut/.test(s)) return "ukinuta"
  if (/produljen|produžen|produzen/.test(s)) return "produljena"
  if (/nova linij|nove linij|nova autobusn|uspostavlj|uvodi se|uvode se/.test(s)) return "nova"
  if (/skrać|skrac/.test(s)) return "skraćena"
  if (/stajališt|stajalist/.test(s)) return "stajalište"
  if (/trasu|trase|preusmjer|mijenja tras|izmjena tras|izmijenjen/.test(s)) return "trasa"
  if (/vozni red/.test(s)) return "vozni red"
  return "ostalo"
}

/** Permanence verdict: permanent (strong perm + no temp), temporary, or review. */
function permanence(t: string): "permanent" | "temporary" | "review" {
  const hasTemp = TEMP.test(t), hasPerm = PERM.test(t)
  if (hasPerm && !hasTemp) return "permanent"
  if (hasTemp) return "temporary"
  return "review" // ambiguous (e.g. a bare "linija X mijenja trasu") — needs a human
}

/** Pull line numbers that follow a "linij…" token (so dates like "15. lipnja" or
 * the article id don't leak in). Handles "linijama 275, 277, 279, 282 i 284". */
function extractLines(text: string): string[] {
  const norm = text.replace(/-/g, " ").toLowerCase()
  const out = new Set<string>()
  for (const m of norm.matchAll(/linij\w*\s+([0-9][0-9\s,i]*)/g)) {
    for (const n of m[1].matchAll(/\d{1,3}[a-d]?/g)) out.add(n[0])
  }
  return [...out]
}

const slugOf = (url: string) => { const m = url.match(/izmjene-u-prometu\/([a-z0-9-]+)\/\d+/i); return m ? m[1] : "" }
// Article id, shared across both URL schemes: ".../slug/9564" (listing/wayback)
// and "default.aspx?id=9564" (RSS).
const idOf = (url: string) => { const m = url.match(/[?&]id=(\d+)/) ?? url.match(/\/(\d+)\/?$/); return m ? m[1] : "" }
const titleFromSlug = (slug: string) => slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())

interface Cand { id: string; url: string; title: string; date: string | null; source: string; lines: string[]; category: string; permanence: string; listWorthy: boolean; illustratable: boolean }

const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim()
const tag = (block: string, t: string) => { const m = block.match(new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>`)); return m ? m[1].trim() : "" }
const RSS_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
function rssDate(d: string): string | null { const m = d.match(/(\d{1,2}) (\w{3}) (\d{4})/); if (!m) return null; const mo = RSS_MONTHS.indexOf(m[2]); return mo < 0 ? null : `${m[3]}-${String(mo + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}` }
const tsDate = (ts: string) => `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`

async function get(url: string, timeoutMs = 45000): Promise<string> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try { return await (await fetch(url, { headers: UA, signal: ctrl.signal })).text() } finally { clearTimeout(t) }
}

const TRANSIT = /linij|stajališt|stajalist|tramvaj|autobus|tras[aeu]|vozni red|terminal|okretišt/i
async function fromRss(url: string, label: string): Promise<Map<string, { title: string; date: string | null; url: string; body: string }>> {
  const out = new Map<string, { title: string; date: string | null; url: string; body: string }>()
  try {
    const xml = await get(url)
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const it = m[1], link = strip(tag(it, "link")), title = strip(tag(it, "title")), body = strip(tag(it, "description"))
      const id = idOf(link); if (!id) continue
      if (!TRANSIT.test(`${title} ${body}`)) continue // rss_novosti carries non-transit news too
      out.set(id, { title, date: rssDate(tag(it, "pubDate")), url: link, body })
    }
    console.error(`  RSS ${label}: ${out.size} transit items`)
  } catch (e) { console.error(`  RSS ${label} failed: ${(e as Error).message}`) }
  return out
}

async function fromLiveListing(): Promise<Map<string, { title: string; url: string }>> {
  const out = new Map<string, { title: string; url: string }>()
  for (let page = 1; page <= 6; page++) {
    let html: string
    try { html = await get(`https://www.zet.hr/aktualnosti/izmjene-u-prometu/31?page=${page}`) } catch { break }
    const links = [...html.matchAll(/<a[^>]+href="(\/aktualnosti\/izmjene-u-prometu\/[a-z0-9-]+\/\d+)"[^>]*>([^<]+)<\/a>/gi)]
    const fresh = links.filter(([, href]) => !out.has(idOf(href)))
    for (const [, href, title] of links) { const id = idOf(href); if (id) out.set(id, { title: strip(title), url: `https://www.zet.hr${href}` }) }
    if (!fresh.length) break // no new articles → past the last page
  }
  console.error(`  live listing: ${out.size} articles`)
  return out
}

async function fromWayback(): Promise<Map<string, { url: string; ts: string }>> {
  const out = new Map<string, { url: string; ts: string }>()
  const URL = "https://web.archive.org/cdx/search/cdx?url=zet.hr/aktualnosti/izmjene-u-prometu*&output=text&fl=timestamp,original&collapse=urlkey&filter=statuscode:200"
  // The big CDX query is heavy and intermittently 503s — retry with backoff so a
  // transient failure doesn't silently drop years of history.
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const txt = await get(URL, 120000)
      for (const line of txt.split("\n")) {
        const [ts, original] = line.split(" ")
        if (!ts || !original) continue
        const id = idOf(original); if (!id || !slugOf(original)) continue
        const prev = out.get(id)
        if (!prev || ts < prev.ts) out.set(id, { url: original.replace(/^http:/, "https:").replace(":80", ""), ts }) // earliest snapshot ≈ publish date
      }
      if (out.size > 50) break // got the full set
      console.error(`  wayback CDX attempt ${attempt}: only ${out.size} — retrying`)
    } catch (e) { console.error(`  wayback CDX attempt ${attempt} failed: ${(e as Error).message}`) }
    await new Promise((r) => setTimeout(r, attempt * 4000))
  }
  console.error(`  wayback CDX: ${out.size} unique articles`)
  return out
}

async function main() {
  console.error("ingesting ZET izmjene-u-prometu notices…")
  const [rssP, rssN, live, wb] = await Promise.all([
    fromRss("https://www.zet.hr/rss_promet.aspx", "promet"),
    fromRss("https://www.zet.hr/rss_novosti.aspx", "novosti"),
    fromLiveListing(),
    fromWayback(),
  ])

  // Merge by article id. Title precedence: RSS > live listing > slug-derived.
  // Date precedence: RSS pubDate > wayback first-seen.
  const ids = new Set<string>([...rssP.keys(), ...rssN.keys(), ...live.keys(), ...wb.keys()])
  const cands: Cand[] = []
  for (const id of ids) {
    const r = rssP.get(id) ?? rssN.get(id)
    const l = live.get(id)
    const w = wb.get(id)
    const canonical = r?.url ?? l?.url ?? w?.url ?? ""
    const slug = slugOf(canonical)
    // Best WORKING source link: recent articles (in RSS / the live listing) still
    // resolve 200, but older canonical article URLs now 302 → homepage. For those
    // (wayback-only) link to the archived snapshot, which renders the real notice.
    const url = (r || l) ? canonical : w ? `https://web.archive.org/web/${w.ts}/${canonical}` : canonical
    const title = r?.title || l?.title || (slug ? titleFromSlug(slug) : "")
    const date = r?.date ?? (w ? tsDate(w.ts) : null)
    // space-normalized so slug ("u-ponedjeljak") and title ("U Ponedjeljak") match the same patterns
    const basis = `${title} ${slug} ${r?.body ?? ""}`.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ")
    const category = classify(basis)
    const perm = permanence(basis)
    cands.push({
      id, url, title, date,
      source: r ? "rss" : l ? "live" : "wayback",
      lines: extractLines(basis), category, permanence: perm,
      // a real, specific network change: not temporary, a change category, and not a
      // system-wide schedule (those name dozens of lines — a real change names a few)
      listWorthy: perm !== "temporary" && LIST_CATEGORIES.has(category) && extractLines(basis).length <= 7,
      illustratable: !!date && date >= EARLIEST_FEED,
    })
  }

  // newest first; undated (rare) sink to the bottom
  cands.sort((a, b) => (b.date ?? "0").localeCompare(a.date ?? "0"))

  const permanent = cands.filter((c) => c.permanence === "permanent")
  const review = cands.filter((c) => c.permanence === "review")
  const listWorthy = cands.filter((c) => c.listWorthy)
  const out = {
    _doc: "Candidate ZET notices for /promjene. 'listWorthy' = a real network change (new/removed/rerouted/extended line, stop change) that's not temporary — these render in the /promjene timeline as rows; the verified subset in entries.json gets a before/after map. 'permanence: review' = ambiguous. 'illustratable' = a shapes-bearing feed brackets the date.",
    generatedFrom: { sources: ["rss_promet", "rss_novosti", "live-listing", "wayback-cdx"], earliestFeed: EARLIEST_FEED },
    counts: { total: cands.length, listWorthy: listWorthy.length, permanent: permanent.length, review: review.length, temporary: cands.length - permanent.length - review.length },
    candidates: cands,
  }
  // Guard: the Wayback CDX provides the bulk of history. If it came back empty
  // (rate-limited 503), don't clobber a good existing candidates.json with the
  // recent-only RSS/live subset.
  const outPath = join(process.cwd(), "data", "promjene", "candidates.json")
  if (wb.size === 0 && existsSync(outPath)) {
    const prev = JSON.parse(readFileSync(outPath, "utf8")).candidates?.length ?? 0
    if (prev > cands.length) { console.error(`\nABORT: wayback empty and existing file has ${prev} > ${cands.length} candidates — keeping it. Retry later.`); return }
  }
  writeFileSync(outPath, JSON.stringify(out, null, 2))

  console.error(`\n${cands.length} notices · ${listWorthy.length} list-worthy · ${permanent.length} permanent · ${review.length} review · ${out.counts.temporary} temporary`)
  console.error(`\nLIST-WORTHY by category: ${JSON.stringify(Object.fromEntries(["nova", "ukinuta", "produljena", "skraćena", "trasa", "stajalište"].map((k) => [k, listWorthy.filter((c) => c.category === k).length])))}`)
  console.error(`\nLIST-WORTHY candidates (newest first, first 36):`)
  for (const c of listWorthy.slice(0, 36))
    console.error(`  ${(c.date ?? "????-??-??")}  ${c.illustratable ? "▮" : "·"} ${c.category.padEnd(11)} [${c.lines.join(",") || "—"}]  ${c.title.slice(0, 54)}`)
  console.error(`\nwrote data/promjene/candidates.json  (▮ = illustratable from current feeds)`)
}
main()
