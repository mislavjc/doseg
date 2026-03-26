import { NextRequest, NextResponse } from "next/server"

const PHOTON_URL = "https://photon.komoot.io/api/"
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
const ZAGREB_CENTER = { lat: 45.815, lon: 15.982 }
const NEARBY_THRESHOLD = 0.3 // ~30km

type Result = { display_name: string; lat: number; lon: number }

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim()
  if (!q || q.length < 2) return NextResponse.json([])

  let results = await searchPhoton(q)
  if (results.length === 0) results = await searchNominatim(q)

  return NextResponse.json(results, {
    headers: { "Cache-Control": "private, max-age=300" },
  })
}

function isNearby(lat: number, lon: number) {
  return Math.abs(lat - ZAGREB_CENTER.lat) < NEARBY_THRESHOLD && Math.abs(lon - ZAGREB_CENTER.lon) < NEARBY_THRESHOLD
}

async function searchPhoton(q: string): Promise<Result[]> {
  const params = new URLSearchParams({ q, lat: String(ZAGREB_CENTER.lat), lon: String(ZAGREB_CENTER.lon), limit: "15", lang: "default" })
  const res = await fetch(`${PHOTON_URL}?${params}`, { next: { revalidate: 300 } })
  if (!res.ok) return []
  const data = await res.json()
  return (data.features ?? [])
    .filter((f: PhotonFeature) => { const [lon, lat] = f.geometry.coordinates; return isNearby(lat, lon) })
    .map((f: PhotonFeature) => {
      const p = f.properties
      const [lon, lat] = f.geometry.coordinates
      const parts: string[] = []
      if (p.name) parts.push(p.name)
      if (p.street && p.street !== p.name) parts.push(p.street)
      if (p.housenumber) parts[parts.length - 1] += ` ${p.housenumber}`
      if (p.city) parts.push(p.city)
      return { display_name: parts.join(", "), lat, lon }
    })
    .slice(0, 5)
}

async function searchNominatim(q: string): Promise<Result[]> {
  const params = new URLSearchParams({
    q, format: "jsonv2", limit: "5", countrycodes: "hr",
    viewbox: "15.82,45.90,16.14,45.72", bounded: "0", "accept-language": "hr",
  })
  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { "User-Agent": "Doseg/1.0 (https://doseg.hr)" },
    next: { revalidate: 300 },
  })
  if (!res.ok) return []
  const data = await res.json()
  return data
    .filter((item: NominatimResult) => isNearby(parseFloat(item.lat), parseFloat(item.lon)))
    .map((item: NominatimResult) => ({
      display_name: item.display_name,
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
    }))
}

type PhotonFeature = {
  properties: { name?: string; street?: string; housenumber?: string; city?: string }
  geometry: { coordinates: [number, number] }
}

type NominatimResult = { display_name: string; lat: string; lon: string }
