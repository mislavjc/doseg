import { HeroPicture } from "@/components/hero-picture"
import { projector } from "@/lib/geo"
import type { HomeHeroData } from "@/lib/home-hero"
import type { LineHeroCrop } from "@/lib/line-data"
import { cn } from "@/lib/utils"

/**
 * One breakpoint's slice of the city banner. At rest (homepage) it renders the
 * dither band with the Zagreb boundary and badge; given a `focus` point (the
 * /adresa page), the baked bitmap renders pre-scaled about the projected point
 * — the point stays put and carries the marker, the boundary overlay yields.
 * Focus is fixed per page, so this stays a server component: the boundary
 * polygon never ships to the client.
 */

/** Zoom applied about the focused address — shared with the /adresa karta
 *  banner thumb so "same map, same zoom" stays true by construction. */
export const FOCUS_SCALE = 4.5

/** A geocoded point the banner is zoomed to (the /adresa page's address). */
export interface HeroFocus {
  lon: number
  lat: number
}

const clampPct = (v: number) => Math.min(Math.max(v, 3), 97)

export function HomeHeroVariant({
  hero,
  crop,
  src,
  variant,
  focus,
  className,
}: {
  hero: HomeHeroData
  crop: LineHeroCrop
  src: string
  variant: "desktop" | "mobile"
  focus?: HeroFocus | null
  className?: string
}) {
  const viewW = crop.width / 2
  const viewH = crop.height / 2
  const project = projector(crop, viewW, viewH)
  const pts = hero.boundary.map(([lon, lat]) => project(lon, lat))
  const path = pts.length
    ? `M ${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ")} Z`
    : ""
  const cx = pts.reduce((s, p) => s + p[0], 0) / (pts.length || 1)
  const maxY = pts.reduce((s, p) => Math.max(s, p[1]), 0)
  const lw = "Zagreb".length * 8.9 + 20
  const lh = 28
  const lx = Math.min(Math.max(cx - lw / 2, 8), viewW - lw - 8)
  const ly = Math.min(Math.max(maxY - lh / 2, 84), viewH - lh - 8)

  // Zoom origin: the focused address projected into the crop, as percentages
  // so the CSS needs no pixel math. Scaling about that origin keeps the point
  // fixed on screen, which is also where the marker sits.
  const [fx, fy] = focus ? project(focus.lon, focus.lat) : [0, 0]
  const focusLeft = clampPct((fx / viewW) * 100)
  const focusTop = clampPct((fy / viewH) * 100)

  return (
    <div
      className={cn("relative w-full overflow-clip", className)}
      style={{ aspectRatio: `${crop.width} / ${crop.height}` }}
    >
      <div
        className="absolute inset-0"
        style={
          focus
            ? {
                transform: `scale(${FOCUS_SCALE})`,
                transformOrigin: `${focusLeft}% ${focusTop}%`,
                imageRendering: "pixelated",
              }
            : undefined
        }
      >
        <HeroPicture src={src} alt="Karta Zagreba s granicom grada" variant={variant} />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/hero-cloud.png"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover [image-rendering:pixelated]"
      />
      {!focus && path && (
        <svg
          aria-hidden
          viewBox={`0 0 ${viewW} ${viewH}`}
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 h-full w-full"
        >
          <path d={path} fill="var(--zg-blue)" fillOpacity={0.08} stroke="#fff" strokeWidth={6} strokeLinejoin="round" />
          <path d={path} fill="none" stroke="var(--zg-blue)" strokeWidth={3} strokeLinejoin="round" />
          <rect x={lx} y={ly} width={lw} height={lh} fill="var(--zg-blue)" />
          <text
            x={lx + lw / 2}
            y={ly + lh / 2 + 5.5}
            textAnchor="middle"
            fontSize={16}
            fontWeight={700}
            fontFamily="var(--font-heros), system-ui, sans-serif"
            fill="#fff"
          >
            Zagreb
          </text>
        </svg>
      )}
      {focus && (
        <span
          className="absolute z-10 block size-3 -translate-x-1/2 -translate-y-1/2 border-2 border-white bg-zg-blue outline outline-1 outline-zg-blue"
          style={{ left: `${focusLeft}%`, top: `${focusTop}%` }}
        />
      )}
    </div>
  )
}
