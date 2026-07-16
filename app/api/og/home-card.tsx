import { ImageResponse } from "next/og"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { plural } from "@/app/linije/copy"
import { projector } from "@/lib/geo"
import { loadHomeHero, type HomeHeroData } from "@/lib/home-hero"

// Editorial tokens (globals.css), mirrored — satori can't resolve CSS vars.
const INK = "#0a0a0a" // --ink
const INK_MUTED = "#6a7178" // --ink-muted
const SEPARATOR = "#c9c9c9" // dot separators (Paper OG1e-2)
const ZG_BLUE = "#0e51c9" // --zg-blue

const ASSETS_DIR = join(process.cwd(), "app/api/og/assets")

/** Map window of the card (Paper "OG1e-2 · brojači u liniji"). */
const MAP_H = 456
const RULE_H = 4
const BAND_H = 630 - MAP_H - RULE_H

function loadFonts() {
  return {
    geistMono: readFileSync(join(ASSETS_DIR, "GeistMono-Regular.ttf")),
    herosBold: readFileSync(join(ASSETS_DIR, "TeXGyreHeros-Bold.ttf")),
  }
}

/**
 * Whole-Zagreb boundary as a data-URI SVG in the desktop crop's view space —
 * the same halo-under-blue stroke the homepage hero draws at runtime
 * (home-hero-variant), slightly heavier because at OG size the border carries
 * the image. Geometry only; all type is satori-rendered.
 */
function boundarySvg(hero: HomeHeroData): string {
  const viewW = hero.desktop.width / 2
  const viewH = hero.desktop.height / 2
  const project = projector(hero.desktop, viewW, viewH)
  const pts = hero.boundary.map(([lon, lat]) => project(lon, lat))
  const d = `M ${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ")} Z`
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewW} ${viewH}">` +
    `<path d="${d}" fill="${ZG_BLUE}" fill-opacity="0.08" stroke="#fff" stroke-width="7" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${ZG_BLUE}" stroke-width="3.5" stroke-linejoin="round"/>` +
    `</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

// Hero PNG and boundary SVG share the banner's intrinsic aspect (4.5:1), so an
// identical cover-crop keeps the two layers registered.
const MAP_LAYER = {
  position: "absolute" as const,
  top: "0px",
  left: "0px",
  width: "1200px",
  height: `${MAP_H}px`,
  objectFit: "cover" as const,
}

/** Map window: city dither + cloud fade + boundary + centred Zagreb badge. */
function MapWindow({ hero }: { hero: HomeHeroData }) {
  const heroPath = join(process.cwd(), "public/hero-zagreb.png")
  const heroSrc = `data:image/png;base64,${readFileSync(heroPath).toString("base64")}`
  const cloudPath = join(process.cwd(), "public/hero-cloud.png")
  const cloudSrc = existsSync(cloudPath)
    ? `data:image/png;base64,${readFileSync(cloudPath).toString("base64")}`
    : null
  return (
    <div
      style={{
        position: "relative",
        width: "1200px",
        height: `${MAP_H}px`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={heroSrc} alt="" style={MAP_LAYER} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {cloudSrc && <img src={cloudSrc} alt="" style={MAP_LAYER} />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={boundarySvg(hero)} alt="" style={MAP_LAYER} />
      <div
        style={{
          display: "flex",
          backgroundColor: ZG_BLUE,
          color: "#fff",
          fontFamily: "Geist Mono",
          fontSize: "28px",
          lineHeight: "34px",
          padding: "10px 22px",
        }}
      >
        Zagreb
      </div>
    </div>
  )
}

export interface HomeOgCounts {
  dayLineCount: number
  stopCount: number
  kvartCount: number
}

/** One "value label" pair of the counter line. */
function Counter({ value, label, blue }: { value: string; label: string; blue?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "12px" }}>
      <div
        style={{
          fontFamily: "TeX Gyre Heros",
          fontWeight: 700,
          fontSize: "28px",
          lineHeight: "34px",
          color: blue ? ZG_BLUE : INK,
          display: "flex",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: "Geist Mono",
          fontSize: "24px",
          lineHeight: "33px",
          color: INK_MUTED,
          display: "flex",
        }}
      >
        {label}
      </div>
    </div>
  )
}

/** White band: one-line title + the horizontal brojači line (Paper OG1e-2). */
function InfoBand({ counts }: { counts: HomeOgCounts }) {
  return (
    <div
      style={{
        width: "1200px",
        height: `${BAND_H}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: "16px",
        backgroundColor: "#ffffff",
        padding: "0 56px",
      }}
    >
      <div
        style={{
          fontFamily: "TeX Gyre Heros",
          fontSize: "44px",
          fontWeight: 700,
          lineHeight: "50px",
          color: INK,
          display: "flex",
        }}
      >
        Koliko grada dosežeš javnim prijevozom.
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "12px" }}>
        <Counter value="30 min" label="s bilo koje adrese" blue />
        <div style={{ fontFamily: "Geist Mono", fontSize: "24px", lineHeight: "33px", color: SEPARATOR, display: "flex" }}>·</div>
        <Counter
          value={String(counts.dayLineCount)}
          label={plural(counts.dayLineCount, "linija", "linije", "linija")}
        />
        <div style={{ fontFamily: "Geist Mono", fontSize: "24px", lineHeight: "33px", color: SEPARATOR, display: "flex" }}>·</div>
        <Counter
          value={String(counts.stopCount)}
          label={plural(counts.stopCount, "stanica", "stanice", "stanica")}
        />
        <div style={{ fontFamily: "Geist Mono", fontSize: "24px", lineHeight: "33px", color: SEPARATOR, display: "flex" }}>·</div>
        <Counter
          value={String(counts.kvartCount)}
          label={plural(counts.kvartCount, "kvart", "kvarta", "kvartova")}
        />
      </div>
    </div>
  )
}

/**
 * Homepage OG card — Paper "OG1e-2 · brojači u liniji": the whole-Zagreb
 * dither with the city boundary and badge on top, a 4px blue rule, and a white
 * band with a one-line title + the live brojači as a horizontal counter line.
 * Live twin of the static public/og.jpg bake, so the numbers follow feed
 * rolls. Null when the hero bake is missing (fresh checkout) so the route can
 * fall back to the generic card.
 */
export function renderHomeOgCard(counts: HomeOgCounts): ImageResponse | null {
  const hero = loadHomeHero()
  if (!hero || !existsSync(join(process.cwd(), "public/hero-zagreb.png"))) return null
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
        <MapWindow hero={hero} />
        <div style={{ width: "1200px", height: `${RULE_H}px`, backgroundColor: ZG_BLUE, display: "flex" }} />
        <InfoBand counts={counts} />
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
