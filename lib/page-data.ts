import { existsSync, readFileSync } from "node:fs"

import { parseJson } from "./json"

/**
 * Read + parse a JSON file, memoized per path in production. SSG renders many
 * pages in one process (154 lines, ~1230 stops, 17 kvartovi); without this the
 * shared index/data files would be re-parsed once per page. Dev always re-reads
 * so regenerated data shows up immediately. Returns null if absent or malformed.
 *
 * The single home for the loader cache that lib/{line,stop,kvart}-data all share.
 */
const cache = new Map<string, unknown>()

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- callers name the file's shape; this is the typed JSON boundary for data/
export function readJsonCached<T>(path: string): T | null {
  const hit = cache.get(path)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the cache only holds what the miss path below parsed as T for this path
  if (hit !== undefined && process.env.NODE_ENV === "production") {return hit as T}
  if (!existsSync(path)) {return null}
  try {
    const parsed = parseJson<T>(readFileSync(path, "utf8"))
    cache.set(path, parsed)
    return parsed
  } catch {
    return null
  }
}
