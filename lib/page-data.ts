import { existsSync, readFileSync } from "node:fs"

/**
 * Read + parse a JSON file, memoized per path in production. SSG renders many
 * pages in one process (154 lines, ~1230 stops, 17 kvartovi); without this the
 * shared index/data files would be re-parsed once per page. Dev always re-reads
 * so regenerated data shows up immediately. Returns null if absent or malformed.
 *
 * The single home for the loader cache that lib/{line,stop,kvart}-data all share.
 */
const cache = new Map<string, unknown>()

export function readJsonCached<T>(path: string): T | null {
  const hit = cache.get(path)
  if (hit !== undefined && process.env.NODE_ENV === "production") return hit as T
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as T
    cache.set(path, parsed)
    return parsed
  } catch {
    return null
  }
}
