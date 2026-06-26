import { SiteNav } from "@/app/statistika/editorial/site-nav"
import { mercatorX, mercatorY } from "@/lib/geo"
import type { StopPageData } from "@/lib/generated/StopPageData"
import type { LineHeroCrop, LineHeroMeta } from "@/lib/line-data"

/**
 * Stop page hero — a zoomed map of the junction with the serving-line corridors,
 * the stop marked with a bullseye, and the to/from neighbour points, all as an
 * SVG overlay (Paper "Stanica Reljkovićeva — pSEO V1", node 32LD-0). The dithered
 * blue-on-white ground is a baked crop (scripts/build-stop-heroes.ts) when one
 * exists; otherwise the overlay sits on plain white. The overlay is built from
 * the committed `data.hero` geometry, so it always shows the real position even
 * before the map is baked.
 *
 * Geometry mirrors app/linije/line-hero.tsx: x interpolates raw lon (≈ mercator
 * over a ~700m window), y uses mercatorY.
 */

const DESKTOP = { w: 2880, h: 1120 }
const MOBILE = { w: 1500, h: 1180 }

function invMercX(mx: number): number {
  return mx * 360 - 180
}
function invMercY(my: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180) / Math.PI
}

/** Fit a crop of aspect outW:outH around the geometry bbox (no tiles needed),
 *  used when no baked map exists for this stop. */
function cropFromBbox(
  bbox: number[],
  outW: number,
  outH: number
): LineHeroCrop {
  const [w, s, e, n] = bbox
  const x0 = mercatorX(w)
  const x1 = mercatorX(e)
  const y0 = mercatorY(n)
  const y1 = mercatorY(s)
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const pad = 1.18
  let spanX = (x1 - x0) * pad
  let spanY = (y1 - y0) * pad
  const target = outW / outH
  if (spanX / spanY < target) spanX = spanY * target
  else spanY = spanX / target
  return {
    west: invMercX(cx - spanX / 2),
    east: invMercX(cx + spanX / 2),
    north: invMercY(cy - spanY / 2),
    south: invMercY(cy + spanY / 2),
    width: outW,
    height: outH,
    zoom: 0,
  }
}

function projector(crop: LineHeroCrop, viewW: number, viewH: number) {
  const yTop = mercatorY(crop.north)
  const yBottom = mercatorY(crop.south)
  return (lon: number, lat: number): [number, number] => [
    ((lon - crop.west) / (crop.east - crop.west)) * viewW,
    ((mercatorY(lat) - yTop) / (yBottom - yTop)) * viewH,
  ]
}

function path(shape: [number, number][], project: (lon: number, lat: number) => [number, number]): string {
  const pts = shape.map(([lon, lat]) => project(lon, lat))
  return `M ${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ")}`
}

function StopHeroVariant({
  data,
  crop,
  src,
  className,
}: {
  data: StopPageData
  crop: LineHeroCrop
  src: string | null
  className?: string
}) {
  const viewW = crop.width / 2
  const viewH = crop.height / 2
  const project = projector(crop, viewW, viewH)
  const [sx, sy] = project(data.lon, data.lat)
  const lines = data.hero.lines.filter((l) => l.shape.length >= 2)

  return (
    <div
      className={className}
      style={{ position: "relative", width: "100%", aspectRatio: `${crop.width} / ${crop.height}`, overflow: "hidden", background: "#fff" }}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`Karta stanice ${data.name} u Zagrebu`} className="absolute inset-0 h-full w-full object-cover" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/hero-cloud.png"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover [image-rendering:pixelated]"
      />
      <svg
        aria-hidden
        viewBox={`0 0 ${viewW} ${viewH}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        {/* White casing under every corridor first, then the blue lines on top,
            so casings never cut across a neighbouring line. */}
        {lines.map((l) => (
          <path
            key={`c-${l.broj}`}
            d={path(l.shape as [number, number][], project)}
            fill="none"
            stroke="#fff"
            strokeWidth={9}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {lines.map((l) => (
          <path
            key={`l-${l.broj}`}
            d={path(l.shape as [number, number][], project)}
            fill="none"
            stroke="var(--zg-blue)"
            strokeWidth={4.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {/* The stop itself — blue bullseye */}
        <circle cx={sx} cy={sy} r={13} fill="none" stroke="var(--zg-blue)" strokeWidth={2.5} />
        <circle cx={sx} cy={sy} r={8.5} fill="var(--zg-blue)" stroke="#fff" strokeWidth={3.5} />
      </svg>

      {/* Stop name label, anchored above the marker */}
      <span
        className="absolute z-[1] bg-zg-blue px-3 py-1 font-mono text-[15px] leading-5 text-white"
        style={{
          left: `${(sx / viewW) * 100}%`,
          top: `${(sy / viewH) * 100}%`,
          transform: "translate(-50%, calc(-100% - 18px))",
          whiteSpace: "nowrap",
        }}
      >
        {data.name}
      </span>
    </div>
  )
}

export function StopHero({
  data,
  meta,
}: {
  data: StopPageData
  meta: LineHeroMeta | null
}) {
  // Baked dither crop when available, else project the overlay onto a plain
  // white crop fitted to the geometry bbox.
  const desktopCrop = meta?.desktop ?? cropFromBbox(data.hero.bbox, DESKTOP.w, DESKTOP.h)
  const mobileCrop = meta?.mobile ?? cropFromBbox(data.hero.bbox, MOBILE.w, MOBILE.h)
  const desktopSrc = meta ? `/stanice/hero-${data.slug}.png` : null
  const mobileSrc = meta ? `/stanice/hero-${data.slug}-m.png` : null

  return (
    <header className="relative bg-white">
      <StopHeroVariant data={data} crop={desktopCrop} src={desktopSrc} className="hidden sm:block" />
      <StopHeroVariant data={data} crop={mobileCrop} src={mobileSrc} className="sm:hidden" />
      <div className="absolute inset-x-0 top-[18px] z-10 flex w-full justify-center px-4 sm:px-16">
        <SiteNav active="stanice" />
      </div>
    </header>
  )
}
