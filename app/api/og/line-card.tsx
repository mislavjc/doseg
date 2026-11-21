import { existsSync } from "node:fs"
import { join } from "node:path"
import type { ImageResponse } from "next/og"

import { buildOverlay } from "@/app/linije/line-hero"
import { serviceSpan } from "@/app/linije/copy"
import type { LinePageData } from "@/lib/generated/LinePageData"
import { loadHeroMeta } from "@/lib/line-data"

import {
  HeroInfoBand,
  HeroMapWindow,
  ZG_BLUE,
  mapLayer,
  renderHeroCard,
} from "./card"

/** The hero band's intrinsic 1x size — overlay coordinates live in this space. */
const VIEW_W = 1440
const VIEW_H = 660

/** Map window of the card (Paper "OG linija — V3 bijela traka"). */
const MAP_H = 470

/**
 * Route overlay as a data-URI SVG. Geometry only — text would need fonts at
 * SVG-raster time, so all type is satori-rendered. Strokes are slightly
 * heavier than the page hero: at OG size the route carries the image.
 */
function overlaySvg(data: LinePageData): string | null {
  const meta = loadHeroMeta(data.broj)
  if (!meta) {
    return null
  }
  const overlay = buildOverlay(data, meta.desktop, VIEW_W, VIEW_H)
  if (!overlay) {
    return null
  }
  const dots = overlay.innerDots
    .map(
      ([x, y]) =>
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5.5" fill="#fff" stroke="${ZG_BLUE}" stroke-width="3"/>`
    )
    .join("")
  const [fx, fy] = overlay.first
  const [lx, ly] = overlay.last
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}">` +
    `<path d="${overlay.path}" fill="none" stroke="#fff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${overlay.path}" fill="none" stroke="${ZG_BLUE}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>` +
    dots +
    `<circle cx="${fx}" cy="${fy}" r="8.5" fill="#fff" stroke="${ZG_BLUE}" stroke-width="3.5"/>` +
    `<circle cx="${lx}" cy="${ly}" r="12.5" fill="none" stroke="${ZG_BLUE}" stroke-width="2.5"/>` +
    `<circle cx="${lx}" cy="${ly}" r="8.5" fill="${ZG_BLUE}" stroke="#fff" stroke-width="3.5"/>` +
    `</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

// The full 1200×630 map layer sits vertically centred inside the 1200×470
// window: offset by (630-470)/2 = 80px, matching the Paper clone offset.
const MAP_LAYER = mapLayer(-(630 - MAP_H) / 2, 630)

/**
 * Per-line OG card — Paper "OG linija — V3 bijela traka": the route-corridor
 * map on top, a white info band below with breadcrumb, headline and service
 * facts. Type follows the 16/12 system at @2x: Heros Bold 32/44 + Geist Mono
 * 24/32, hierarchy from weight and colour only.
 */
export function renderLineOgCard(data: LinePageData): ImageResponse | null {
  const heroPath = join(process.cwd(), "public/linije", `hero-${data.broj}.png`)
  if (!existsSync(heroPath)) {
    return null
  }
  const routeSrc = overlaySvg(data)
  const peak = data.stats.peakHeadwayMin
  const facts = [
    peak !== null && peak !== 0
      ? `u špici svakih ${Math.round(peak)} min`
      : null,
    serviceSpan(data),
  ]
    .filter(Boolean)
    .join(" · ")

  return renderHeroCard(
    <HeroMapWindow heroPath={heroPath} height={MAP_H} layer={MAP_LAYER}>
      {routeSrc && <img src={routeSrc} alt="" style={MAP_LAYER} />}
    </HeroMapWindow>,
    <HeroInfoBand
      crumb={`doseg.hr / sve linije / linija ${data.broj} · vozni red`}
      headline={`Linija ${data.broj}: ${data.terminals[0]} - ${data.terminals[1]}`}
      headlineSize={32}
      facts={facts}
    />
  )
}
