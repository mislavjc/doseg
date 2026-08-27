/**
 * Shared ZET notice primitives: RSS fetch/parse, text stripping, line-number
 * extraction and change-category classification.
 *
 * Moved verbatim out of ingest-announcements.ts so the scripts/proto/*
 * prototypes classify notices with the SAME vocabulary the /promjene page
 * consumes (LIST_CATEGORIES / app/promjene/lib.ts) instead of drifting copies.
 */

export const UA = { "User-Agent": "Mozilla/5.0 doseg-promjene" }

/** Classify the change category from text (title preferred, slug fallback). */
export function classify(t: string): string {
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

/** Pull line numbers that follow a "linij…" token (so dates like "15. lipnja" or
 * the article id don't leak in). Handles "linijama 275, 277, 279, 282 i 284". */
export function extractLines(text: string): string[] {
  const norm = text.replace(/-/g, " ").toLowerCase()
  const out = new Set<string>()
  for (const m of norm.matchAll(/linij\w*\s+([0-9][0-9\s,i]*)/g)) {
    for (const n of m[1].matchAll(/\d{1,3}[a-d]?/g)) out.add(n[0])
  }
  return [...out]
}

// Article id, shared across both URL schemes: ".../slug/9564" (listing/wayback)
// and "default.aspx?id=9564" (RSS).
export const idOf = (url: string) => { const m = url.match(/[?&]id=(\d+)/) ?? url.match(/\/(\d+)\/?$/); return m ? m[1] : "" }

export const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim()
export const tag = (block: string, t: string) => { const m = block.match(new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>`)); return m ? m[1].trim() : "" }
const RSS_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
export function rssDate(d: string): string | null { const m = d.match(/(\d{1,2}) (\w{3}) (\d{4})/); if (!m) return null; const mo = RSS_MONTHS.indexOf(m[2]); return mo < 0 ? null : `${m[3]}-${String(mo + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}` }

export async function get(url: string, timeoutMs = 45000): Promise<string> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try { return await (await fetch(url, { headers: UA, signal: ctrl.signal })).text() } finally { clearTimeout(t) }
}

const TRANSIT = /linij|stajališt|stajalist|tramvaj|autobus|tras[aeu]|vozni red|terminal|okretišt/i
export async function fromRss(url: string, label: string): Promise<Map<string, { title: string; date: string | null; url: string; body: string }>> {
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
