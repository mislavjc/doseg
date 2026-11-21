import {
  HeroBand,
  HeroFrame,
  HeroPicture,
  HeroSvg,
} from "@/components/dither-hero"
import type { HeroSlice } from "@/components/dither-hero"
import { mercatorX, mercatorY, projector } from "@/lib/geo"
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
  bbox: Array<number>,
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
  if (spanX / spanY < target) {
    spanX = spanY * target
  } else {
    spanY = spanX / target
  }
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

function path(
  shape: Array<[number, number]>,
  project: (lon: number, lat: number) => [number, number]
): string {
  const pts = shape.map(([lon, lat]) => project(lon, lat))
  return `M ${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ")}`
}

function StopOverlay({
  lines,
  project,
  sx,
  sy,
  viewW,
  viewH,
}: {
  lines: StopPageData["hero"]["lines"]
  project: (lon: number, lat: number) => [number, number]
  sx: number
  sy: number
  viewW: number
  viewH: number
}) {
  return (
    <HeroSvg viewW={viewW} viewH={viewH}>
      {/* White casing under every corridor first, then the blue lines on top,
        so casings never cut across a neighbouring line. */}
      {lines.map((l) => (
        <path
          key={`c-${l.broj}`}
          d={path(l.shape, project)}
          fill="none"
          stroke="var(--ground)"
          strokeWidth={9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {lines.map((l) => (
        <path
          key={`l-${l.broj}`}
          d={path(l.shape, project)}
          fill="none"
          stroke="var(--zg-blue)"
          strokeWidth={4.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {/* The stop itself — blue bullseye */}
      <circle
        cx={sx}
        cy={sy}
        r={13}
        fill="none"
        stroke="var(--zg-blue)"
        strokeWidth={2.5}
      />
      <circle
        cx={sx}
        cy={sy}
        r={8.5}
        fill="var(--zg-blue)"
        stroke="var(--ground)"
        strokeWidth={3.5}
      />
    </HeroSvg>
  )
}

function StopHeroVariant({
  data,
  baked,
  slice: { crop, variant, className, viewW, viewH },
}: {
  data: StopPageData
  baked: boolean
  slice: HeroSlice
}) {
  const project = projector(crop, viewW, viewH)
  const [sx, sy] = project(data.lon, data.lat)
  const lines = data.hero.lines.filter((l) => l.shape.length >= 2)
  const suffix = variant === "mobile" ? "-m" : ""

  return (
    <HeroFrame
      crop={crop}
      className={className}
      picture={
        baked && (
          <HeroPicture
            src={`/stanice/hero-${data.slug}${suffix}.png`}
            alt={`Karta stanice ${data.name} u Zagrebu`}
            variant={variant}
          />
        )
      }
    >
      <StopOverlay
        lines={lines}
        project={project}
        sx={sx}
        sy={sy}
        viewW={viewW}
        viewH={viewH}
      />

      {/* Stop name label, anchored above the marker */}
      <span
        className="absolute z-[1] bg-zg-blue px-3 py-1 font-mono text-label text-white"
        style={{
          left: `${(sx / viewW) * 100}%`,
          top: `${(sy / viewH) * 100}%`,
          transform: "translate(-50%, calc(-100% - 18px))",
          whiteSpace: "nowrap",
        }}
      >
        {data.name}
      </span>
    </HeroFrame>
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
  const crops = meta ?? {
    desktop: cropFromBbox(data.hero.bbox, DESKTOP.w, DESKTOP.h),
    mobile: cropFromBbox(data.hero.bbox, MOBILE.w, MOBILE.h),
  }
  return (
    <HeroBand meta={crops} nav="stanice">
      {(slice) => (
        <StopHeroVariant data={data} baked={meta !== null} slice={slice} />
      )}
    </HeroBand>
  )
}
