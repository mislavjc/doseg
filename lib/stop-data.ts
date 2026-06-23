import { join } from "node:path"

import { getDataDir } from "@/lib/data-dir"
import type { LineHeroMeta } from "@/lib/line-data"
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
 * Stop name → page slug, but only for names that are UNAMBIGUOUS in the index.
 * ~7% of stop names repeat across kvartovi (e.g. "Borovje", "Arena centar");
 * disambiguating those needs coordinates the lightweight index doesn't carry, so
 * a duplicated name maps to nothing rather than guessing the wrong page.
 * Prod-memoized (build-time-static). Returns an empty Map if the index is absent
 * (so callers like the line pages degrade to plain text, never throw).
 */
let nameToSlug: Map<string, string | null> | null = null
function stopSlugIndex(): Map<string, string | null> {
  if (nameToSlug && process.env.NODE_ENV === "production") return nameToSlug
  const m = new Map<string, string | null>()
  try {
    for (const s of loadStopIndex().stops) {
      m.set(s.name, m.has(s.name) ? null : s.slug) // 2nd occurrence → ambiguous
    }
  } catch {
    // index not present (e.g. stanice data not deployed) — no links, no throw.
  }
  nameToSlug = m
  return m
}

/** Resolve the given stop names to their page slugs (unambiguous matches only). */
export function resolveStopSlugs(names: Iterable<string>): Record<string, string> {
  const idx = stopSlugIndex()
  const out: Record<string, string> = {}
  for (const name of names) {
    const slug = idx.get(name)
    if (slug) out[name] = slug
  }
  return out
}
