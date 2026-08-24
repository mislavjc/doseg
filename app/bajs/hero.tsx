import dynamic from "next/dynamic"

import { plural } from "@/app/linije/copy"
import { SiteNav } from "@/app/statistika/editorial/site-nav"
import { buildBajsFeatureCollection, getBajsData } from "@/lib/bajs"

/**
 * The /bajs header: the dithered figure-ground of the whole service area, live
 * stations on top, pannable. It replaces the shared `Hero` band on this page
 * rather than sitting under it, so the page opens on one map instead of two
 * stacked dithers.
 *
 * The ground is our own baked fabric (`public/bajs-tiles`), not a vendor
 * basemap, so zooming in stays inside the site's cartography. The static crop
 * `public/bajs-hero.png` still backs the band: it is what shows while the map
 * boots, and it is all a reader without JavaScript ever gets.
 *
 * Stations are needles: a stem standing on the coordinate with a head on top,
 * solid when bikes are waiting and hollow when the stand is empty. See
 * `station-marks.ts` for why the mark separates the spot from the reading.
 */

const BajsHeroMap = dynamic(() => import("./hero-map"))

/** The map's own mark at legend size, so the key and the map are one thing. */
function LegendMark({ empty }: { empty?: boolean }) {
  return (
    <svg
      viewBox="0 0 12 18"
      width="12"
      height="18"
      className="shrink-0 overflow-visible"
      aria-hidden
    >
      <line
        x1="6"
        y1="17"
        x2="6"
        y2="6"
        stroke="var(--zg-blue)"
        strokeWidth="1.25"
      />
      <circle cx="6" cy="17" r="1.1" fill="var(--zg-blue)" />
      <circle
        cx="6"
        cy="5"
        r="4"
        fill={empty ? "var(--ground)" : "var(--zg-blue)"}
        stroke="var(--zg-blue)"
        strokeWidth="1.25"
      />
    </svg>
  )
}

export async function BajsHero() {
  let data
  try {
    data = await getBajsData()
  } catch {
    data = null
  }

  const stations = data?.stations ?? []
  const bikes = stations.reduce((n, s) => n + s.bikesAvailable, 0)
  const empty = stations.filter((s) => s.bikesAvailable === 0).length
  // Seeded from the server render so the map has its stations on first paint
  // instead of popping them in a beat later.
  const seed = data ? buildBajsFeatureCollection(stations) : undefined

  // The feed's own timestamp, not the wall clock: it is the moment these
  // numbers were true, and it stays honest if the page is ever cached.
  const updated = data
    ? new Intl.DateTimeFormat("hr-HR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Zagreb",
      }).format(new Date(data.updatedAt * 1000))
    : null

  return (
    <header className="relative border-b border-hairline bg-ground">
      <div
        className="h-[420px] w-full bg-cover bg-center sm:h-[560px]"
        style={{ backgroundImage: "url(/bajs-hero.png)" }}
      >
        <BajsHeroMap initial={seed} />
      </div>

      {/* Nav rides on the map, as on every other page but without a second
          dither band beneath it. */}
      <div className="absolute inset-x-0 top-0 flex justify-center bg-ground/85 px-4 py-3 sm:px-16">
        <SiteNav active="bajs" className="bg-transparent" />
      </div>

      {/* Below the map on a phone, where the band is short and a floating card
          would cover the city; a card on the map from sm up. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-hairline bg-ground px-4 py-3 sm:absolute sm:bottom-6 sm:left-6 sm:max-w-[calc(100%-3rem)] sm:gap-y-2 sm:border sm:border-hairline-strong sm:px-4 sm:py-2.5">
        <span className="font-mono text-label text-ink">
          uživo{updated ? ` · ${updated}` : ""}
        </span>
        <span className="hidden h-3.5 w-px bg-hairline sm:block" />
        <span className="flex items-center gap-1.5">
          <LegendMark />
          <span className="font-mono text-label text-ink-muted">ima bajsa</span>
        </span>
        <span className="flex items-center gap-1.5">
          <LegendMark empty />
          <span className="font-mono text-label text-ink-muted">prazna</span>
        </span>
        <span className="hidden h-3.5 w-px bg-hairline sm:block" />
        <span className="font-mono text-label text-ink">
          {data
            ? `${bikes} ${plural(bikes, "bajs", "bajsa", "bajseva")} na ${stations.length} stanica · ${empty} praznih`
            : "feed nije dostupan"}
        </span>
      </div>
    </header>
  )
}
