/**
 * POI photo enrichment — writes data/poi-photos.json, keyed by OSM id.
 *
 * Pipeline: Overpass (POIs with a `wikidata` tag in the Zagreb bbox) →
 * Wikidata wbgetentities (P18 image filename) → Commons imageinfo (artist +
 * license for attribution) → committed JSON. ~25 POIs carry a photo today,
 * the notable ones people actually click (KBC, the gimnazije, Maksimir).
 *
 * Re-run when the POI set changes; commit the output. Runtime joins it onto
 * the live Overpass POIs by OSM id (lib/overpass.ts).
 *
 *   bun scripts/build-poi-photos.ts
 */
import { writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  OSM_TAGS,
  ZAGREB_BBOX,
  type PoiPhoto,
  type POICategory,
} from "../lib/overpass"

const CATEGORIES: POICategory[] = [
  "hospital",
  "school",
  "park",
  "supermarket",
  "pharmacy",
]
const UA = "doseg/1.0 (https://doseg.hr; mislavjc@gmail.com)"
const THUMB_WIDTH = 480

type OverpassEl = { id: number; tags?: Record<string, string> }

/** OSM id → Wikidata QID for every POI that carries a `wikidata` tag. */
async function fetchOsmWikidata(): Promise<Map<number, string>> {
  const { south, west, north, east } = ZAGREB_BBOX
  const bbox = `${south},${west},${north},${east}`
  const unions = CATEGORIES.map((c) => {
    const tag = `${OSM_TAGS[c]}["wikidata"]`
    return `  node${tag}(${bbox});\n  way${tag}(${bbox});\n  relation${tag}(${bbox});`
  }).join("\n")
  const query = `[out:json][timeout:60];\n(\n${unions}\n);\nout tags;`

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": UA,
    },
    body: `data=${encodeURIComponent(query)}`,
  })
  if (!res.ok) throw new Error(`Overpass ${res.status}`)
  const json = (await res.json()) as { elements: OverpassEl[] }

  const byOsm = new Map<number, string>()
  for (const el of json.elements) {
    const qid = el.tags?.wikidata
    if (qid && /^Q\d+$/.test(qid)) byOsm.set(el.id, qid)
  }
  return byOsm
}

/** QID → P18 image filename (without the "File:" prefix). */
async function fetchP18(qids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (let i = 0; i < qids.length; i += 50) {
    const batch = qids.slice(i, i + 50).join("|")
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch}&props=claims&format=json&origin=*`
    const res = await fetch(url, { headers: { "User-Agent": UA } })
    if (!res.ok) throw new Error(`Wikidata ${res.status}`)
    const data = (await res.json()) as {
      entities: Record<
        string,
        { claims?: { P18?: { mainsnak?: { datavalue?: { value?: string } } }[] } }
      >
    }
    for (const [qid, ent] of Object.entries(data.entities)) {
      const file = ent.claims?.P18?.[0]?.mainsnak?.datavalue?.value
      if (file) out.set(qid, file)
    }
  }
  return out
}

/** Strip HTML to plain text and squeeze whitespace (extmetadata is HTML).
 * Commons templates often emit a phrase twice ("Unknown authorUnknown
 * author") — collapse an exact full-string duplication. */
function plain(html: string): string {
  const s = html
    .replace(/<[^>]*>/g, "")
    .replace(/&[^;]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (s.length % 2 === 0) {
    const half = s.slice(0, s.length / 2)
    if (half === s.slice(s.length / 2)) return half
  }
  return s
}

/** Commons file title → "Author · License" credit line. */
async function fetchCredits(files: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (let i = 0; i < files.length; i += 50) {
    const titles = files
      .slice(i, i + 50)
      .map((f) => `File:${f}`)
      .join("|")
    const url =
      "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*" +
      "&prop=imageinfo&iiprop=extmetadata&titles=" +
      encodeURIComponent(titles)
    const res = await fetch(url, { headers: { "User-Agent": UA } })
    if (!res.ok) throw new Error(`Commons ${res.status}`)
    const data = (await res.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            title?: string
            imageinfo?: { extmetadata?: Record<string, { value?: string }> }[]
          }
        >
      }
    }
    for (const page of Object.values(data.query?.pages ?? {})) {
      const file = page.title?.replace(/^File:/, "")
      const meta = page.imageinfo?.[0]?.extmetadata
      if (!file) continue
      let author = meta?.Artist?.value ? plain(meta.Artist.value) : null
      if (author && /^unknown/i.test(author)) author = null // PD placeholder
      const license = meta?.LicenseShortName?.value
        ? plain(meta.LicenseShortName.value)
        : null
      const credit = [author, license].filter(Boolean).join(" · ")
      out.set(file, credit || "Wikimedia Commons")
    }
  }
  return out
}

async function main() {
  console.log("Fetching POIs with wikidata tags…")
  const osmToQid = await fetchOsmWikidata()
  const qids = [...new Set(osmToQid.values())]
  console.log(`  ${osmToQid.size} tagged POIs, ${qids.length} unique QIDs`)

  console.log("Resolving P18 images…")
  const qidToFile = await fetchP18(qids)
  console.log(`  ${qidToFile.size} have a photo`)

  console.log("Fetching Commons credits…")
  const credits = await fetchCredits([...new Set(qidToFile.values())])

  const map: Record<string, PoiPhoto> = {}
  for (const [osmId, qid] of osmToQid) {
    const file = qidToFile.get(qid)
    if (!file) continue
    const encoded = encodeURIComponent(file.replace(/ /g, "_"))
    map[String(osmId)] = {
      thumb: `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=${THUMB_WIDTH}`,
      page: `https://commons.wikimedia.org/wiki/File:${encoded}`,
      credit: credits.get(file) ?? "Wikimedia Commons",
    }
  }

  const dataDir = process.env.DATA_DIR || join(process.cwd(), "data")
  const outPath = join(dataDir, "poi-photos.json")
  writeFileSync(outPath, JSON.stringify(map, null, 2) + "\n")
  console.log(`Wrote ${Object.keys(map).length} photos → ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
