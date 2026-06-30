import { NextResponse, type NextRequest } from "next/server"

const PHOTON_REVERSE = "https://photon.komoot.io/reverse"
const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse"
const ZAGREB_CENTER = { lat: 45.815, lon: 15.982 }
const NEARBY_THRESHOLD = 0.35

type PhotonFeature = {
  properties: {
    name?: string
    street?: string
    housenumber?: string
    city?: string
  }
  geometry: { coordinates: [number, number] }
}

function isNearby(lat: number, lon: number) {
  return (
    Math.abs(lat - ZAGREB_CENTER.lat) < NEARBY_THRESHOLD &&
    Math.abs(lon - ZAGREB_CENTER.lon) < NEARBY_THRESHOLD
  )
}

/** A clicked point is a location, not a venue — prefer the street (+number)
 * over a nearby POI name ("Blagajna HNB"), falling back to the name only
 * when there's no street. */
function photonLabel(p: PhotonFeature["properties"]): string {
  const parts: string[] = []
  if (p.street) parts.push(p.housenumber ? `${p.street} ${p.housenumber}` : p.street)
  else if (p.name) parts.push(p.name)
  if (p.city && parts[0] !== p.city) parts.push(p.city)
  return parts.join(", ")
}

export async function GET(req: NextRequest) {
  const latStr = req.nextUrl.searchParams.get("lat")
  const lonStr = req.nextUrl.searchParams.get("lon")
  const lat = latStr != null ? Number(latStr) : NaN
  const lon = lonStr != null ? Number(lonStr) : NaN
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "invalid lat/lon" }, { status: 400 })
  }
  if (!isNearby(lat, lon)) {
    return NextResponse.json(
      { display_name: `${lat.toFixed(4)}°, ${lon.toFixed(4)}°` },
      { headers: { "Cache-Control": "private, max-age=300" } }
    )
  }

  let displayName = await reversePhoton(lat, lon)
  if (!displayName) displayName = await reverseNominatim(lat, lon)
  if (!displayName) {
    displayName = `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`
  }

  return NextResponse.json(
    { display_name: displayName },
    { headers: { "Cache-Control": "private, max-age=300" } }
  )
}

async function reversePhoton(lat: number, lon: number): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      lang: "default",
    })
    const res = await fetch(`${PHOTON_REVERSE}?${params}`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const f = data.features?.[0] as PhotonFeature | undefined
    if (!f) return null
    const [flon, flat] = f.geometry.coordinates
    if (!isNearby(flat, flon)) return null
    const label = photonLabel(f.properties)
    return label || null
  } catch {
    return null
  }
}

async function reverseNominatim(lat: number, lon: number): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      format: "jsonv2",
      "accept-language": "hr",
      zoom: "18",
      addressdetails: "1",
    })
    const res = await fetch(`${NOMINATIM_REVERSE}?${params}`, {
      headers: { "User-Agent": "Doseg/1.0 (https://doseg.hr)" },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    const item: {
      display_name?: string
      lat?: string
      lon?: string
      address?: {
        road?: string
        house_number?: string
        city?: string
        town?: string
        village?: string
        suburb?: string
      }
    } = await res.json()
    if (item.lat && item.lon) {
      const la = parseFloat(item.lat)
      const lo = parseFloat(item.lon)
      if (Number.isFinite(la) && Number.isFinite(lo) && !isNearby(la, lo))
        return null
    }
    // Prefer the structured street (+number) over the full POI-led display_name.
    const a = item.address
    if (a?.road) {
      const parts = [a.house_number ? `${a.road} ${a.house_number}` : a.road]
      const area = a.city ?? a.town ?? a.village ?? a.suburb
      if (area) parts.push(area)
      return parts.join(", ")
    }
    return item.display_name ?? null
  } catch {
    return null
  }
}
