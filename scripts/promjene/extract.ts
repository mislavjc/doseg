/** Shared notice-extraction logic: turn a ZET notice (archived HTML body) into a
 * faithful structured record via an LLM through the Vercel AI Gateway. Used by the
 * production ingest, the eval harness, and the evalite suite — one source of truth. */
import { readFileSync } from "node:fs"
import { generateObject } from "ai"
import { z } from "zod"

export const noticeSchema = z.object({
  permanence: z.enum(["permanent", "temporary"]).describe("temporary = roadworks/event/closure/seasonal/one-off ('zbog radova','do završetka radova','privremen','prometuje skraćeno','tijekom', događanje); permanent = a lasting network change"),
  category: z.enum(["nova", "ukinuta", "produljena", "skraćena", "trasa", "stajalište", "vozni red", "ostalo"]).describe("the dominant PERMANENT change type"),
  lines: z.array(z.object({ number: z.string(), role: z.enum(["new", "extended", "shortened", "rerouted", "schedule-only", "removed", "unchanged"]) })).describe("each line the notice names + what specifically happened to IT"),
  effectiveDate: z.string().nullable().describe("ISO yyyy-mm-dd the change takes effect, parsed from the body text; null if not stated"),
  cleanTitle: z.string().describe("ONE concise honest Croatian sentence stating only what the notice supports; never invent destinations, reasons, or which line is new"),
})
export type Notice = z.infer<typeof noticeSchema>

export const extractPrompt = (text: string, publishedHint?: string) =>
  `Čitaš službenu ZET-ovu obavijest o izmjeni u prometu. Izvuci SAMO ono što tekst doslovno tvrdi — nikad ne izmišljaj. Ako je promjena privremena (radovi, događanje, zatvaranje, privremena linija, "do završetka radova", "prometuje skraćeno"), označi permanence: temporary.` +
  (publishedHint ? `\nObavijest je objavljena oko ${publishedHint}. effectiveDate je datum POČETKA promjene (npr. "od ponedjeljka, 16. veljače"); vrati ga u ISO formatu yyyy-mm-dd, a godinu odredi prema datumu objave (obavijest izlazi neposredno prije početka).` : "") +
  `\n\n${text}`

/** Extract the article text (og:description + the news-text div) from an archived
 * ZET notice page — the LLM input. */
export function bodyFromHtml(html: string): string {
  const og = html.match(/og:description"\s+content="([^"]*)"/i)?.[1]?.trim() ?? ""
  const i = html.indexOf('class="news-text"')
  const start = i >= 0 ? html.indexOf(">", i) + 1 : 0 // skip the opening tag itself, not just the attribute
  const body = i >= 0 ? html.slice(start, start + 4000).replace(/<img[\s\S]*$/i, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim() : ""
  return [og && `Sažetak: ${og}`, body && `Tekst: ${body}`].filter(Boolean).join("\n")
}

/** The category is a rollup of what happened to the lines, so derive it from the
 * (more reliable) per-line roles instead of trusting the model's separate guess —
 * an extension is also a reroute, which is where model/gold disagree. Stop notices
 * (model said stajalište, no line role implies a category) keep their category. */
export function categoryFromRoles(lines: { role: string }[], fallback: string): string {
  const r = new Set(lines.map((l) => l.role))
  if (r.has("new")) return "nova"
  if (r.has("removed")) return "ukinuta"
  if (r.has("extended")) return "produljena"
  if (r.has("shortened")) return "skraćena"
  if (r.has("rerouted")) return "trasa"
  if (r.has("schedule-only")) return "vozni red"
  return fallback
}

export async function extractNotice(model: string, body: string, publishedHint?: string): Promise<Notice> {
  const { object } = await generateObject({ model, schema: noticeSchema, prompt: extractPrompt(body, publishedHint) })
  if (object.category !== "stajalište") object.category = categoryFromRoles(object.lines, object.category) as Notice["category"]
  return object
}

// ───────── pipeline plumbing, shared by the ingest + eval scripts ─────────
const UA = { "User-Agent": "Mozilla/5.0 doseg-promjene" }

/** Load .env.local into process.env (scripts + vitest don't auto-load it). */
export function loadEnvLocal(): void {
  try { for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2] } } catch { /* no .env.local */ }
}

/** GET text with an abort timeout. */
export async function get(url: string, timeoutMs = 45000): Promise<string> {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try { return await (await fetch(url, { headers: UA, signal: ctrl.signal })).text() } finally { clearTimeout(t) }
}

/** True when bodyFromHtml produced real article text, not an empty shell (older
 * notice URLs now 302 → homepage, which yields a sub-threshold body). */
export const isRealBody = (b: string) => b.replace(/Sažetak:|Tekst:/g, "").trim().length > 40

/** Fetch + extract + validate one archived notice body, caching it into `bodies[id]`.
 * Returns the body, or null if unrecoverable after 3 attempts with backoff. */
export async function loadBody(id: string, url: string, bodies: Record<string, string>): Promise<string | null> {
  if (bodies[id]) return bodies[id]
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const body = bodyFromHtml(await get(url))
      if (isRealBody(body)) { bodies[id] = body; return body }
      return null
    } catch { if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 3000)) }
  }
  return null
}

/** Run `fn` over items with at most `n` in flight. */
export async function pool<T>(items: T[], n: number, fn: (t: T, i: number) => Promise<void>): Promise<void> {
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k) } }))
}
