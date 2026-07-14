import { jsonResponse } from "@/lib/api-response"
import { loadLineIndex } from "@/lib/line-data"
import { loadStopIndex } from "@/lib/stop-data"

/**
 * Compact line + stop index for the homepage search box. Lazy-fetched by
 * components/home-search.tsx on first focus so the directory of 1200+ stop
 * names never rides along in the initial page payload. Static (fs-only), so
 * it prerenders with the build and rolls with the GTFS data.
 */

export interface SearchIndexPayload {
  lines: { broj: string; terminals: string[] }[]
  stops: { slug: string; name: string; kvart: string | null }[]
}

export async function GET(request: Request) {
  // ~105 stops share a name (opposite platforms, "-2" slugs); in a search
  // list they read as duplicates, so keep one per name+kvart — the first,
  // whose slug is the primary (unsuffixed) page.
  const seen = new Set<string>()
  const stops: SearchIndexPayload["stops"] = []
  for (const s of loadStopIndex().stops) {
    const key = `${s.name}|${s.kvart}`
    if (seen.has(key)) continue
    seen.add(key)
    stops.push({ slug: s.slug, name: s.name, kvart: s.kvart })
  }

  const payload: SearchIndexPayload = {
    lines: loadLineIndex().lines.map((l) => ({
      broj: l.broj,
      terminals: l.terminals,
    })),
    stops,
  }
  return jsonResponse(
    payload,
    request,
    "public, max-age=3600, stale-while-revalidate=86400"
  ).response
}
