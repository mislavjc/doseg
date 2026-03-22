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

/** Ray-casting point-in-polygon test */
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

function formatCoords(lat: number, lon: number): string {
  return `${lat.toFixed(4)}° N, ${lon.toFixed(4)}° E`
}

function formatTime(time: string): string {
  // Expect HH:MM format
  const match = time.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return time
  return `${match[1]}:${match[2]}`
}

function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e"
  if (score >= 60) return "#84cc16"
  if (score >= 40) return "#eab308"
  if (score >= 20) return "#f97316"
  return "#ef4444"
}

function colorBar(sizes: { w: string; h: string }) {
  return ["#22c55e", "#06b6d4", "#3b82f6", "#6366f1"].map((color) => (
    <div
      key={color}
      style={{
        width: sizes.w,
        height: sizes.h,
        borderRadius: sizes.h === "6px" ? "3px" : "4px",
        background: color,
        display: "flex",
      }}
    />
  ))
}

function CoordsTopBar() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "40px",
      }}
    >
      <div
        style={{
          fontSize: "42px",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <div
          style={{
            width: "14px",
            height: "14px",
            borderRadius: "50%",
            background: "#22c55e",
            display: "flex",
          }}
        />
        Doseg
      </div>
      <div
        style={{
          fontSize: "22px",
          color: "#94a3b8",
          display: "flex",
        }}
      >
        doseg.hr
      </div>
    </div>
  )
}

function ScoreBadge({
  district,
}: {
  district: { score: number; rank: number }
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "16px",
        marginTop: "8px",
      }}
    >
      <div
        style={{
          background: scoreColor(district.score),
          borderRadius: "12px",
          padding: "8px 20px",
          fontSize: "28px",
          fontWeight: 700,
          color: "#0f172a",
          display: "flex",
        }}
      >
        {district.score}/100
      </div>
      <div
        style={{
          fontSize: "26px",
          color: "#cbd5e1",
          display: "flex",
        }}
      >
        #{district.rank} od 17 gradskih cetvrti
      </div>
    </div>
  )
}

function MetadataField({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      }}
    >
      <div
        style={{
          fontSize: "18px",
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          display: "flex",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "26px",
          color: "#e2e8f0",
          fontFeatureSettings: '"tnum"',
          display: "flex",
        }}
      >
        {value}
      </div>
    </div>
  )
}

function CoordsMetadata({
  lat,
  lon,
  timeStr,
}: {
  lat: number
  lon: number
  timeStr: string | null
}) {
  return (
    <div style={{ display: "flex", gap: "40px", marginTop: "16px" }}>
      <MetadataField label="Koordinate" value={formatCoords(lat, lon)} />
      {timeStr && <MetadataField label="Polazak" value={formatTime(timeStr)} />}
    </div>
  )
}

const ogBackground =
  "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)"

function CoordsMainContent({
  district,
  lat,
  lon,
  timeStr,
}: {
  district: { name: string; score: number; rank: number } | null
  lat: number
  lon: number
  timeStr: string | null
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        justifyContent: "center",
        gap: "20px",
      }}
    >
      <div
        style={{
          fontSize: "72px",
          fontWeight: 700,
          letterSpacing: "-0.03em",
          lineHeight: 1.1,
          display: "flex",
        }}
      >
        {district ? district.name : "Zagreb"}
      </div>

      {district && district.score > 0 && <ScoreBadge district={district} />}

      <CoordsMetadata lat={lat} lon={lon} timeStr={timeStr} />
    </div>
  )
}

function CoordsBottomBar() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
      }}
    >
      <div style={{ fontSize: "20px", color: "#475569", display: "flex" }}>
        Doseg javnog prijevoza u 30 min
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        {colorBar({ w: "40px", h: "6px" })}
      </div>
    </div>
  )
}

function CoordsImage({
  district,
  lat,
  lon,
  timeStr,
}: {
  district: { name: string; score: number; rank: number } | null
  lat: number
  lon: number
  timeStr: string | null
}) {
  return (
    <div
      style={{
        width: "1200px",
        height: "630px",
        display: "flex",
        flexDirection: "column",
        background: ogBackground,
        padding: "60px",
        fontFamily: "Inter, system-ui, sans-serif",
        color: "white",
      }}
    >
      <CoordsTopBar />
      <CoordsMainContent
        district={district}
        lat={lat}
        lon={lon}
        timeStr={timeStr}
      />
      <CoordsBottomBar />
    </div>
  )
}

function FallbackLogo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
      <div
        style={{
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          background: "#22c55e",
          display: "flex",
        }}
      />
      <div
        style={{
          fontSize: "80px",
          fontWeight: 700,
          letterSpacing: "-0.03em",
          display: "flex",
        }}
      >
        Doseg
      </div>
    </div>
  )
}

function FallbackContent() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "24px",
      }}
    >
      <FallbackLogo />
      <div
        style={{
          fontSize: "36px",
          color: "#94a3b8",
          textAlign: "center",
          maxWidth: "800px",
          lineHeight: 1.4,
          display: "flex",
        }}
      >
        Karta dosega javnog prijevoza u Zagrebu
      </div>
      <div style={{ display: "flex", gap: "8px", marginTop: "24px" }}>
        {colorBar({ w: "60px", h: "8px" })}
      </div>
      <div
        style={{
          fontSize: "24px",
          color: "#475569",
          marginTop: "32px",
          display: "flex",
        }}
      >
        Pogledaj dokle mozes stici tramvajem i busom u 15, 30 ili 45 min
      </div>
    </div>
  )
}

function FallbackImage() {
  return (
    <div
      style={{
        width: "1200px",
        height: "630px",
        display: "flex",
        flexDirection: "column",
        background: ogBackground,
        padding: "60px",
        fontFamily: "Inter, system-ui, sans-serif",
        color: "white",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <FallbackContent />
      <div
        style={{
          position: "absolute",
          bottom: "40px",
          right: "60px",
          fontSize: "22px",
          color: "#64748b",
          display: "flex",
        }}
      >
        doseg.hr
      </div>
    </div>
  )
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const latStr = searchParams.get("lat")
  const lonStr = searchParams.get("lon")
  const timeStr = searchParams.get("time")

  const hasCoords = latStr && lonStr
  const lat = hasCoords ? parseFloat(latStr) : NaN
  const lon = hasCoords ? parseFloat(lonStr) : NaN

  if (hasCoords && (Number.isNaN(lat) || Number.isNaN(lon))) {
    return new Response("Invalid coordinates", { status: 400 })
  }

  const district = hasCoords ? findDistrict(lat, lon) : null

  return new ImageResponse(
    hasCoords ? (
      <CoordsImage district={district} lat={lat} lon={lon} timeStr={timeStr} />
    ) : (
      <FallbackImage />
    ),
    {
      width: 1200,
      height: 630,
    }
  )
}
