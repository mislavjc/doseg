import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import type { Addr } from "../lib/adresa"
import { pointInRing, type Ring } from "../lib/geo"

/**
 * Bakes data/adrese.json — the homepage address-search index — from the
 * OFFICIAL DGU address register (Registar prostornih jedinica, INSPIRE AD
 * WFS). OSM was the first source but misses whole streets (e.g. Ulica
 * Andrije Maurovića in Sesvete); the state register is complete and open.
 * Points are filtered to the dissolved city boundary (data/home-hero.json)
 * and grouped by (street, naselje); coords rounded to 5 decimals (~1 m).
 * Serve-side matching lives in app/api/adrese/route.ts.
 *
 * One-time / refresh usage (≈20 pages × 10k addresses, be polite):
 *   mkdir -p /tmp/dgu-addr
 *   for i in $(seq 0 19); do
 *     curl -s -A "doseg.hr (mislavjc@gmail.com)" -o /tmp/dgu-addr/page-$i.json \
 *       "https://geoportal.dgu.hr/services/inspire/ad/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=ad:AD.Address&outputFormat=application/json&srsName=urn:ogc:def:crs:EPSG::4326&count=10000&startIndex=$((i*10000))&bbox=45.6139,15.7732,45.9692,16.2396,urn:ogc:def:crs:EPSG::4326"
 *     sleep 1
 *   done
 *   bun scripts/build-adrese.ts /tmp/dgu-addr
 */

interface DguFeature {
  geometry: { type: string; coordinates: [number, number] } | null
  properties: {
    ulica: string | null
    kucni_broj: string | null
    naselje: string | null
  }
}

const pagesDir = process.argv[2] ?? "/tmp/dgu-addr"
const root = join(import.meta.dir, "..")

const boundary = (
  JSON.parse(readFileSync(join(root, "data/home-hero.json"), "utf8")) as {
    boundary: Ring
  }
).boundary

const round = (v: number) => Math.round(v * 1e5) / 1e5

// street|naselje → housenumber → Addr. Street names repeat across naselja
// inside Grad Zagreb (Zagreb, Sesvete, Lučko…) as DISTINCT streets — never
// merge their numbers.
const streets = new Map<string, { name: string; naselje: string; byNumber: Map<string, Addr> }>()
let total = 0
let inCity = 0

for (const file of readdirSync(pagesDir).filter((f) => f.endsWith(".json")).sort()) {
  const page = JSON.parse(readFileSync(join(pagesDir, file), "utf8")) as {
    features: DguFeature[]
  }
  for (const f of page.features) {
    total++
    const p = f.properties
    const hn = p.kucni_broj?.toLowerCase().replace(/\s+/g, "")
    // Rural naselja address by settlement name alone — use it as the street.
    const name = p.ulica ?? p.naselje
    const coords = f.geometry?.coordinates
    if (!name || !hn || !coords) continue
    const [lon, lat] = coords
    if (!pointInRing(lon, lat, boundary)) continue
    inCity++
    const key = `${name}|${p.naselje ?? ""}`
    let entry = streets.get(key)
    if (!entry) {
      entry = { name, naselje: p.naselje ?? "", byNumber: new Map() }
      streets.set(key, entry)
    }
    // Duplicate street+number (multiple entrances etc.) — first one wins.
    if (!entry.byNumber.has(hn)) entry.byNumber.set(hn, [hn, round(lat), round(lon)])
  }
}

const numeric = (hn: string) => Number.parseInt(hn, 10) || 0
const out = {
  source: "DGU Registar prostornih jedinica (INSPIRE AD WFS)",
  generatedAt: new Date().toISOString().slice(0, 10),
  streets: [...streets.values()]
    .map(({ name, naselje, byNumber }) => ({
      name,
      naselje,
      addrs: [...byNumber.values()].sort(
        (a, b) => numeric(a[0]) - numeric(b[0]) || a[0].localeCompare(b[0])
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "hr")),
}

const target = join(root, "data/adrese.json")
writeFileSync(target, JSON.stringify(out))
console.log(
  `data/adrese.json: ${out.streets.length} streets, ${inCity} addresses (of ${total} raw)`
)
