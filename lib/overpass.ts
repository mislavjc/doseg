import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter"
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

/** Zagreb bounding box — shared with scripts/build-poi-photos.ts. */
export const ZAGREB_BBOX = { south: 45.72, west: 15.82, north: 45.9, east: 16.14 }

export type POICategory =
  | "hospital"
  | "school"
  | "park"
  | "supermarket"
  | "pharmacy"

/** Wikimedia Commons photo for a POI (scripts/build-poi-photos.ts). */
export type PoiPhoto = {
  /** Displayable thumbnail (Commons Special:FilePath, width-capped). */
  thumb: string
  /** Commons file page — attribution link. */
  page: string
  /** "Author · License", already plain text. */
  credit: string
}

type POI = {
  id: number
  name: string
  lat: number
  lon: number
  category: POICategory
  photo?: PoiPhoto
}

export const OSM_TAGS: Record<POICategory, string> = {
  hospital: '["amenity"="hospital"]',
  school: '["amenity"="school"]',
  park: '["leisure"="park"]',
  supermarket: '["shop"="supermarket"]',
  pharmacy: '["amenity"="pharmacy"]',
}

interface OverpassElement {
  type: "node" | "way" | "relation"
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

interface OverpassResponse {
  elements: OverpassElement[]
}

// Keyed by the sorted category set — a narrow request (e.g. ?categories=park)
// must not poison the cache for a later broader one. The key space is bounded
// (at most 2^5 category combinations), so the Map can't grow without bound.
const poiCache = new Map<string, { pois: POI[]; expiresAt: number }>()
const pendingFetches = new Map<string, Promise<POI[]>>()

function buildQuery(categories: POICategory[]): string {
  const { south, west, north, east } = ZAGREB_BBOX
  const bbox = `${south},${west},${north},${east}`

  const unions = categories
    .map((category) => {
      const tag = OSM_TAGS[category]
      return [
        `  node${tag}(${bbox});`,
        `  way${tag}(${bbox});`,
        `  relation${tag}(${bbox});`,
      ].join("\n")
    })
    .join("\n")

  return `[out:json][timeout:30];\n(\n${unions}\n);\nout center tags;`
}

function parseElements(
  elements: OverpassElement[],
  categories: POICategory[]
): POI[] {
  const pois: POI[] = []

  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat
    const lon = el.lon ?? el.center?.lon
    if (lat == null || lon == null) continue

    const name = el.tags?.name ?? ""
    const category = matchCategory(el.tags ?? {}, categories)
    if (!category) continue

    pois.push({ id: el.id, name, lat, lon, category })
  }

  return pois
}

function matchCategory(
  tags: Record<string, string>,
  categories: POICategory[]
): POICategory | null {
  for (const category of categories) {
    switch (category) {
      case "hospital":
        if (tags.amenity === "hospital") return category
        break
      case "school":
        if (tags.amenity === "school") return category
        break
      case "park":
        if (tags.leisure === "park") return category
        break
      case "supermarket":
        if (tags.shop === "supermarket") return category
        break
      case "pharmacy":
        if (tags.amenity === "pharmacy") return category
        break
    }
  }
  return null
}

/** Fallback mirrors — overpass-api.de regularly 50xes under load. */
const OVERPASS_MIRRORS = [
  OVERPASS_API_URL,
  "https://overpass.kumi.systems/api/interpreter",
]

/**
 * Disk snapshot (data/poi-snapshot.json): refreshed after every successful
 * Overpass fetch, served whenever every mirror is down — POIs change rarely,
 * a stale list beats an empty map.
 */
function snapshotPath() {
  const dataDir = process.env.DATA_DIR || join(process.cwd(), "data")
  return join(dataDir, "poi-snapshot.json")
}

function readSnapshot(categories: POICategory[]): POI[] | null {
  try {
    const data = JSON.parse(readFileSync(snapshotPath(), "utf-8")) as {
      pois: POI[]
    }
    const wanted = new Set(categories)
    return data.pois.filter((p) => wanted.has(p.category))
  } catch {
    return null
  }
}

function writeSnapshot(pois: POI[]) {
  try {
    writeFileSync(
      snapshotPath(),
      JSON.stringify({ generatedAt: new Date().toISOString(), pois })
    )
  } catch {
    // best effort — read-only fs in some deploys
  }
}

async function loadPOIs(categories: POICategory[]): Promise<POI[]> {
  const query = buildQuery(categories)
  let lastError: Error | null = null
  for (const url of OVERPASS_MIRRORS) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        // Overpass QL caps itself at [timeout:30]; give the socket a little
        // more before we abort a genuinely-hung connection.
        signal: AbortSignal.timeout(35000),
      })
      if (!response.ok) {
        lastError = new Error(`Overpass API request failed: ${response.status}`)
        continue
      }
      const json = (await response.json()) as OverpassResponse
      const pois = parseElements(json.elements, categories)
      writeSnapshot(pois)
      return pois
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }
  const snapshot = readSnapshot(categories)
  if (snapshot && snapshot.length > 0) return snapshot
  throw lastError ?? new Error("Overpass API request failed")
}

/**
 * Commons photos for notable POIs (data/poi-photos.json, keyed by OSM id) —
 * generated offline by scripts/build-poi-photos.ts. Loaded once; absence is
 * fine, the popup just shows no photo.
 */
// Loaded from data/poi-photos.json on first use; reset on module reload.
let photoMap: Record<string, PoiPhoto> | null = null

function loadPhotoMap(): Record<string, PoiPhoto> {
  if (photoMap) return photoMap
  try {
    const dataDir = process.env.DATA_DIR || join(process.cwd(), "data")
    photoMap = JSON.parse(
      readFileSync(join(dataDir, "poi-photos.json"), "utf-8")
    ) as Record<string, PoiPhoto>
  } catch {
    photoMap = {}
  }
  return photoMap
}

function withPhotos(pois: POI[]): POI[] {
  const photos = loadPhotoMap()
  if (Object.keys(photos).length === 0) return pois
  return pois.map((p) => {
    const photo = photos[String(p.id)]
    return photo ? { ...p, photo } : p
  })
}

export async function fetchPOIs(categories: POICategory[]): Promise<POI[]> {
  const key = [...categories].sort().join(",")
  const cached = poiCache.get(key)
  if (cached && Date.now() < cached.expiresAt) return cached.pois

  let pending = pendingFetches.get(key)
  if (!pending) {
    pending = loadPOIs(categories)
      .then(withPhotos)
      .then((pois) => {
        poiCache.set(key, { pois, expiresAt: Date.now() + CACHE_TTL_MS })
        return pois
      })
      .finally(() => {
        pendingFetches.delete(key)
      })
    pendingFetches.set(key, pending)
  }

  return pending
}
