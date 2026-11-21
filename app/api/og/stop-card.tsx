import { existsSync } from "node:fs"
import { join } from "node:path"
import type { ImageResponse } from "next/og"

import { plural } from "@/app/linije/copy"
import type { LineHeroMeta } from "@/lib/line-data"
import type { StopPageData } from "@/lib/generated/StopPageData"

import {
  HeroInfoBand,
  HeroMapWindow,
  ZG_BLUE,
  mapLayer,
  renderHeroCard,
} from "./card"

/** Map window of the card (Paper "OG stanica — V1"). */
const MAP_H = 470

/** Facts line: lines + reach (the moat) when present, else service window. */
function factsText(data: StopPageData): string {
  const lines = `${data.lineCount} ${plural(data.lineCount, "linija", "linije", "linija")}`
  if (data.reach) {
    return `${lines} · ${data.reach.stations30} ${plural(data.reach.stations30, "stanica", "stanice", "stanica")} za 30 min`
  }
  return `${lines} · ${data.firstDeparture}-${data.lastDeparture}`
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
  const heroPath = join(
    process.cwd(),
    "public/stanice",
    `hero-${data.slug}.png`
  )
  if (!meta || !existsSync(heroPath)) {
    return null
  }

  return renderHeroCard(
    <HeroMapWindow
      heroPath={heroPath}
      height={MAP_H}
      layer={mapLayer(0, MAP_H)}
    >
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
    </HeroMapWindow>,
    <HeroInfoBand
      crumb={
        data.kvart
          ? `doseg.hr / sve stanice / ${data.kvart}`
          : "doseg.hr / sve stanice"
      }
      headline={`Stanica ${data.name}`}
      headlineSize={34}
      facts={factsText(data)}
    />
  )
}
