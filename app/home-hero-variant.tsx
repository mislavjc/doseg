import {
  BoundaryOverlay,
  HeroFrame,
  HeroPicture,
} from "@/components/dither-hero"
import type { HeroSlice } from "@/components/dither-hero"
import { projector } from "@/lib/geo"
import type { HomeHeroData } from "@/lib/home-hero"

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
  slice: { crop, variant, className, viewW, viewH },
  focus,
}: {
  hero: HomeHeroData
  slice: HeroSlice
  focus?: HeroFocus | null
}) {
  // Zoom origin: the focused address projected into the crop, as percentages
  // so the CSS needs no pixel math. Scaling about that origin keeps the point
  // fixed on screen, which is also where the marker sits.
  const [fx, fy] = focus
    ? projector(crop, viewW, viewH)(focus.lon, focus.lat)
    : [0, 0]
  const focusLeft = clampPct((fx / viewW) * 100)
  const focusTop = clampPct((fy / viewH) * 100)

  return (
    <HeroFrame
      crop={crop}
      className={className}
      picture={
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
          <HeroPicture
            src={
              variant === "mobile" ? "/hero-zagreb-m.png" : "/hero-zagreb.png"
            }
            alt="Karta Zagreba s granicom grada"
            variant={variant}
          />
        </div>
      }
    >
      {!focus && (
        <BoundaryOverlay
          ring={hero.boundary}
          crop={crop}
          viewW={viewW}
          viewH={viewH}
          label="Zagreb"
          anchor="bottom"
        />
      )}
      {focus && (
        <span
          className="absolute z-10 block size-3 -translate-x-1/2 -translate-y-1/2 border-2 border-white bg-zg-blue outline outline-1 outline-zg-blue"
          style={{ left: `${focusLeft}%`, top: `${focusTop}%` }}
        />
      )}
    </HeroFrame>
  )
}
