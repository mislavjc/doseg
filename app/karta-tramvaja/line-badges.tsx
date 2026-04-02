import {
  TRAM_LINES,
  STATIONS,
  SPACING,
  EDGES,
  edgeKey,
  type TramLine,
} from "@/lib/zagreb-tram-network"

interface BadgeInfo {
  x: number
  y: number
  angle: number
  lineNumber: string
  color: string
}

function segmentMidpoint(
  line: TramLine,
  segIdx: number,
): { x: number; y: number; angle: number } {
  const aId = line.stationIds[segIdx]
  const bId = line.stationIds[segIdx + 1]
  const key = edgeKey(aId, bId)
  const e = EDGES.get(key)!
  const idx = e.lines.indexOf(line.number)
  const off = (idx - (e.lines.length - 1) / 2) * SPACING

  const sA = STATIONS[aId],
    sB = STATIONS[bId]
  const x1 = sA.x + e.px * off
  const y1 = sA.y + e.py * off
  const x2 = sB.x + e.px * off
  const y2 = sB.y + e.py * off

  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  let angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI

  // Keep text right-side-up
  if (angle > 90) angle -= 180
  if (angle < -90) angle += 180

  return { x: mx, y: my, angle }
}

/** Place badges at first, last, and (for long lines) middle segments. */
function computeAllBadges(): BadgeInfo[] {
  const badges: BadgeInfo[] = []

  for (const line of TRAM_LINES) {
    const segCount = line.stationIds.length - 1
    if (segCount < 1) continue

    const first = segmentMidpoint(line, 0)
    badges.push({ ...first, lineNumber: line.number, color: line.color })

    if (segCount > 1) {
      const last = segmentMidpoint(line, segCount - 1)
      badges.push({ ...last, lineNumber: line.number, color: line.color })
    }

    if (segCount >= 8) {
      const midIdx = Math.floor(segCount / 2)
      const mid = segmentMidpoint(line, midIdx)
      badges.push({ ...mid, lineNumber: line.number, color: line.color })
    }
  }

  return badges
}

const allBadges = computeAllBadges()

const BADGE_W = 20
const BADGE_H = 14
const BADGE_R = 4

export function LineBadges({
  activeLine,
}: {
  activeLine: string | null
}) {
  return (
    <g className="pointer-events-none">
      {allBadges.map((badge, i) => {
        const dimmed = activeLine && badge.lineNumber !== activeLine
        return (
          <g
            key={`${badge.lineNumber}-${i}`}
            transform={`translate(${badge.x}, ${badge.y}) rotate(${badge.angle})`}
            opacity={dimmed ? 0.1 : 1}
            className="transition-opacity duration-200"
          >
            <rect
              x={-BADGE_W / 2}
              y={-BADGE_H / 2}
              width={BADGE_W}
              height={BADGE_H}
              rx={BADGE_R}
              fill={badge.color}
            />
            <text
              x={0}
              y={0}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={9}
              fontWeight={700}
              fontFamily="var(--font-sans), system-ui, sans-serif"
              fill="white"
            >
              {badge.lineNumber}
            </text>
          </g>
        )
      })}
    </g>
  )
}
