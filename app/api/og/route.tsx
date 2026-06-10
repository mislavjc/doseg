import { ImageResponse } from "next/og"
import { readFileSync } from "node:fs"
import { join } from "node:path"

export const runtime = "nodejs"

type District = {
  name: string
  score: number
  rank: number
  population: number
  tramLines: string[]
  busLines: string[]
}

type DistrictFeature = {
  type: "Feature"
  properties: { name: string; osmId: number; population: number }
  geometry: { type: "Polygon"; coordinates: number[][][] }
}

type DistrictScores = {
  districts: District[]
}

let cachedGeoJSON: DistrictFeature[] | null = null
let cachedScores: DistrictScores | null = null

function getDistrictGeoJSON(): DistrictFeature[] {
  if (cachedGeoJSON) return cachedGeoJSON
  const raw = readFileSync(
    join(process.cwd(), "data/districts.geojson"),
    "utf8"
  )
  const parsed = JSON.parse(raw)
  cachedGeoJSON = parsed.features as DistrictFeature[]
  return cachedGeoJSON
}

function getDistrictScores(): DistrictScores {
  if (cachedScores) return cachedScores
  const raw = readFileSync(
    join(process.cwd(), "data/district-scores.json"),
    "utf8"
  )
  cachedScores = JSON.parse(raw) as DistrictScores
  return cachedScores
}

function pointInPolygon(
  lat: number,
  lon: number,
  polygon: number[][]
): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0]
    const yi = polygon[i][1]
    const xj = polygon[j][0]
    const yj = polygon[j][1]

    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function findDistrict(
  lat: number,
  lon: number
): { name: string; score: number; rank: number } | null {
  const features = getDistrictGeoJSON()
  const scores = getDistrictScores()

  for (const feature of features) {
    const ring = feature.geometry.coordinates[0]
    if (pointInPolygon(lat, lon, ring)) {
      const districtScore = scores.districts.find(
        (d) => d.name === feature.properties.name
      )
      if (districtScore) {
        return {
          name: districtScore.name,
          score: districtScore.score,
          rank: districtScore.rank,
        }
      }
      return { name: feature.properties.name, score: 0, rank: 0 }
    }
  }
  return null
}

// Editorial tokens (globals.css) — satori can't resolve CSS vars, so the
// values are mirrored here. Keep in sync with the :root block.
const GROUND = "#ffffff" // --ground
const INK = "#0a0a0a" // --ink
const ZG_BLUE = "#0e51c9" // --zg-blue
const NAVY = "#0e3fb0" // --navy

const ASSETS_DIR = join(process.cwd(), "app/api/og/assets")

type OgAssets = {
  geistMonoRegular: Buffer
  geistMonoBold: Buffer
  herosBold: Buffer
  tramSrc: string
}

let cachedAssets: OgAssets | null = null

function getAssets(): OgAssets {
  if (cachedAssets) return cachedAssets
  const tram = readFileSync(join(ASSETS_DIR, "tram.png"))
  cachedAssets = {
    geistMonoRegular: readFileSync(join(ASSETS_DIR, "GeistMono-Regular.ttf")),
    geistMonoBold: readFileSync(join(ASSETS_DIR, "GeistMono-Bold.ttf")),
    herosBold: readFileSync(join(ASSETS_DIR, "TeXGyreHeros-Bold.ttf")),
    tramSrc: `data:image/png;base64,${tram.toString("base64")}`,
  }
  return cachedAssets
}

function MonoCaption({
  children,
  paddingTop = "0px",
}: {
  children: string
  paddingTop?: string
}) {
  return (
    <div
      style={{
        fontFamily: "Geist Mono",
        fontSize: "16px",
        lineHeight: "20px",
        letterSpacing: "0.64px",
        color: ZG_BLUE,
        display: "flex",
        // undefined style values crash satori's renderer — always pass a value
        paddingTop,
      }}
    >
      {children}
    </div>
  )
}

/**
 * OG card — "30:00" design. White ground, centred Geist Mono timer,
 * TeX Gyre Heros question, dithered Zagreb-blue tram along the bottom.
 * The headline swaps to the district name on shared map links.
 */
function OgCard({
  tramSrc,
  headline,
  sub,
}: {
  tramSrc: string
  headline: string
  sub?: string
}) {
  return (
    <div
      style={{
        width: "1200px",
        height: "630px",
        display: "flex",
        backgroundColor: GROUND,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={tramSrc}
        alt=""
        width={900}
        height={339}
        style={{
          position: "absolute",
          left: "150px",
          top: "301px",
          objectFit: "contain",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "0px",
          left: "0px",
          width: "1200px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: "54px",
          gap: "6px",
        }}
      >
        <MonoCaption>doseg · u pola sata</MonoCaption>
        <div
          style={{
            fontFamily: "Geist Mono",
            fontSize: "120px",
            fontWeight: 700,
            lineHeight: "124px",
            letterSpacing: "-2.4px",
            color: NAVY,
            display: "flex",
          }}
        >
          30:00
        </div>
        <div
          style={{
            fontFamily: "TeX Gyre Heros",
            fontSize: "34px",
            fontWeight: 700,
            lineHeight: "40px",
            color: INK,
            display: "flex",
            paddingTop: "6px",
          }}
        >
          {headline}
        </div>
        {sub && <MonoCaption paddingTop="4px">{sub}</MonoCaption>}
      </div>
    </div>
  )
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const latStr = searchParams.get("lat")
  const lonStr = searchParams.get("lon")

  const hasCoords = latStr && lonStr
  const lat = hasCoords ? parseFloat(latStr) : NaN
  const lon = hasCoords ? parseFloat(lonStr) : NaN

  if (hasCoords && (Number.isNaN(lat) || Number.isNaN(lon))) {
    return new Response("Invalid coordinates", { status: 400 })
  }

  const district = hasCoords ? findDistrict(lat, lon) : null
  const assets = getAssets()

  const headline = district ? district.name : "Koliko grada stigneš?"
  const sub =
    district && district.score > 0
      ? `${district.score}/100 · #${district.rank} od 17 kvartova`
      : undefined

  return new ImageResponse(
    <OgCard tramSrc={assets.tramSrc} headline={headline} sub={sub} />,
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "Geist Mono",
          data: assets.geistMonoRegular,
          weight: 400,
          style: "normal",
        },
        {
          name: "Geist Mono",
          data: assets.geistMonoBold,
          weight: 700,
          style: "normal",
        },
        {
          name: "TeX Gyre Heros",
          data: assets.herosBold,
          weight: 700,
          style: "normal",
        },
      ],
    }
  )
}
