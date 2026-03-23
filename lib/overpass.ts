const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter"
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

/** Zagreb bounding box */
const ZAGREB_BBOX = { south: 45.72, west: 15.82, north: 45.9, east: 16.14 }

export type POICategory =
  | "hospital"
  | "school"
  | "park"
  | "supermarket"
  | "pharmacy"

type POI = {
  id: number
  name: string
  lat: number
  lon: number
  category: POICategory
}

const OSM_TAGS: Record<POICategory, string> = {
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

let cachedPOIs: POI[] | null = null
let cacheExpiresAt = 0
let pendingFetch: Promise<POI[]> | null = null

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

async function loadPOIs(categories: POICategory[]): Promise<POI[]> {
  const query = buildQuery(categories)
  const response = await fetch(OVERPASS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  })

  if (!response.ok) {
    throw new Error(`Overpass API request failed: ${response.status}`)
  }

  const json = (await response.json()) as OverpassResponse
  return parseElements(json.elements, categories)
}

export async function fetchPOIs(
  categories: POICategory[]
): Promise<POI[]> {
  if (cachedPOIs && Date.now() < cacheExpiresAt) return cachedPOIs

  if (!pendingFetch) {
    pendingFetch = loadPOIs(categories)
      .then((pois) => {
        cachedPOIs = pois
        cacheExpiresAt = Date.now() + CACHE_TTL_MS
        return pois
      })
      .finally(() => {
        pendingFetch = null
      })
  }

  return pendingFetch
}
