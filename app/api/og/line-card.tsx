import { ImageResponse } from "next/og"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { buildOverlay } from "@/app/linije/line-hero"
import { clockTime } from "@/app/linije/copy"
import type { LinePageData } from "@/lib/generated/LinePageData"
import { loadHeroMeta } from "@/lib/line-data"

// Editorial tokens (globals.css), mirrored — satori can't resolve CSS vars.
const INK = "#0a0a0a" // --ink
const INK_MUTED = "#6a7178" // --ink-muted
const ZG_BLUE = "#0e51c9" // --zg-blue

const ASSETS_DIR = join(process.cwd(), "app/api/og/assets")

/** The hero band's intrinsic 1x size — overlay coordinates live in this space. */
const VIEW_W = 1440
const VIEW_H = 660

/** Map window of the card (Paper "OG linija — V3 bijela traka"). */
const MAP_H = 470
const BAND_H = 160

/**
 * Route overlay as a data-URI SVG. Geometry only — text would need fonts at
 * SVG-raster time, so all type is satori-rendered. Strokes are slightly
 * heavier than the page hero: at OG size the route carries the image.
 */
function overlaySvg(data: LinePageData): string | null {
  const meta = loadHeroMeta(data.broj)
  if (!meta) return null
  const overlay = buildOverlay(data, meta.desktop, VIEW_W, VIEW_H)
  if (!overlay) return null
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

function loadFonts() {
  return {
    geistMono: readFileSync(join(ASSETS_DIR, "GeistMono-Regular.ttf")),
    herosBold: readFileSync(join(ASSETS_DIR, "TeXGyreHeros-Bold.ttf")),
  }
}

// The full 1200×630 map layer sits vertically centred inside the 1200×470
// window: offset by (630-470)/2 = 80px, matching the Paper clone offset.
const MAP_LAYER = {
  position: "absolute" as const,
  top: `${-(630 - MAP_H) / 2}px`,
  left: "0px",
  width: "1200px",
  height: "630px",
  objectFit: "cover" as const,
}

/** Map window: hero PNG + cloud fade + route overlay, cover-cropped. */
function MapWindow({ data }: { data: LinePageData }) {
  const heroPath = join(process.cwd(), "public/linije", `hero-${data.broj}.png`)
  const heroSrc = `data:image/png;base64,${readFileSync(heroPath).toString("base64")}`
  const cloudPath = join(process.cwd(), "public/hero-cloud.png")
  const cloudSrc = existsSync(cloudPath)
    ? `data:image/png;base64,${readFileSync(cloudPath).toString("base64")}`
    : null
  const routeSrc = overlaySvg(data)
  return (
    <div
      style={{
        position: "relative",
        width: "1200px",
        height: `${MAP_H}px`,
        display: "flex",
        overflow: "hidden",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={heroSrc} alt="" style={MAP_LAYER} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {cloudSrc && <img src={cloudSrc} alt="" style={MAP_LAYER} />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {routeSrc && <img src={routeSrc} alt="" style={MAP_LAYER} />}
    </div>
  )
}

/** White info band: breadcrumb, headline, service facts (Paper V3). */
function InfoBand({ data }: { data: LinePageData }) {
  const peak = data.stats.peakHeadwayMin
  const facts = [
    peak ? `u špici svakih ${Math.round(peak)} min` : null,
    `${clockTime(data.stats.firstDeparture)} - ${clockTime(data.stats.lastDeparture)}`,
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <div
      style={{
        width: "1200px",
        height: `${BAND_H}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: "8px",
        backgroundColor: "#ffffff",
        borderTop: `2px solid ${ZG_BLUE}`,
        padding: "0 56px",
      }}
    >
      <div
        style={{
          fontFamily: "Geist Mono",
          fontSize: "24px",
          lineHeight: "32px",
          letterSpacing: "0.96px",
          color: ZG_BLUE,
          display: "flex",
        }}
      >
        doseg.hr / sve linije / linija {data.broj} · vozni red
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          width: "1088px",
        }}
      >
        <div
          style={{
            fontFamily: "TeX Gyre Heros",
            fontSize: "32px",
            fontWeight: 700,
            lineHeight: "44px",
            color: INK,
            display: "flex",
          }}
        >
          Linija {data.broj}: {data.terminals[0]} - {data.terminals[1]}
        </div>
        <div
          style={{
            fontFamily: "Geist Mono",
            fontSize: "24px",
            lineHeight: "38px",
            color: INK_MUTED,
            display: "flex",
          }}
        >
          {facts}
        </div>
      </div>
    </div>
  )
}

/**
 * Per-line OG card — Paper "OG linija — V3 bijela traka": the route-corridor
 * map on top, a white info band below with breadcrumb, headline and service
 * facts. Type follows the 16/12 system at @2x: Heros Bold 32/44 + Geist Mono
 * 24/32, hierarchy from weight and colour only.
 */
export function renderLineOgCard(data: LinePageData): ImageResponse | null {
  const heroPath = join(process.cwd(), "public/linije", `hero-${data.broj}.png`)
  if (!existsSync(heroPath)) return null
  const fonts = loadFonts()

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#ffffff",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <MapWindow data={data} />
        <InfoBand data={data} />
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Geist Mono", data: fonts.geistMono, weight: 400, style: "normal" },
        { name: "TeX Gyre Heros", data: fonts.herosBold, weight: 700, style: "normal" },
      ],
    }
  )
}
