import { ImageResponse } from "next/og"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ISOCHRONE_COLORS, scoreColor } from "@/lib/transit"

export const runtime = "nodejs"
export const alt = "Statistika dostupnosti javnog prijevoza u Zagrebu"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

type District = {
  name: string
  score: number
  rank: number
}

type DistrictScores = {
  districts: District[]
}

let cachedScores: DistrictScores | null = null

function loadScores(): DistrictScores | null {
  if (cachedScores) return cachedScores
  try {
    cachedScores = JSON.parse(
      readFileSync(join(process.cwd(), "data/district-scores.json"), "utf-8")
    )
    return cachedScores
  } catch {
    return null
  }
}

const [a, b, c, d] = ISOCHRONE_COLORS
const gradient = `linear-gradient(to right, ${a}, ${b}, ${c}, ${d})`

function DistrictBar({ d, maxScore }: { d: District; maxScore: number }) {
  const width = Math.max((d.score / maxScore) * 280, 4)
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
      }}
    >
      <div
        style={{
          width: "110px",
          fontSize: "15px",
          color: "#64748b",
          textAlign: "right",
          display: "flex",
          justifyContent: "flex-end",
          flexShrink: 0,
        }}
      >
        {d.name.length > 14 ? d.name.slice(0, 13) + "…" : d.name}
      </div>
      <div
        style={{
          width: `${width}px`,
          height: "18px",
          borderRadius: "4px",
          background: scoreColor(d.score),
          display: "flex",
          flexShrink: 0,
        }}
      />
      <div
        style={{
          fontSize: "15px",
          fontWeight: 600,
          color: "#0f172a",
          display: "flex",
          fontFeatureSettings: '"tnum"',
        }}
      >
        {d.score}
      </div>
    </div>
  )
}

function DistrictHighlight({
  label,
  d,
}: {
  label: string
  d: District
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      <div style={{ fontSize: "12px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", display: "flex" }}>
        {label}
      </div>
      <div style={{ fontSize: "18px", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
        {d.name}
        <span style={{ fontSize: "14px", color: scoreColor(d.score), fontWeight: 700, display: "flex" }}>
          {d.score}
        </span>
      </div>
    </div>
  )
}

function LeftPanel({ best, worst }: { best?: District; worst?: District }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", padding: "64px 0 64px 72px", width: "520px", justifyContent: "center", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px" }}>
        <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#22c55e", display: "flex" }} />
        <div style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-0.02em", display: "flex" }}>Doseg</div>
        <div style={{ width: "1px", height: "16px", background: "#e2e8f0", display: "flex", marginLeft: "4px", marginRight: "4px" }} />
        <div style={{ fontSize: "16px", color: "#94a3b8", display: "flex" }}>Statistika</div>
      </div>

      <div style={{ fontSize: "44px", fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1.1, display: "flex", flexDirection: "column" }}>
        <span style={{ display: "flex" }}>Povezanost</span>
        <span style={{ display: "flex" }}>četvrti</span>
      </div>

      <div style={{ fontSize: "18px", color: "#64748b", lineHeight: 1.5, marginTop: "16px", display: "flex" }}>
        17 gradskih četvrti, rangirano po dostupnosti javnim prijevozom
      </div>

      {best && worst && (
        <div style={{ display: "flex", gap: "24px", marginTop: "28px" }}>
          <DistrictHighlight label="Najbolja" d={best} />
          <DistrictHighlight label="Najslabija" d={worst} />
        </div>
      )}

      <div style={{ display: "flex", marginTop: "28px", width: "100px", height: "4px", borderRadius: "999px", background: gradient }} />
    </div>
  )
}

function RightPanel({ top, maxScore, remaining }: { top: District[]; maxScore: number; remaining: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: "10px", padding: "64px 72px 64px 40px", flex: 1 }}>
      {top.map((d) => (
        <DistrictBar key={d.name} d={d} maxScore={maxScore} />
      ))}
      {remaining > 0 && (
        <div style={{ display: "flex", marginLeft: "122px", fontSize: "14px", color: "#94a3b8", marginTop: "4px" }}>
          + {remaining} četvrti
        </div>
      )}
    </div>
  )
}

export default function Image() {
  const data = loadScores()
  const districts = data?.districts ?? []
  const sorted = [...districts].sort((a, b) => a.rank - b.rank)
  const top = sorted.slice(0, 8)
  const maxScore = top[0]?.score ?? 100

  return new ImageResponse(
    (
      <div style={{ width: "1200px", height: "630px", display: "flex", background: "#f8fafc", fontFamily: "Inter, system-ui, sans-serif", color: "#0f172a", position: "relative", overflow: "hidden" }}>
        <LeftPanel best={sorted[0]} worst={sorted[sorted.length - 1]} />
        <RightPanel top={top} maxScore={maxScore} remaining={sorted.length - 8} />
      </div>
    ),
    { ...size }
  )
}
