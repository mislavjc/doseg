import { ImageResponse } from "next/og"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Editorial tokens (globals.css). Satori can't resolve CSS vars, so the
// values are mirrored here. Keep in sync with the :root block.
const GROUND = "#ffffff" // --ground
const INK = "#0a0a0a" // --ink
const ZG_BLUE = "#0e51c9" // --zg-blue
const NAVY = "#0e3fb0" // --navy

const ASSETS_DIR = join(process.cwd(), "app/api/og/assets")

type OgAssets = {
  geistMonoRegular: Buffer
  geistMonoBold: Buffer
  herosBold: Buffer
  tramSrc: string
}

let cachedAssets: OgAssets | null = null

function getAssets(): OgAssets {
  if (cachedAssets) return cachedAssets
  const tram = readFileSync(join(ASSETS_DIR, "tram.png"))
  cachedAssets = {
    geistMonoRegular: readFileSync(join(ASSETS_DIR, "GeistMono-Regular.ttf")),
    geistMonoBold: readFileSync(join(ASSETS_DIR, "GeistMono-Bold.ttf")),
    herosBold: readFileSync(join(ASSETS_DIR, "TeXGyreHeros-Bold.ttf")),
    tramSrc: `data:image/png;base64,${tram.toString("base64")}`,
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
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
