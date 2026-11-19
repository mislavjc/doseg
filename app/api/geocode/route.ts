import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const PHOTON_URL = "https://photon.komoot.io/api/"
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
const DGU_WFS_URL = "https://geoportal.dgu.hr/services/inspire/ad/wfs"
const ZAGREB_CENTER = { lat: 45.815, lon: 15.982 }
const ZAGREB_BBOX = "15.82,45.72,16.14,45.90"
// ~30km
const NEARBY_THRESHOLD = 0.3

/** Coarse place kind — drives the category dot in the autocomplete (spec §7). */
export type GeocodeKind =
  | "hospital"
  | "school"
  | "park"
  | "street"
  | "address"
  | "place"

type Result = { display_name: string; lat: number; lon: number; kind: GeocodeKind }

function kindFromOsm(key?: string, value?: string, type?: string): GeocodeKind {
  if (key === "amenity") {
    if (value === "hospital" || value === "clinic" || value === "doctors")
      return "hospital"
    if (
      value === "school" ||
      value === "university" ||
      value === "college" ||
      value === "kindergarten"
    )
      return "school"
  }
  if (key === "leisure" && (value === "park" || value === "garden"))
    return "park"
  if (key === "highway" || type === "street") return "street"
  if (type === "house") return "address"
  return "place"
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim()
  if (!q || q.length < 2) return NextResponse.json([])

  const [photon, nominatim, dgu] = await Promise.all([searchPhoton(q), searchNominatim(q), searchDGU(q)])
  const results = dedup([...dgu, ...photon, ...nominatim]).slice(0, 7)

  return NextResponse.json(results, {
    headers: { "Cache-Control": "private, max-age=300" },
  })
}

/** First comma segment, lowercased + diacritics stripped — the "same place"
 * key so "Trg bana Josipa Jelačića" variants collapse to one. */
function titleKey(name: string): string {
  return name
    .split(",")[0]
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
}

function dedup(results: Result[]): Result[] {
  const out: Result[] = []
  for (const r of results) {
    // Keep genuinely distinct house numbers; collapse same-named results that
    // carry no number (a bare street/place repeated as ulica/mjesto/adresa).
    const numbered = r.kind === "address" && /\d/u.test(r.display_name)
    const key = numbered ? null : titleKey(r.display_name)
    const dup = out.some(
      (o) =>
        (Math.abs(o.lat - r.lat) < 0.0005 && Math.abs(o.lon - r.lon) < 0.0005) ||
        // Same unnumbered name → one result. Within the Zagreb bbox a repeated
        // street/place name is the same thing (the geocoder returns it as
        // ulica / mjesto / adresa, and long streets as several segments).
        (key != null && titleKey(o.display_name) === key)
    )
    if (!dup) out.push(r)
  }
  return out
}

function isNearby(lat: number, lon: number) {
  return Math.abs(lat - ZAGREB_CENTER.lat) < NEARBY_THRESHOLD && Math.abs(lon - ZAGREB_CENTER.lon) < NEARBY_THRESHOLD
}

async function searchPhoton(q: string): Promise<Result[]> {
  try {
    const params = new URLSearchParams({ q, lat: String(ZAGREB_CENTER.lat), lon: String(ZAGREB_CENTER.lon), limit: "15", lang: "default" })
    const res = await fetch(`${PHOTON_URL}?${params}`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(4000) })
    if (!res.ok) return []
    const data = PhotonResponse.parse(await res.json())
    return (data.features ?? [])
      .filter((f) => { const [lon, lat] = f.geometry.coordinates; return isNearby(lat, lon) })
      .map((f): Result => {
        const p = f.properties
        const [lon, lat] = f.geometry.coordinates
        const parts: string[] = []
        if (p.name) parts.push(p.name)
        if (p.street && p.street !== p.name) parts.push(p.street)
        if (p.housenumber) parts[parts.length - 1] += ` ${p.housenumber}`
        if (p.city) parts.push(p.city)
        const kind = p.housenumber
          ? "address"
          : kindFromOsm(p.osm_key, p.osm_value, p.type)
        return { display_name: parts.join(", "), lat, lon, kind }
      })
      .slice(0, 5)
  } catch {
    return []
  }
}

async function searchNominatim(q: string): Promise<Result[]> {
  try {
    const params = new URLSearchParams({
      q, format: "jsonv2", limit: "10", countrycodes: "hr",
      viewbox: "15.82,45.90,16.14,45.72", bounded: "0", "accept-language": "hr",
    })
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { "User-Agent": "Doseg/1.0 (https://doseg.hr)" },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return []
    const parsed = NominatimResponse.safeParse(await res.json())
    if (!parsed.success) return []
    return parsed.data
      .filter((item) => isNearby(Number(item.lat), Number(item.lon)))
      .map((item) => ({
        display_name: item.display_name,
        lat: Number(item.lat),
        lon: Number(item.lon),
        kind: kindFromOsm(
          item.category,
          item.type,
          item.addresstype === "road" ? "street" : undefined
        ),
      }))
  } catch {
    return []
  }
}

const Point = z.object({
  coordinates: z.tuple([z.number(), z.number()]).rest(z.number()),
})

const PhotonResponse = z.object({
  features: z
    .array(
      z.object({
        properties: z.object({
          name: z.string().optional(),
          street: z.string().optional(),
          housenumber: z.string().optional(),
          city: z.string().optional(),
          osm_key: z.string().optional(),
          osm_value: z.string().optional(),
          type: z.string().optional(),
        }),
        geometry: Point,
      })
    )
    .optional(),
})

const NominatimResponse = z.array(
  z.object({
    display_name: z.string(),
    lat: z.string(),
    lon: z.string(),
    category: z.string().optional(),
    type: z.string().optional(),
    addresstype: z.string().optional(),
  })
)

function parseQuery(q: string): { street: string; house?: string } {
  const m = q.match(/^(.+?)\s+(\d+\s*[a-zA-Z]?)$/u)
  return m ? { street: m[1], house: m[2].trim() } : { street: q }
}

async function searchDGU(q: string): Promise<Result[]> {
  const { street: rawStreet, house } = parseQuery(q)
  const street = rawStreet.replaceAll(/[%_]/gu, " ")
  const escaped = street.replaceAll('\'', "''")
  const wildcard = escaped.replaceAll(/[cszdCSZD]/gu, "_")
  // Try exact match first; fall back to diacritics-wildcard only if different
  const results = await fetchDGU(buildDGUCql(escaped, house), house)
  if (results.length > 0 || wildcard === escaped) return results
  return fetchDGU(buildDGUCql(wildcard, house), house)
}

function buildDGUCql(pattern: string, house?: string): string {
  let cql = `ulica ILIKE '%${pattern}%' AND BBOX(geometry,${ZAGREB_BBOX},'EPSG:4326')`
  if (house) cql += ` AND kucni_broj = '${house}'`
  return cql
}

async function fetchDGU(cql: string, house?: string): Promise<Result[]> {
  const params = new URLSearchParams({
    service: "WFS", version: "2.0.0", request: "GetFeature",
    typeNames: "ad:AD.Address", outputFormat: "application/json",
    count: "20", srsName: "EPSG:4326", CQL_FILTER: cql,
  })
  const res = await fetch(`${DGU_WFS_URL}?${params}`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(3000) }).catch(() => null)
  if (!res?.ok) return []
  const parsed = DGUResponse.safeParse(await res.json())
  if (!parsed.success) return []
  const seen = new Set<number | string>()
  const out: Result[] = []
  for (const f of parsed.data.features ?? []) {
    const uid = house ? f.id : f.properties.ulica_id
    if (seen.has(uid)) continue
    seen.add(uid)
    const [lon, lat] = f.geometry.coordinates
    const parts = [f.properties.ulica]
    if (house && f.properties.kucni_broj) parts[0] += ` ${f.properties.kucni_broj}`
    if (f.properties.naselje) parts.push(f.properties.naselje)
    out.push({
      display_name: parts.join(", "),
      lat,
      lon,
      kind: house ? "address" : "street",
    })
  }
  return out
}

const DGUResponse = z.object({
  features: z
    .array(
      z.object({
        id: z.union([z.number(), z.string()]),
        geometry: Point,
        properties: z.object({
          ulica: z.string(),
          naselje: z.string().nullish(),
          ulica_id: z.union([z.number(), z.string()]),
          kucni_broj: z.string().nullish(),
        }),
      })
    )
    .optional(),
})
