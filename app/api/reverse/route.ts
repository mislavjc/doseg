import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

const PHOTON_REVERSE = "https://photon.komoot.io/reverse"
const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse"
const ZAGREB_CENTER = { lat: 45.815, lon: 15.982 }
const NEARBY_THRESHOLD = 0.35

const PhotonFeatureSchema = z.object({
  properties: z.object({
    name: z.string().optional(),
    street: z.string().optional(),
    housenumber: z.string().optional(),
    city: z.string().optional(),
  }),
  geometry: z.object({
    coordinates: z.tuple([z.number(), z.number()]).rest(z.number()),
  }),
})

type PhotonFeature = z.infer<typeof PhotonFeatureSchema>

const PhotonResponse = z.object({
  features: z.array(PhotonFeatureSchema).optional(),
})

const NominatimReverse = z.object({
  display_name: z.string().optional(),
  lat: z.string().optional(),
  lon: z.string().optional(),
  address: z
    .object({
      road: z.string().optional(),
      house_number: z.string().optional(),
      city: z.string().optional(),
      town: z.string().optional(),
      village: z.string().optional(),
      suburb: z.string().optional(),
    })
    .optional(),
})

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
  const lat = latStr == null ? NaN : Number(latStr)
  const lon = lonStr == null ? NaN : Number(lonStr)
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
  displayName ??= await reverseNominatim(lat, lon)
  if (displayName === null || displayName === "") {
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
    const f = PhotonResponse.parse(await res.json()).features?.[0]
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
    const item = NominatimReverse.parse(await res.json())
    if (item.lat && item.lon) {
      const la = Number(item.lat)
      const lo = Number(item.lon)
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
