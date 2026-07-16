import { join } from "node:path"

import { cache } from "react"

import { getDataDir } from "@/lib/data-dir"
import { norm } from "@/lib/normalize"
import { readJsonCached } from "@/lib/page-data"

/**
 * The baked DGU address index (data/adrese.json) plus the /adresa/[slug] URL
 * scheme. Slugs are deterministic from the register so the search API and the
 * page never need a lookup table: "Savska cesta" + "25" in naselje Zagreb →
 * "savska-cesta-25"; the same street in Sesvete → "savska-cesta-25-sesvete"
 * (street names repeat across naselja as DISTINCT streets — the suffix keeps
 * them apart, and plain slugs stay short for the common Zagreb case). Street
 * rows without a house number resolve to the street's centroid address.
 */

/** [housenumber, lat, lon] — matches scripts/build-adrese.ts output. */
export type Addr = [string, number, number]

export interface AdresaStreet {
  name: string
  naselje: string
  addrs: Addr[]
}

interface AdreseFile {
  streets: AdresaStreet[]
}

export function loadAdrese(): AdresaStreet[] {
  const file = readJsonCached<AdreseFile>(join(getDataDir(), "adrese.json"))
  return file?.streets ?? []
}

/** URL-safe slug fragment: diacritic-folded, non-alphanumerics collapse to "-". */
export const adresaSlugify = (s: string) =>
  norm(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

const NASELJE_DEFAULT = "Zagreb"

/** Canonical /adresa slug for a street (optionally with a house number). */
export function adresaSlug(street: Pick<AdresaStreet, "name" | "naselje">, hn?: string): string {
  const parts = [adresaSlugify(street.name)]
  if (hn) parts.push(adresaSlugify(hn))
  if (street.naselje !== NASELJE_DEFAULT) parts.push(adresaSlugify(street.naselje))
  return parts.join("-")
}

/** Middle address stands in for a street picked without a house number. */
export const centroid = (street: AdresaStreet): Addr =>
  street.addrs[Math.floor(street.addrs.length / 2)]

export interface ResolvedAdresa {
  /** Display label, e.g. "Savska cesta 25" (house number included when present). */
  label: string
  naselje: string
  kind: "adresa" | "ulica"
  lat: number
  lon: number
}

interface SluggedStreet {
  street: AdresaStreet
  /** Slugified street name — cheap startsWith prefilter for resolution. */
  nameSlug: string
  /** Full slug of the street row (no house number). */
  streetSlug: string
}

// Street slugs are pure functions of the baked register — compute once per
// process (dev re-derives so a re-bake shows up without a restart).
let slugged: SluggedStreet[] | null = null
function loadSlugged(): SluggedStreet[] {
  if (slugged && process.env.NODE_ENV === "production") return slugged
  slugged = loadAdrese().map((street) => ({
    street,
    nameSlug: adresaSlugify(street.name),
    streetSlug: adresaSlug(street),
  }))
  return slugged
}

/**
 * Inverse of adresaSlug over the whole register, correct by construction: a
 * candidate street matches only if re-slugifying it (with one of its house
 * numbers) reproduces the slug exactly. Non-Zagreb streets always carry their
 * naselje suffix, so a plain slug can only mean the Zagreb street. cache()
 * dedupes the generateMetadata + page call pair per request.
 */
export const resolveAdresaSlug = cache((slug: string): ResolvedAdresa | null => {
  for (const { street, nameSlug, streetSlug } of loadSlugged()) {
    if (!slug.startsWith(nameSlug)) continue
    if (slug === streetSlug) {
      const [, lat, lon] = centroid(street)
      return { label: street.name, naselje: street.naselje, kind: "ulica", lat, lon }
    }
    const addr = street.addrs.find(([hn]) => adresaSlug(street, hn) === slug)
    if (!addr) continue
    return {
      label: `${street.name} ${addr[0]}`,
      naselje: street.naselje,
      kind: "adresa",
      lat: addr[1],
      lon: addr[2],
    }
  }
  return null
})
