/**
 * Ping IndexNow with every canonical doseg.hr URL so Bing, Yandex, Seznam, and
 * other participating engines crawl new/changed pages within minutes instead of
 * days. Run after a feed roll or deploy:
 *
 *   bun run indexnow
 *
 * Google does NOT use IndexNow — for Google, the sitemap in Search Console is the
 * discovery channel. The key below is public and must be served verbatim at
 * https://doseg.hr/<KEY>.txt (see public/761c62e2daf49843b64800df4f51c7c5.txt).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

const HOST = "doseg.hr"
const BASE = `https://${HOST}`
const KEY = "761c62e2daf49843b64800df4f51c7c5"

// Static routes, mirrored from app/sitemap.ts.
const STATIC_PATHS = [
  "",
  "/o-projektu",
  "/statistika",
  "/statistika/podaci",
  "/promjene",
  "/linije",
]

interface LineIndex {
  lines: { broj: string }[]
}

function urlList(): string[] {
  const index: LineIndex = JSON.parse(
    readFileSync(join(process.cwd(), "data", "linije", "index.json"), "utf8")
  )
  return [
    ...STATIC_PATHS.map((p) => `${BASE}${p}`),
    ...index.lines.map((l) => `${BASE}/linije/${l.broj}`),
  ]
}

async function main() {
  const urls = urlList()
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: HOST,
      key: KEY,
      keyLocation: `${BASE}/${KEY}.txt`,
      urlList: urls,
    }),
  })
  // IndexNow returns 200 (accepted) or 202 (accepted, validation pending).
  console.log(`IndexNow: ${urls.length} URLs → HTTP ${res.status} ${res.statusText}`)
  if (!res.ok) {
    console.error(await res.text())
    process.exit(1)
  }
}

main()
