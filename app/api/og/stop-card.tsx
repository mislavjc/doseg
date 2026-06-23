import { ImageResponse } from "next/og"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { plural } from "@/app/linije/copy"
import type { LineHeroMeta } from "@/lib/line-data"
import type { StopPageData } from "@/lib/generated/StopPageData"

// Editorial tokens (globals.css), mirrored — satori can't resolve CSS vars.
const INK = "#0a0a0a" // --ink
const INK_MUTED = "#6a7178" // --ink-muted
const ZG_BLUE = "#0e51c9" // --zg-blue

const ASSETS_DIR = join(process.cwd(), "app/api/og/assets")

/** Map window of the card (Paper "OG stanica — V1"). */
const MAP_H = 470
const BAND_H = 160

function loadFonts() {
  return {
    geistMono: readFileSync(join(ASSETS_DIR, "GeistMono-Regular.ttf")),
    herosBold: readFileSync(join(ASSETS_DIR, "TeXGyreHeros-Bold.ttf")),
  }
}

const MAP_LAYER = {
  position: "absolute" as const,
  top: "0px",
  left: "0px",
  width: "1200px",
  height: `${MAP_H}px`,
  objectFit: "cover" as const,
}

/** Map window: dither hero + cloud fade + centred stop marker (Paper "OG
 *  stanica — V1": clean junction map, no route overlay). */
function MapWindow({ data }: { data: StopPageData }) {
  const heroPath = join(process.cwd(), "public/stanice", `hero-${data.slug}.png`)
  const heroSrc = `data:image/png;base64,${readFileSync(heroPath).toString("base64")}`
  const cloudPath = join(process.cwd(), "public/hero-cloud.png")
  const cloudSrc = existsSync(cloudPath)
    ? `data:image/png;base64,${readFileSync(cloudPath).toString("base64")}`
    : null
  return (
    <div style={{ position: "relative", width: "1200px", height: `${MAP_H}px`, display: "flex", overflow: "hidden" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={heroSrc} alt="" style={MAP_LAYER} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {cloudSrc && <img src={cloudSrc} alt="" style={MAP_LAYER} />}
      {/* Stop marker + name, centred (crop is symmetric around the stop). */}
      <div
        style={{
          position: "absolute",
          top: "0px",
          left: "0px",
          width: "1200px",
          height: `${MAP_H}px`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "14px",
        }}
      >
        <div
          style={{
            display: "flex",
            backgroundColor: ZG_BLUE,
            color: "#fff",
            fontFamily: "Geist Mono",
            fontSize: "30px",
            lineHeight: "38px",
            padding: "6px 16px",
          }}
        >
          {data.name}
        </div>
        <div
          style={{
            width: "30px",
            height: "30px",
            borderRadius: "50%",
            backgroundColor: ZG_BLUE,
            border: "4px solid #fff",
            boxShadow: `0 0 0 3px ${ZG_BLUE}`,
          }}
        />
      </div>
    </div>
  )
}

/** Facts line: lines + reach (the moat) when present, else service window. */
function factsText(data: StopPageData): string {
  const lines = `${data.lineCount} ${plural(data.lineCount, "linija", "linije", "linija")}`
  if (data.reach) {
    return `${lines} · ${data.reach.stations30} ${plural(data.reach.stations30, "stanica", "stanice", "stanica")} za 30 min`
  }
  return `${lines} · ${data.firstDeparture}–${data.lastDeparture}`
}

/** White info band: breadcrumb, headline, facts (Paper "OG stanica — V1"). */
function InfoBand({ data }: { data: StopPageData }) {
  const crumb = data.kvart ? `doseg.hr / sve stanice / ${data.kvart}` : "doseg.hr / sve stanice"
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
      <div style={{ fontFamily: "Geist Mono", fontSize: "24px", lineHeight: "32px", letterSpacing: "0.96px", color: ZG_BLUE, display: "flex" }}>
        {crumb}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", width: "1088px" }}>
        <div style={{ fontFamily: "TeX Gyre Heros", fontSize: "34px", fontWeight: 700, lineHeight: "44px", color: INK, display: "flex" }}>
          Stanica {data.name}
        </div>
        <div style={{ fontFamily: "Geist Mono", fontSize: "24px", lineHeight: "38px", color: INK_MUTED, display: "flex" }}>
          {factsText(data)}
        </div>
      </div>
    </div>
  )
}

/**
 * Per-stop OG card — Paper "OG stanica — V1": the dithered junction map with the
 * serving-line corridors + a centred stop bullseye on top, a white info band
 * below with breadcrumb, headline and facts. Mirrors the line card; 16/12 system
 * at @2x (Heros Bold 34 + Geist Mono 24). Null when the stop has no baked hero.
 */
export function renderStopOgCard(
  data: StopPageData,
  meta: LineHeroMeta | null
): ImageResponse | null {
  const heroPath = join(process.cwd(), "public/stanice", `hero-${data.slug}.png`)
  if (!meta || !existsSync(heroPath)) return null
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
