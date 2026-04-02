import { ImageResponse } from "next/og"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { TRANSIT_MODES, ISOCHRONE_COLORS, scoreColor } from "@/lib/transit"

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

function formatCoords(lat: number, lon: number): string {
  return `${lat.toFixed(4)}° N, ${lon.toFixed(4)}° E`
}

function formatTime(time: string): string {
  const match = time.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return time
  return `${match[1]}:${match[2]}`
}

const BAND_COLORS = ISOCHRONE_COLORS.slice(0, 3) as unknown as readonly [string, string, string]
const BAND_LABELS = ["10 min", "20 min", "30 min"] as const

const MODES = [
  { key: "TRAM" as const, icon: "tram" as const },
  { key: "BUS" as const, icon: "bus" as const },
  { key: "RAIL" as const, icon: "train" as const },
  { key: "BIKE" as const, icon: "bike" as const },
] as const

/**
 * Blocky isochrone ring — mimics actual walk-area polygons which follow
 * the street grid. Edges are short straight segments at grid-like angles,
 * creating the characteristic angular/pixelated appearance.
 */
type Corridor = { angle: number; reach: number; width: number }

/** Deterministic pseudo-random from seed */
function seededRand(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return s / 0x7fffffff
  }
}

/** Snap points to grid and build SVG path with H/V stepping for blocky edges. */
function gridSnappedPath(pts: [number, number][]): string {
  const grid = 5
  const s = pts.map(([x, y]) => [
    Math.round(x / grid) * grid,
    Math.round(y / grid) * grid,
  ] as [number, number])

  const parts: string[] = [`M ${s[0][0]} ${s[0][1]}`]
  for (let i = 1; i < s.length; i++) {
    const [px, py] = s[i - 1]
    const [x, y] = s[i]
    if (Math.abs(x - px) > grid || Math.abs(y - py) > grid) {
      if (i % 3 !== 0) {
        parts.push(`L ${x} ${py}`, `L ${x} ${y}`)
      } else {
        parts.push(`L ${px} ${y}`, `L ${x} ${y}`)
      }
    } else {
      parts.push(`L ${x} ${y}`)
    }
  }
  parts.push("Z")
  return parts.join(" ")
}

function isoRing(
  cx: number,
  cy: number,
  baseR: number,
  spikeR: number,
  corridors: Corridor[],
  seed: number,
  stretchX: number,
  stretchY: number,
): string {
  const rand = seededRand(Math.round(seed * 1000))
  const segments = 180
  const pts: [number, number][] = []

  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2
    let maxInf = 0
    for (const c of corridors) {
      let diff = Math.abs(t - c.angle)
      if (diff > Math.PI) diff = Math.PI * 2 - diff
      const inf = Math.max(0, 1 - diff / c.width)
      maxInf = Math.max(maxInf, inf * inf * (3 - 2 * inf) * c.reach)
    }
    const r = (baseR + (spikeR - baseR) * maxInf) * (1 + (rand() - 0.5) * 0.12)
    pts.push([cx + Math.cos(t) * r * stretchX, cy + Math.sin(t) * r * stretchY])
  }

  return gridSnappedPath(pts)
}

const CX = 320
const CY = 310
const SX = 1.15
const SY = 0.88

const CORRIDORS: Corridor[] = [
  { angle: 0.0,  reach: 1.0,  width: 0.32 },
  { angle: 0.55, reach: 0.65, width: 0.25 },
  { angle: 1.15, reach: 0.45, width: 0.22 },
  { angle: 1.85, reach: 0.35, width: 0.20 },
  { angle: 2.65, reach: 0.55, width: 0.26 },
  { angle: 3.14, reach: 0.9,  width: 0.32 },
  { angle: 3.55, reach: 0.45, width: 0.20 },
  { angle: 4.15, reach: 0.5,  width: 0.25 },
  { angle: 4.7,  reach: 0.75, width: 0.38 },
  { angle: 5.3,  reach: 0.6,  width: 0.28 },
  { angle: 5.85, reach: 0.8,  width: 0.30 },
]

// 6 concentric rings with increasing radius + color ramp
// Inner: green with visible fill. Middle: teal. Outer: blue/lavender, mostly outline.
const RING_DEFS = [
  { baseR: 35,  spikeR: 60,  seed: 1.0 },
  { baseR: 55,  spikeR: 95,  seed: 2.3 },
  { baseR: 80,  spikeR: 130, seed: 3.7 },
  { baseR: 105, spikeR: 165, seed: 5.1 },
  { baseR: 135, spikeR: 205, seed: 6.8 },
  { baseR: 165, spikeR: 250, seed: 8.2 },
]

const RINGS = RING_DEFS.map((d, i) => {
  const t = i / (RING_DEFS.length - 1)
  const colorIdx = t < 0.33 ? 0 : t < 0.66 ? 1 : 2
  return {
    ...d,
    color: BAND_COLORS[colorIdx],
    strokeOpacity: 0.5 - t * 0.2,
    fillOpacity: t < 0.33 ? 0.06 : t < 0.66 ? 0.04 : 0.025,
  }
})

const RING_PATHS = RINGS.map((r) =>
  isoRing(CX, CY, r.baseR, r.spikeR, CORRIDORS, r.seed, SX, SY)
)

function IsochroneIllustration() {
  return (
    <svg
      width="650"
      height="630"
      viewBox="0 0 650 630"
      style={{ position: "absolute", right: 0, top: 0 }}
    >
      {/* Fills — inner bands more visible, outer nearly invisible */}
      {RINGS.map((r, i) => (
        <path
          key={`f${i}`}
          d={RING_PATHS[i]}
          fill={r.color}
          fillOpacity={r.fillOpacity}
          stroke="none"
        />
      ))}
      {/* Outlines — the main visual */}
      {RINGS.map((r, i) => (
        <path
          key={`s${i}`}
          d={RING_PATHS[i]}
          fill="none"
          stroke={r.color}
          strokeWidth={1.3}
          strokeOpacity={r.strokeOpacity}
          strokeLinejoin="miter"
        />
      ))}
      <circle cx={CX} cy={CY} r={4.5} fill="#fff" stroke="#1a7a52" strokeWidth={2} />
    </svg>
  )
}

function ModeIcon({ icon }: { icon: string }) {
  const s = { width: "16px", height: "16px", display: "flex" as const }
  switch (icon) {
    case "tram":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={s}>
          <path d="M7 17m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0" />
          <path d="M17 17m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0" />
          <path d="M5 17H3V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v11h-2" />
          <path d="M9 17h6" />
          <path d="M3 10h18" />
          <path d="M12 2v3" />
        </svg>
      )
    case "bus":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={s}>
          <path d="M8 6v6" />
          <path d="M16 6v6" />
          <path d="M2 12h19.6" />
          <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3" />
          <circle cx="7" cy="18" r="2" />
          <circle cx="15" cy="18" r="2" />
          <path d="M9 18h4" />
        </svg>
      )
    case "train":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={s}>
          <path d="M4 11V4a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v7" />
          <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
          <path d="M4 11h16" />
          <path d="M4 15h16" />
          <path d="M12 3v8" />
          <path d="m8 22 4-3 4 3" />
        </svg>
      )
    case "bike":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={s}>
          <circle cx="18.5" cy="17.5" r="3.5" />
          <circle cx="5.5" cy="17.5" r="3.5" />
          <circle cx="15" cy="5" r="1" />
          <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
        </svg>
      )
    default:
      return null
  }
}

function ModePills() {
  return (
    <div style={{ display: "flex", gap: "10px" }}>
      {MODES.map((m) => {
        const mode = TRANSIT_MODES[m.key]
        return (
          <div
            key={m.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              color: mode.color,
              fontSize: "14px",
              fontWeight: 500,
            }}
          >
            <ModeIcon icon={m.icon} />
            <span>{mode.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function BandLegend() {
  return (
    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
      {BAND_COLORS.map((color, i) => (
        <div
          key={color}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <div
            style={{
              width: "24px",
              height: "4px",
              borderRadius: "2px",
              background: color,
              display: "flex",
            }}
          />
          <span
            style={{
              fontSize: "13px",
              color: "#94a3b8",
              fontFeatureSettings: '"tnum"',
              display: "flex",
            }}
          >
            {BAND_LABELS[i]}
          </span>
        </div>
      ))}
    </div>
  )
}

const ogShell: React.CSSProperties = {
  width: "1200px",
  height: "630px",
  display: "flex",
  flexDirection: "column",
  background: "#f8fafc",
  padding: "64px 72px",
  fontFamily: "Inter, system-ui, sans-serif",
  color: "#0f172a",
  position: "relative",
  overflow: "hidden",
}

const zFront: React.CSSProperties = { position: "relative", zIndex: 1 }

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      <div
        style={{
          fontSize: "12px",
          color: "#94a3b8",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          display: "flex",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "18px",
          color: "#475569",
          fontFeatureSettings: '"tnum"',
          display: "flex",
        }}
      >
        {value}
      </div>
    </div>
  )
}

function CoordsTopBar() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "auto",
        ...zFront,
      }}
    >
      <div
        style={{
          fontSize: "28px",
          fontWeight: 700,
          letterSpacing: "-0.03em",
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <div
          style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            background: "#1a7a52",
            display: "flex",
          }}
        />
        Doseg
      </div>
      <div style={{ display: "flex" }}>
        <ModePills />
      </div>
    </div>
  )
}

function FallbackImage() {
  return (
    <div style={ogShell}>
      <IsochroneIllustration />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "center",
          maxWidth: "560px",
          ...zFront,
        }}
      >
        <div style={{ fontSize: "68px", fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1, display: "flex" }}>
          Doseg
        </div>
        <div style={{ fontSize: "26px", color: "#64748b", lineHeight: 1.4, marginTop: "16px", display: "flex" }}>
          Karta dosega javnog prijevoza u Zagrebu
        </div>
        <div style={{ marginTop: "28px", display: "flex" }}><ModePills /></div>
        <div style={{ marginTop: "20px", display: "flex" }}><BandLegend /></div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", ...zFront }}>
        <div style={{ fontSize: "15px", color: "#cbd5e1", display: "flex" }}>doseg.hr</div>
      </div>
    </div>
  )
}

function CoordsContent({
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
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "560px", ...zFront }}>
      <div style={{ fontSize: "60px", fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1, display: "flex" }}>
        {district ? district.name : "Zagreb"}
      </div>

      {district && district.score > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div
            style={{
              background: scoreColor(district.score),
              borderRadius: "10px",
              padding: "5px 14px",
              fontSize: "22px",
              fontWeight: 700,
              color: "white",
              display: "flex",
            }}
          >
            {district.score}/100
          </div>
          <div style={{ fontSize: "18px", color: "#94a3b8", display: "flex" }}>
            #{district.rank} od 17 četvrti
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "28px", marginTop: "4px" }}>
        <MetaField label="Koordinate" value={formatCoords(lat, lon)} />
        {timeStr && <MetaField label="Polazak" value={formatTime(timeStr)} />}
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
    <div style={ogShell}>
      <IsochroneIllustration />
      <CoordsTopBar />
      <CoordsContent district={district} lat={lat} lon={lon} timeStr={timeStr} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "auto", ...zFront }}>
        <div style={{ fontSize: "14px", color: "#cbd5e1", display: "flex" }}>doseg.hr</div>
        <BandLegend />
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
