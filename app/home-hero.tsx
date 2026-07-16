import { SiteNav } from "@/app/statistika/editorial/site-nav"
import { HeroPicture } from "@/components/hero-picture"
import { mercatorY } from "@/lib/geo"
import type { HomeHeroData } from "@/lib/home-hero"
import type { LineHeroCrop } from "@/lib/line-data"
import { cn } from "@/lib/utils"

/**
 * Homepage banner (Paper "Home v2.0 — banner, cijela stranica"): the kvart
 * hero grammar zoomed out to the whole city — baked dither band, the Zagreb
 * boundary outlined with the shared white-halo-under-blue stroke, and the
 * city-name badge sitting on the border. SiteNav floats on top exactly like
 * on the kvart/line/stop pages.
 */

function projector(crop: LineHeroCrop, viewW: number, viewH: number) {
  const yTop = mercatorY(crop.north)
  const yBottom = mercatorY(crop.south)
  return (lon: number, lat: number): [number, number] => [
    ((lon - crop.west) / (crop.east - crop.west)) * viewW,
    ((mercatorY(lat) - yTop) / (yBottom - yTop)) * viewH,
  ]
}

function HomeHeroVariant({
  hero,
  crop,
  src,
  variant,
  className,
}: {
  hero: HomeHeroData
  crop: LineHeroCrop
  src: string
  variant: "desktop" | "mobile"
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
  return (
    <div
      className={cn("relative w-full overflow-clip", className)}
      style={{ aspectRatio: `${crop.width} / ${crop.height}` }}
    >
      <HeroPicture src={src} alt="Karta Zagreba s granicom grada" variant={variant} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/hero-cloud.png"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover [image-rendering:pixelated]"
      />
      {path && (
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
    </div>
  )
}

export function HomeHero({ hero }: { hero: HomeHeroData | null }) {
  return (
    <header className="relative bg-white">
      {hero ? (
        <>
          <HomeHeroVariant
            hero={hero}
            crop={hero.desktop}
            src="/hero-zagreb.png"
            variant="desktop"
            className="hidden sm:block"
          />
          <HomeHeroVariant
            hero={hero}
            crop={hero.mobile}
            src="/hero-zagreb-m.png"
            variant="mobile"
            className="sm:hidden"
          />
        </>
      ) : (
        // No baked banner (fresh checkout before the hero bake) — plain nav row.
        <div className="h-[120px]" />
      )}
      <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)_+_18px)] z-10 flex w-full justify-center px-4 sm:px-16">
        <SiteNav />
      </div>
    </header>
  )
}
