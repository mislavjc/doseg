import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { getDataDir } from "@/lib/data-dir"
import type { LinePageData } from "@/lib/generated/LinePageData"
import type { LinePagesIndex } from "@/lib/generated/LinePagesIndex"

/**
 * Loaders for the committed per-line page data under data/linije/, generated
 * by the transit crate: `cargo run --release --bin transit-scorer -- --line-pages`.
 */

function linijeDir(): string {
  return join(getDataDir(), "linije")
}

/**
 * Read + parse a JSON file, caching in production (SSG renders each of the
 * 154 pages in the same process; the index alone would otherwise be parsed
 * 154 times). Dev always re-reads so regenerated data shows up immediately.
 */
const jsonCache = new Map<string, unknown>()

function readJson<T>(path: string): T | null {
  const cached = jsonCache.get(path)
  if (cached !== undefined && process.env.NODE_ENV === "production") {
    return cached as T
  }
  if (!existsSync(path)) return null
  const parsed = JSON.parse(readFileSync(path, "utf-8")) as T
  jsonCache.set(path, parsed)
  return parsed
}

export function loadLineIndex(): LinePagesIndex {
  const index = readJson<LinePagesIndex>(join(linijeDir(), "index.json"))
  if (!index) throw new Error("data/linije/index.json missing — run the line-pages generator")
  return index
}

export function loadLineData(broj: string): LinePageData | null {
  // broj comes from the URL — keep it from escaping the data directory.
  if (!/^[0-9]{1,3}$/.test(broj)) return null
  return readJson<LinePageData>(join(linijeDir(), `${broj}.json`))
}

/** Crop bounds of one baked hero PNG, written by scripts/build-line-heroes.ts. */
export interface LineHeroCrop {
  west: number
  south: number
  east: number
  north: number
  width: number
  height: number
  zoom: number
}

/** Desktop (landscape) + mobile (portrait) crops per line. */
export interface LineHeroMeta {
  desktop: LineHeroCrop
  mobile: LineHeroCrop
}

export function loadHeroMeta(broj: string): LineHeroMeta | null {
  const all = readJson<Record<string, LineHeroMeta>>(
    join(linijeDir(), "hero-meta.json")
  )
  const meta = all?.[broj]
  // Guard against stale pre-rewrite format (flat crop without .desktop).
  return meta && "desktop" in meta ? meta : null
}
