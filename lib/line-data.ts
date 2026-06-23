import { join } from "node:path"

import { getDataDir } from "@/lib/data-dir"
import type { LinePageData } from "@/lib/generated/LinePageData"
import type { LinePagesIndex } from "@/lib/generated/LinePagesIndex"
import { readJsonCached } from "@/lib/page-data"

/**
 * Loaders for the committed per-line page data under data/linije/, generated
 * by the transit crate: `cargo run --release --bin transit-scorer -- --line-pages`.
 */

function linijeDir(): string {
  return join(getDataDir(), "linije")
}

export function loadLineIndex(): LinePagesIndex {
  const index = readJsonCached<LinePagesIndex>(join(linijeDir(), "index.json"))
  if (!index) throw new Error("data/linije/index.json missing — run the line-pages generator")
  return index
}

export function loadLineData(broj: string): LinePageData | null {
  // broj comes from the URL — keep it from escaping the data directory.
  if (!/^[0-9]{1,3}$/.test(broj)) return null
  return readJsonCached<LinePageData>(join(linijeDir(), `${broj}.json`))
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
  const all = readJsonCached<Record<string, LineHeroMeta>>(
    join(linijeDir(), "hero-meta.json")
  )
  const meta = all?.[broj]
  // Guard against stale pre-rewrite format (flat crop without .desktop).
  return meta && "desktop" in meta ? meta : null
}
