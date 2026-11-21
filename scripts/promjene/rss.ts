/**
 * Shared ZET notice primitives: RSS fetch/parse, text stripping, line-number
 * extraction and change-category classification.
 *
 * Moved verbatim out of ingest-announcements.ts so the scripts/proto/*
 * prototypes classify notices with the SAME vocabulary the /promjene page
 * consumes (LIST_CATEGORIES / app/promjene/lib.ts) instead of drifting copies.
 */

const UA = { "User-Agent": "Mozilla/5.0 doseg-promjene" }

/** Classify the change category from text (title preferred, slug fallback). */
export function classify(t: string): string {
  const s = t.toLowerCase()
  if (/ukidanj|ukida|ukinut/u.test(s)) {
    return "ukinuta"
  }
  if (/produljen|produžen|produzen/u.test(s)) {
    return "produljena"
  }
  if (
    /nova linij|nove linij|nova autobusn|uspostavlj|uvodi se|uvode se/u.test(s)
  ) {
    return "nova"
  }
  if (/skrać|skrac/u.test(s)) {
    return "skraćena"
  }
  if (/stajališt|stajalist/u.test(s)) {
    return "stajalište"
  }
  if (/trasu|trase|preusmjer|mijenja tras|izmjena tras|izmijenjen/u.test(s)) {
    return "trasa"
  }
  if (s.includes("vozni red")) {
    return "vozni red"
  }
  return "ostalo"
}

/** Pull line numbers that follow a "linij…" token (so dates like "15. lipnja" or
 * the article id don't leak in). Handles "linijama 275, 277, 279, 282 i 284". */
export function extractLines(text: string): Array<string> {
  const norm = text.replaceAll("-", " ").toLowerCase()
  const out = new Set<string>()
  for (const m of norm.matchAll(/linij\w*\s+([0-9][0-9\s,i]*)/gu)) {
    for (const n of m[1].matchAll(/\d{1,3}[a-d]?/gu)) {
      out.add(n[0])
    }
  }
  return [...out]
}

// Article id, shared across both URL schemes: ".../slug/9564" (listing/wayback)
// and "default.aspx?id=9564" (RSS).
export const idOf = (url: string) => {
  const m = url.match(/[?&]id=(\d+)/u) ?? url.match(/\/(\d+)\/?$/u)
  return m ? m[1] : ""
}

export const strip = (s: string) =>
  s
    .replaceAll(/<[^>]+>/gu, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll(/&[a-z]+;/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim()
const tag = (block: string, t: string) => {
  const m = block.match(
    new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>`, "u")
  )
  return m ? m[1].trim() : ""
}
const RSS_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]
function rssDate(d: string): string | null {
  const m = d.match(/(\d{1,2}) (\w{3}) (\d{4})/u)
  if (!m) {
    return null
  }
  const mo = RSS_MONTHS.indexOf(m[2])
  return mo < 0
    ? null
    : `${m[3]}-${String(mo + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`
}

export async function get(url: string, timeoutMs = 45_000): Promise<string> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await (await fetch(url, { headers: UA, signal: ctrl.signal })).text()
  } finally {
    clearTimeout(t)
  }
}

const TRANSIT =
  /linij|stajališt|stajalist|tramvaj|autobus|tras[aeu]|vozni red|terminal|okretišt/iu
export async function fromRss(
  url: string,
  label: string
): Promise<
  Map<string, { title: string; date: string | null; url: string; body: string }>
> {
  const out = new Map<
    string,
    { title: string; date: string | null; url: string; body: string }
  >()
  try {
    const xml = await get(url)
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gu)) {
      const it = m[1],
        link = strip(tag(it, "link")),
        title = strip(tag(it, "title")),
        body = strip(tag(it, "description"))
      const id = idOf(link)
      if (!id) {
        continue
      }
      // rss_novosti carries non-transit news too
      if (!TRANSIT.test(`${title} ${body}`)) {
        continue
      }
      out.set(id, { title, date: rssDate(tag(it, "pubDate")), url: link, body })
    }
    console.error(`  RSS ${label}: ${out.size} transit items`)
  } catch (error) {
    console.error(
      `  RSS ${label} failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  return out
}
