import { NextResponse } from "next/server"

import { adresaSlug, centroid, loadAdrese } from '@/lib/adresa';
import type { AdresaStreet, ResolvedAdresa } from '@/lib/adresa';
import { districtAt } from "@/lib/district-at"
import { norm } from "@/lib/normalize"

/**
 * Address autocomplete over the baked DGU index (data/adrese.json from
 * scripts/build-adrese.ts) — replaces the external Photon geocoder so the
 * homepage search answers from memory: no rate limits, no third-party RTT.
 * Matching is diacritic-folded word-prefix ("savska 25" → "Savska cesta 25";
 * "krizaniceva" also matches "Ulica Jurja Križanića" via the reverse prefix).
 * A trailing number narrows to house numbers; without one the street itself
 * is returned (centroid point). Every hit carries its /adresa/[slug] so the
 * search renders address rows as plain links — same verb as stops and lines.
 */

interface IndexedStreet extends AdresaStreet {
  nameNorm: string
  words: Array<string>
}

let indexed: Array<IndexedStreet> | null = null
function loadIndex(): Array<IndexedStreet> {
  if (indexed && process.env.NODE_ENV === "production") {return indexed}
  // oxlint-disable-next-line oxc/no-map-spread -- loadAdrese() objects are the shared page-data cache; mutating them would leak index fields into adresa pages
  indexed = loadAdrese().map((s) => {
    const nameNorm = norm(s.name)
    return { ...s, nameNorm, words: nameNorm.split(/\s+/u) }
  })
  return indexed
}

/** Colloquial/adjectival street forms share a long stem with the official
 *  word: "vukovarska" ~ "vukovara" (Ulica grada Vukovara), "krizaniceva" ~
 *  "krizanica" (Ulica Jurja Križanića). 7 shared leading chars is long enough
 *  to avoid false friends like "kriza" ⊂ "krizaniceva". */
function wordMatch(t: string, w: string): boolean {
  if (w.startsWith(t)) {return true}
  if (t.length < 7 || w.length < 7) {return false}
  let i = 0
  while (i < t.length && i < w.length && t[i] === w[i]) {i++}
  return i >= 7
}

/** Every query token must match some word of the street name. */
function matchesStreet(street: IndexedStreet, tokens: Array<string>): boolean {
  return tokens.every((t) => street.words.some((w) => wordMatch(t, w)))
}

/** Rank: whole-name prefix beats first-word prefix beats the rest; ties by
 *  name length so "Ilica" outranks "Ilički odvojak" and similar. */
function rank(street: IndexedStreet, joined: string): number {
  if (street.nameNorm.startsWith(joined)) {return 0}
  if (street.words[0]?.startsWith(joined.split(" ")[0] ?? "")) {return 1}
  return 2
}

export interface AdresaHit {
  label: string
  /** /adresa/[slug] page for this hit. */
  slug: string
  lat: number
  lon: number
  kind: ResolvedAdresa["kind"]
  kvart: string | null
}

const MAX_HITS = 5

function streetHit(street: IndexedStreet): AdresaHit {
  const [, lat, lon] = centroid(street)
  return {
    label: street.name,
    slug: adresaSlug(street),
    lat,
    lon,
    kind: "ulica",
    kvart: districtAt(lat, lon),
  }
}

export function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const raw = searchParams.get("q")?.trim() ?? ""
  const q = norm(raw)
  if (q.length < 3)
    {return NextResponse.json({ hits: [] as Array<AdresaHit> })}

  // Trailing house number ("savska 25", "ilica 5a") splits off; a digits-only
  // query is a line lookup, not an address — the client never sends one.
  const tokens = q.split(/\s+/u)
  const last = tokens.at(-1)
  const houseNum = /^\d+[a-z]?$/u.test(last ?? "") ? last : null
  const streetTokens = houseNum ? tokens.slice(0, -1) : tokens
  if (streetTokens.length === 0)
    {return NextResponse.json({ hits: [] as Array<AdresaHit> })}

  const joined = streetTokens.join(" ")
  const matched = loadIndex()
    .filter((s) => matchesStreet(s, streetTokens))
    .toSorted((a, b) => rank(a, joined) - rank(b, joined) || a.name.length - b.name.length)

  const hits: Array<AdresaHit> = []
  for (const street of matched) {
    if (hits.length >= MAX_HITS) {break}
    if (houseNum) {
      // Exact number first, then prefix matches (2 → 2, 2a, 21…).
      const nums = street.addrs
        .filter(([hn]) => hn.startsWith(houseNum))
        .toSorted(([a], [b]) => (a === houseNum ? -1 : b === houseNum ? 1 : 0))
      for (const [hn, lat, lon] of nums) {
        if (hits.length >= MAX_HITS) {break}
        hits.push({
          label: `${street.name} ${hn}`,
          slug: adresaSlug(street, hn),
          lat,
          lon,
          kind: "adresa",
          kvart: districtAt(lat, lon),
        })
      }
    } else {
      hits.push(streetHit(street))
    }
  }

  // The number doesn't exist on any matched street ("tratinska 40" — Tratinska
  // has no 40): dead air is worse than the street itself, so fall back to
  // ulica rows for the top matches.
  if (hits.length === 0 && houseNum) {
    for (const street of matched.slice(0, MAX_HITS)) {hits.push(streetHit(street))}
  }

  return NextResponse.json(
    { hits },
    // The index changes only on a re-bake; cache hard at the edge, briefly in
    // the browser (repeat keystrokes hit it constantly while typing).
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=604800" } }
  )
}
