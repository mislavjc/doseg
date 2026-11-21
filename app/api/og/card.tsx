import { ImageResponse } from "next/og"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { CSSProperties, ReactNode } from "react"

// Editorial tokens (globals.css). Satori can't resolve CSS vars, so the
// values are mirrored here. Keep in sync with the :root block.
// --ground
export const GROUND = "#ffffff"
// --ink
export const INK = "#0a0a0a"
// --ink-muted
export const INK_MUTED = "#6a7178"
// --zg-blue
export const ZG_BLUE = "#0e51c9"
// --navy
const NAVY = "#0e3fb0"

const ASSETS_DIR = join(process.cwd(), "app/api/og/assets")

function pngDataUri(path: string): string {
  return `data:image/png;base64,${readFileSync(path).toString("base64")}`
}

type OgAssets = {
  geistMonoRegular: Buffer
  geistMonoBold: Buffer
  herosBold: Buffer
  tramSrc: string
}

let cachedAssets: OgAssets | null = null

function getAssets(): OgAssets {
  if (cachedAssets) {
    return cachedAssets
  }
  cachedAssets = {
    geistMonoRegular: readFileSync(join(ASSETS_DIR, "GeistMono-Regular.ttf")),
    geistMonoBold: readFileSync(join(ASSETS_DIR, "GeistMono-Bold.ttf")),
    herosBold: readFileSync(join(ASSETS_DIR, "TeXGyreHeros-Bold.ttf")),
    tramSrc: pngDataUri(join(ASSETS_DIR, "tram.png")),
  }
  return cachedAssets
}

function MonoCaption({
  children,
  paddingTop = "0px",
}: {
  children: string
  paddingTop?: string
}) {
  return (
    <div
      style={{
        fontFamily: "Geist Mono",
        fontSize: "16px",
        lineHeight: "20px",
        letterSpacing: "0.64px",
        color: ZG_BLUE,
        display: "flex",
        // undefined style values crash satori's renderer, always pass a value
        paddingTop,
      }}
    >
      {children}
    </div>
  )
}

/**
 * OG card, the "30:00" design (Paper "OG · 30:00 (finalno)"). White ground,
 * centred Geist Mono timer, TeX Gyre Heros headline, dithered Zagreb-blue
 * tram along the bottom. Shared by /api/og and per-page opengraph-image
 * files; only headline/sub vary per page.
 */
function OgCard({
  tramSrc,
  headline,
  sub,
}: {
  tramSrc: string
  headline: string
  sub?: string
}) {
  return (
    <div
      style={{
        width: "1200px",
        height: "630px",
        display: "flex",
        backgroundColor: GROUND,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <img
        src={tramSrc}
        alt=""
        width={900}
        height={339}
        style={{
          position: "absolute",
          left: "150px",
          top: "301px",
          objectFit: "contain",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "0px",
          left: "0px",
          width: "1200px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: "54px",
          gap: "6px",
        }}
      >
        <MonoCaption>doseg · u pola sata</MonoCaption>
        <div
          style={{
            fontFamily: "Geist Mono",
            fontSize: "120px",
            fontWeight: 700,
            lineHeight: "124px",
            letterSpacing: "-2.4px",
            color: NAVY,
            display: "flex",
          }}
        >
          30:00
        </div>
        <div
          style={{
            fontFamily: "TeX Gyre Heros",
            fontSize: "34px",
            fontWeight: 700,
            lineHeight: "40px",
            color: INK,
            display: "flex",
            paddingTop: "6px",
          }}
        >
          {headline}
        </div>
        {sub && <MonoCaption paddingTop="4px">{sub}</MonoCaption>}
      </div>
    </div>
  )
}

export function renderOgCard({
  headline,
  sub,
}: {
  headline: string
  sub?: string
}): ImageResponse {
  const assets = getAssets()
  return new ImageResponse(
    <OgCard tramSrc={assets.tramSrc} headline={headline} sub={sub} />,
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "Geist Mono",
          data: assets.geistMonoRegular,
          weight: 400,
          style: "normal",
        },
        {
          name: "Geist Mono",
          data: assets.geistMonoBold,
          weight: 700,
          style: "normal",
        },
        {
          name: "TeX Gyre Heros",
          data: assets.herosBold,
          weight: 700,
          style: "normal",
        },
      ],
    }
  )
}

/**
 * Hero OG card shell: a 1200×630 white column (map window over a band),
 * rendered with regular mono + bold Heros.
 */
export function renderHeroCard(...children: Array<ReactNode>): ImageResponse {
  const { geistMonoRegular, herosBold } = getAssets()
  return new ImageResponse(
    <div
      style={{
        width: "1200px",
        height: "630px",
        display: "flex",
        flexDirection: "column",
        backgroundColor: GROUND,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {children}
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "Geist Mono",
          data: geistMonoRegular,
          weight: 400,
          style: "normal",
        },
        {
          name: "TeX Gyre Heros",
          data: herosBold,
          weight: 700,
          style: "normal",
        },
      ],
    }
  )
}

/** A full-width image layer of the map window, cover-cropped. */
export function mapLayer(top: number, height: number) {
  return {
    position: "absolute" as const,
    top: `${top}px`,
    left: "0px",
    width: "1200px",
    height: `${height}px`,
    objectFit: "cover" as const,
  }
}

/** Map window: hero PNG + cloud fade (when baked), then the card's overlays. */
export function HeroMapWindow({
  heroPath,
  height,
  layer,
  children,
}: {
  heroPath: string
  height: number
  layer: CSSProperties
  children: ReactNode
}) {
  const cloudPath = join(process.cwd(), "public/hero-cloud.png")
  return (
    <div
      style={{
        position: "relative",
        width: "1200px",
        height: `${height}px`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <img src={pngDataUri(heroPath)} alt="" style={layer} />
      {existsSync(cloudPath) && (
        <img src={pngDataUri(cloudPath)} alt="" style={layer} />
      )}
      {children}
    </div>
  )
}

/** White info band under the map: breadcrumb, headline, facts. */
export function HeroInfoBand({
  crumb,
  headline,
  headlineSize,
  facts,
}: {
  crumb: string
  headline: string
  headlineSize: number
  facts: string
}) {
  return (
    <div
      style={{
        width: "1200px",
        height: "160px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: "8px",
        backgroundColor: GROUND,
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
        {crumb}
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
            fontSize: `${headlineSize}px`,
            fontWeight: 700,
            lineHeight: "44px",
            color: INK,
            display: "flex",
          }}
        >
          {headline}
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
