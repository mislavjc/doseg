import type { ReactNode } from "react"

import { SiteNav } from "@/app/statistika/editorial/site-nav"
import { TRANSPARENT_PX } from "@/lib/constants"
import { boundaryLabel } from "@/lib/geo"
import type { Ring } from "@/lib/geo"
import type { LineHeroCrop, LineHeroMeta } from "@/lib/line-data"
import { cn } from "@/lib/utils"

/**
 * Dithered hero band shared by the line / stop / kvart pages and the city
 * banner: one aspect-locked frame per breakpoint crop, the cloud fade, and the
 * contained site nav on top. Each page renders its own overlay inside the
 * frame.
 */

type HeroVariant = "desktop" | "mobile"

/**
 * Art-directed hero bitmap. Fetches only the crop matching the current
 * breakpoint (a phone never downloads the desktop PNG and vice versa) and
 * flags it high priority since the hero is the pSEO page's LCP element.
 */
export function HeroPicture({
  src,
  alt,
  variant,
}: {
  src: string
  alt: string
  variant: HeroVariant
}) {
  return (
    <picture>
      <source
        media={
          variant === "mobile" ? "(max-width: 639.98px)" : "(min-width: 640px)"
        }
        srcSet={src}
      />
      <img
        src={TRANSPARENT_PX}
        alt={alt}
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover"
      />
    </picture>
  )
}

export function HeroFrame({
  crop,
  className,
  picture,
  children,
}: {
  crop: LineHeroCrop
  className: string
  picture: ReactNode
  children: ReactNode
}) {
  return (
    <div
      className={cn("relative w-full overflow-clip", className)}
      style={{ aspectRatio: `${crop.width} / ${crop.height}` }}
    >
      {picture}
      {/* oxlint-disable-next-line nextjs/no-img-element -- decorative pre-dithered PNG; next/image would resample the dither */}
      <img
        src="/hero-cloud.png"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover [image-rendering:pixelated]"
      />
      {children}
    </div>
  )
}

export function HeroSvg({
  viewW,
  viewH,
  children,
}: {
  viewW: number
  viewH: number
  children: ReactNode
}) {
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${viewW} ${viewH}`}
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
    >
      {children}
    </svg>
  )
}

/** One breakpoint's crop, its frame classes, and its overlay viewBox (SVG
 *  units = css pixels of the 1x band; the asset is @2x). */
export interface HeroSlice {
  crop: LineHeroCrop
  variant: HeroVariant
  className: string
  viewW: number
  viewH: number
}

export function HeroBand({
  meta,
  nav,
  emptyClassName,
  children,
}: {
  meta: LineHeroMeta | null
  nav?: string
  emptyClassName?: string
  children: (slice: HeroSlice) => ReactNode
}) {
  const slice = (crop: LineHeroCrop, variant: HeroVariant, className: string) =>
    children({
      crop,
      variant,
      className,
      viewW: crop.width / 2,
      viewH: crop.height / 2,
    })
  return (
    <header className="relative bg-white">
      {/* Crop swap at Tailwind `sm` (640px) — the contract with the bake
          scripts: desktop crop is sized for ≥640px viewports, mobile below. */}
      {meta ? (
        <>
          {slice(meta.desktop, "desktop", "hidden sm:block")}
          {slice(meta.mobile, "mobile", "sm:hidden")}
        </>
      ) : (
        <div className={emptyClassName} />
      )}
      <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)_+_18px)] z-10 flex w-full justify-center px-4 sm:px-16">
        <SiteNav active={nav} />
      </div>
    </header>
  )
}

/** Boundary ring outlined with the white-halo-under-blue stroke plus a blue
 *  name badge (kvart hero, city banner). */
export function BoundaryOverlay({
  ring,
  crop,
  viewW,
  viewH,
  label,
  anchor,
}: {
  ring: Ring
  crop: LineHeroCrop
  viewW: number
  viewH: number
  label: string
  anchor: "centroid" | "bottom"
}) {
  const { path, box } = boundaryLabel(ring, crop, viewW, viewH, label, anchor)
  if (!path) {
    return null
  }
  return (
    <HeroSvg viewW={viewW} viewH={viewH}>
      <path
        d={path}
        fill="var(--zg-blue)"
        fillOpacity={0.08}
        stroke="var(--ground)"
        strokeWidth={6}
        strokeLinejoin="round"
      />
      <path
        d={path}
        fill="none"
        stroke="var(--zg-blue)"
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        fill="var(--zg-blue)"
      />
      <text
        x={box.x + box.w / 2}
        y={box.y + box.h / 2 + 5.5}
        textAnchor="middle"
        fontSize={16}
        fontWeight={700}
        fontFamily="var(--font-heros), system-ui, sans-serif"
        fill="var(--ground)"
      >
        {label}
      </text>
    </HeroSvg>
  )
}
