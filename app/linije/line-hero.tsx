import { SiteNav } from "@/app/statistika/editorial/site-nav"
import { HeroPicture } from "@/components/hero-picture"
import { projector } from "@/lib/geo"
import type { LinePageData } from "@/lib/generated/LinePageData"
import type { LineHeroCrop, LineHeroMeta } from "@/lib/line-data"
import { cn } from "@/lib/utils"

/**
 * Line page hero — full-bleed dithered map of the route corridor with the
 * route, stops and terminal labels as an SVG overlay, cloud fade and the
 * contained site nav on top (Paper "Linija 109 — pSEO V1", node 2UIR-0).
 *
 * Two baked crops: landscape (hero-N.png, 24:11) for sm+ and portrait
 * (hero-N-m.png, 6:7) below. Each band keeps its image's exact aspect ratio,
 * so cover-fit never crops — the whole route with both terminals is always
 * visible at any viewport.
 */


/**
 * Shorten a polyline by `trim` units at each end so the route line (and its
 * white casing) stops just short of the terminal dots instead of poking
 * through their rings.
 */
function trimPolyline(
  pts: [number, number][],
  trimStart: number,
  trimEnd: number
): [number, number][] {
  const cut = (points: [number, number][], trim: number): [number, number][] => {
    let remaining = trim
    const out = [...points]
    while (out.length > 1) {
      const [ax, ay] = out[0]
      const [bx, by] = out[1]
      const seg = Math.hypot(bx - ax, by - ay)
      if (seg > remaining) {
        const t = remaining / seg
        out[0] = [ax + (bx - ax) * t, ay + (by - ay) * t]
        return out
      }
      remaining -= seg
      out.shift()
    }
    return out
  }
  const total = pts
    .slice(1)
    .reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0)
  if (total <= (trimStart + trimEnd) * 2) return pts
  const fromStart = cut(pts, trimStart)
  return cut(fromStart.reverse(), trimEnd).reverse()
}

interface Box {
  bx: number
  by: number
  w: number
  h: number
}

/** Points every ~8 units along the polyline, for label hit-testing. */
function densify(pts: [number, number][], step = 8): [number, number][] {
  const out: [number, number][] = []
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1]
    const [bx, by] = pts[i]
    const seg = Math.hypot(bx - ax, by - ay)
    const n = Math.max(1, Math.ceil(seg / step))
    for (let k = 0; k < n; k++) {
      out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n])
    }
  }
  if (pts.length) out.push(pts[pts.length - 1])
  return out
}

/**
 * Pick the label position around a terminal dot that covers no part of the
 * route (or as little as possible): candidates beside/above/below the dot,
 * scored by route-sample hits inside the box, with earlier candidates
 * preferred on ties. Obstacles (the other label, dots) count as hits too.
 */
function placeLabel(
  x: number,
  y: number,
  w: number,
  h: number,
  viewW: number,
  viewH: number,
  routeSamples: [number, number][],
  obstacles: Box[]
): Box {
  const gap = 16
  const candidates: [number, number][] = [
    [x + gap, y - h / 2], // right
    [x - w - gap, y - h / 2], // left
    [x - w / 2, y - h - 14], // above
    [x - w / 2, y + 14], // below
    [x + 12, y - h - 10], // upper right
    [x - w - 12, y - h - 10], // upper left
    [x + 12, y + 10], // lower right
    [x - w - 12, y + 10], // lower left
  ]
  const margin = 6
  let best: Box = { bx: 0, by: 0, w, h }
  let bestScore = Infinity
  candidates.forEach(([cx, cy], rank) => {
    const bx = Math.min(Math.max(cx, 8), viewW - w - 8)
    const by = Math.min(Math.max(cy, 8), viewH - h - 8)
    const inside = (px: number, py: number) =>
      px > bx - margin && px < bx + w + margin && py > by - margin && py < by + h + margin
    let hits = 0
    for (const [px, py] of routeSamples) if (inside(px, py)) hits++
    for (const o of obstacles) {
      // Treat obstacle boxes as solid: any corner/center overlap counts hard.
      const overlapX = bx < o.bx + o.w + margin && bx + w + margin > o.bx
      const overlapY = by < o.by + o.h + margin && by + h + margin > o.by
      if (overlapX && overlapY) hits += 50
    }
    // Clamping displacement means the candidate didn't really fit there.
    const displaced = Math.abs(bx - cx) + Math.abs(by - cy)
    const score = hits * 100 + displaced * 5 + rank
    if (score < bestScore) {
      bestScore = score
      best = { bx, by, w, h }
    }
  })
  return best
}

function TerminalLabel({
  box,
  name,
  variant,
}: {
  box: Box
  name: string
  variant: "origin" | "destination"
}) {
  const { bx, by, w, h } = box
  const blue = variant === "destination"
  return (
    <g>
      <rect
        x={bx}
        y={by}
        width={w}
        height={h}
        fill={blue ? "var(--zg-blue)" : "#fff"}
        stroke="var(--zg-blue)"
        strokeWidth={1}
      />
      <text
        x={bx + w / 2}
        y={by + h / 2 + 5.5}
        textAnchor="middle"
        fontSize={16}
        fontWeight={700}
        fontFamily="var(--font-heros), system-ui, sans-serif"
        fill={blue ? "#fff" : "var(--ink)"}
      >
        {name}
      </text>
    </g>
  )
}

/** Heros Bold 16 in a 10px-padded box; width approximated from glyph count. */
function labelBoxSize(name: string): { w: number; h: number } {
  return { w: name.length * 8.9 + 20, h: 28 }
}

export interface Overlay {
  path: string
  innerDots: [number, number][]
  first: [number, number]
  last: [number, number]
  boxA: Box
  boxB: Box
}

/** Project the route into view units and lay out dots + labels. Also used by
 * the /api/og line card so the share image matches the hero exactly. */
export function buildOverlay(
  data: LinePageData,
  crop: LineHeroCrop,
  viewW: number,
  viewH: number
): Overlay | null {
  const project = projector(crop, viewW, viewH)
  const dir0 = data.directions[0]

  // Trim so the line stops at the rings: origin dot edge ~8.5, bullseye ~11.5.
  const shapePts = trimPolyline(
    dir0.shape.map(([lon, lat]) => project(lon, lat)),
    11,
    14
  )
  const stopPts = dir0.stops.map((s) => project(s.lon, s.lat))
  const first = stopPts[0]
  const last = stopPts[stopPts.length - 1]
  if (!shapePts.length || !first || !last) return null
  const path = `M ${shapePts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ")}`

  // Thin crowded stop dots: on dense or zoomed-out routes adjacent dots melt
  // into a caterpillar, so keep only dots a minimum gap apart (terminals
  // always stay).
  const MIN_DOT_GAP = 16
  const innerDots: [number, number][] = []
  let prev = first
  for (const p of stopPts.slice(1, -1)) {
    if (
      Math.hypot(p[0] - prev[0], p[1] - prev[1]) >= MIN_DOT_GAP &&
      Math.hypot(p[0] - last[0], p[1] - last[1]) >= MIN_DOT_GAP + 8
    ) {
      innerDots.push(p)
      prev = p
    }
  }

  // Route-aware label placement: never cover the line, the dots, each other,
  // or the site nav band overlaying the top of the hero.
  const routeSamples = densify(shapePts)
  const obstacles: Box[] = [first, last].map(([dx, dy]) => ({
    bx: dx - 12,
    by: dy - 12,
    w: 24,
    h: 24,
  }))
  obstacles.push({
    bx: Math.max(viewW / 2 - 330, 8),
    by: 12,
    w: Math.min(660, viewW - 16),
    h: 62,
  })
  const sizeA = labelBoxSize(data.terminals[0])
  const sizeB = labelBoxSize(data.terminals[1])
  const boxA = placeLabel(first[0], first[1], sizeA.w, sizeA.h, viewW, viewH, routeSamples, obstacles)
  const boxB = placeLabel(last[0], last[1], sizeB.w, sizeB.h, viewW, viewH, routeSamples, [
    ...obstacles,
    boxA,
  ])

  return { path, innerDots, first, last, boxA, boxB }
}

function HeroVariant({
  data,
  crop,
  src,
  variant,
  className,
}: {
  data: LinePageData
  crop: LineHeroCrop
  src: string
  variant: "desktop" | "mobile"
  className?: string
}) {
  // SVG units = css pixels of the 1x band (asset is @2x).
  const viewW = crop.width / 2
  const viewH = crop.height / 2
  const overlay = buildOverlay(data, crop, viewW, viewH)

  return (
    <div
      className={cn("relative w-full overflow-clip", className)}
      style={{ aspectRatio: `${crop.width} / ${crop.height}` }}
    >
      <HeroPicture
        src={src}
        alt={`Karta ${data.mode === "tram" ? "tramvajske" : "autobusne"} linije ${data.broj} u Zagrebu`}
        variant={variant}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/hero-cloud.png"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover [image-rendering:pixelated]"
      />
      {overlay && (
        <svg
          aria-hidden
          viewBox={`0 0 ${viewW} ${viewH}`}
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 h-full w-full"
        >
          <path
            d={overlay.path}
            fill="none"
            stroke="#fff"
            strokeWidth={11}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={overlay.path}
            fill="none"
            stroke="var(--zg-blue)"
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {overlay.innerDots.map(([x, y], i) => (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={4.5}
              fill="#fff"
              stroke="var(--zg-blue)"
              strokeWidth={2.5}
            />
          ))}
          <circle cx={overlay.first[0]} cy={overlay.first[1]} r={7} fill="#fff" stroke="var(--zg-blue)" strokeWidth={3} />
          {/* Destination: blue bullseye — the white gap ring needs a blue
              outer ring to stay legible on the white map ground. */}
          <circle cx={overlay.last[0]} cy={overlay.last[1]} r={10.5} fill="none" stroke="var(--zg-blue)" strokeWidth={2} />
          <circle cx={overlay.last[0]} cy={overlay.last[1]} r={7} fill="var(--zg-blue)" stroke="#fff" strokeWidth={3} />
          <TerminalLabel box={overlay.boxA} name={data.terminals[0]} variant="origin" />
          <TerminalLabel box={overlay.boxB} name={data.terminals[1]} variant="destination" />
        </svg>
      )}
    </div>
  )
}

export function LineHero({
  data,
  meta,
}: {
  data: LinePageData
  meta: LineHeroMeta | null
}) {
  return (
    <header className="relative bg-white">
      {/* Crop swap at Tailwind `sm` (640px) — the contract with the script:
          desktop crop is sized for ≥640px viewports, mobile below (see CROPS
          in scripts/build-line-heroes.ts). */}
      {meta ? (
        <>
          <HeroVariant
            data={data}
            crop={meta.desktop}
            src={`/linije/hero-${data.broj}.png`}
            variant="desktop"
            className="hidden sm:block"
          />
          <HeroVariant
            data={data}
            crop={meta.mobile}
            src={`/linije/hero-${data.broj}-m.png`}
            variant="mobile"
            className="sm:hidden"
          />
        </>
      ) : (
        <div className="h-[180px]" />
      )}
      <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)_+_18px)] z-10 flex w-full justify-center px-4 sm:px-16">
        <SiteNav active="linije" />
      </div>
    </header>
  )
}
