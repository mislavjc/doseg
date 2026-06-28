import { join } from "node:path"

import { getDataDir } from "@/lib/data-dir"
import { fastDistKm } from "@/lib/geo"
import type { LineHeroMeta } from "@/lib/line-data"
import type { StopIndexEntry } from "@/lib/generated/StopIndexEntry"
import type { StopMode } from "@/lib/generated/StopMode"
import type { StopPageData } from "@/lib/generated/StopPageData"
import type { StopPagesIndex } from "@/lib/generated/StopPagesIndex"
import { readJsonCached } from "@/lib/page-data"

/**
 * Loaders for the committed per-stop page data under data/stanice/, generated
 * by the transit crate: `cargo run --release --bin transit-scorer -- --stop-pages`.
 * Sibling of lib/line-data.ts.
 */

function staniceDir(): string {
  return join(getDataDir(), "stanice")
}

export function loadStopIndex(): StopPagesIndex {
  const index = readJsonCached<StopPagesIndex>(join(staniceDir(), "index.json"))
  if (!index)
    throw new Error("data/stanice/index.json missing — run the stop-pages generator")
  return index
}

export function loadStopData(slug: string): StopPageData | null {
  // slug comes from the URL — keep it from escaping the data directory.
  if (!/^[a-z0-9-]+$/.test(slug)) return null
  return readJsonCached<StopPageData>(join(staniceDir(), `${slug}.json`))
}

/** Baked dither-crop bounds per stop (scripts/build-stop-heroes.ts); same shape
 *  as the line heroes. Null until/unless this stop's map is baked. */
export function loadStopHeroMeta(slug: string): LineHeroMeta | null {
  const all = readJsonCached<Record<string, LineHeroMeta>>(
    join(staniceDir(), "hero-meta.json")
  )
  const meta = all?.[slug]
  return meta && "desktop" in meta ? meta : null
}

/**
 * Stop name → the index entries with that name. ~7% of names repeat across
 * kvartovi (e.g. "Borovje", "Arena centar"); the entries carry lat/lon so a
 * caller with coordinates can pick the right page. Prod-memoized
 * (build-time-static); empty Map if the index is absent (callers degrade to
 * plain text, never throw).
 */
let byName: Map<string, StopIndexEntry[]> | null = null
function stopsByName(): Map<string, StopIndexEntry[]> {
  if (byName && process.env.NODE_ENV === "production") return byName
  const m = new Map<string, StopIndexEntry[]>()
  try {
    for (const s of loadStopIndex().stops) {
      const arr = m.get(s.name)
      if (arr) arr.push(s)
      else m.set(s.name, [s])
    }
  } catch {
    // index not present (e.g. stanice data not deployed) — no links, no throw.
  }
  byName = m
  return m
}

export interface SiblingStop {
  slug: string
  kvart: string | null
  mode: StopMode
  lineCount: number
  /** Straight-line distance from the current stop, metres. */
  distM: number
}

/**
 * Other stop pages that share this stop's exact name, nearest first. ~105 pages
 * carry a non-unique name (e.g. two "Tr. Savica" in Trnje) and the slug only
 * disambiguates them with an opaque "-2"; surfacing the siblings (kvart +
 * distance) lets a reader tell which physical stop they're on. Empty when the
 * name is unique or the index is absent.
 */
export function siblingStops(self: {
  slug: string
  name: string
  lat: number
  lon: number
}): SiblingStop[] {
  const cands = stopsByName().get(self.name) ?? []
  return cands
    .filter((c) => c.slug !== self.slug)
    .map((c) => ({
      slug: c.slug,
      kvart: c.kvart,
      mode: c.mode,
      lineCount: c.lineCount,
      distM: Math.round(fastDistKm(self.lat, self.lon, c.lat, c.lon) * 1000),
    }))
    .sort((a, b) => a.distM - b.distM)
}

/**
 * Resolve stops (with coords) to their page slugs. Unique names map directly;
 * duplicate names pick the nearest index cluster by coordinate. Falls back to
 * skipping ambiguous names if the index lacks coords (pre-regen data).
 */
export function resolveStopSlugs(
  stops: Iterable<{ name: string; lat: number; lon: number }>
): Record<string, string> {
  const idx = stopsByName()
  const out: Record<string, string> = {}
  for (const stop of stops) {
    const cands = idx.get(stop.name)
    if (!cands || cands.length === 0) continue
    if (cands.length === 1) {
      out[stop.name] = cands[0].slug
      continue
    }
    // Duplicate name → nearest by coords (needs coords on both sides).
    if (!Number.isFinite(stop.lat) || cands.some((c) => !Number.isFinite(c.lat))) continue
    let best = cands[0]
    let bestKm = fastDistKm(stop.lat, stop.lon, best.lat, best.lon)
    for (const c of cands.slice(1)) {
      const km = fastDistKm(stop.lat, stop.lon, c.lat, c.lon)
      if (km < bestKm) {
        bestKm = km
        best = c
      }
    }
    out[stop.name] = best.slug
  }
  return out
}
