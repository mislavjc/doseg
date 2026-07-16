import type { Metadata } from "next"

import { Footer } from "@/app/statistika/editorial/footer"
import { EditorialShell } from "@/app/statistika/editorial/primitives"
import type { LineIndexEntry } from "@/lib/generated/LineIndexEntry"
import { loadHomeHero } from "@/lib/home-hero"
import { loadLineIndex } from "@/lib/line-data"
import { loadStopIndex } from "@/lib/stop-data"

import { HomeHero } from "./home-hero"

import {
  DesktopLineSection,
  HeroIntro,
  KartaTeaser,
  MobileLedger,
  MobileLineGroup,
  SearchBlock,
  StaniceSection,
  TrazenoSection,
} from "./home-sections"
import { pseoMetadata } from "@/lib/pseo-metadata"

import { plural } from "./linije/copy"
import { firstLetter, MIN_LINES } from "./stanice/letters"

/**
 * Homepage — the imenik (Paper "Home v2.0 — banner, cijela stranica"):
 * search-first directory of the ZET network under the whole-Zagreb dither
 * banner. The interactive map lives at /karta; here it gets a teaser. Desktop
 * shows tram/bus sections + the A–Ž strip; mobile collapses them into one
 * linije group + an index ledger (Paper mobile board).
 */

export const metadata: Metadata = pseoMetadata({
  title: "Doseg: ZET vozni redovi, linije, stanice i kvartovi Zagreba",
  description:
    "Vozni red svake ZET linije, imenik svih stanica i dostupnost po kvartu. Uz kartu koja pokazuje koliko grada dosežeš javnim prijevozom za 30 minuta.",
  path: "/",
  ogType: "website",
  ogImage: "/og.jpg",
})

/** Busiest lines first — the rows a first-time visitor most likely wants. */
function busiest(lines: LineIndexEntry[], count: number): LineIndexEntry[] {
  return [...lines]
    .sort((a, b) => b.dailyDepartures - a.dailyDepartures)
    .slice(0, count)
}

export default function HomePage() {
  const index = loadLineIndex()
  const stopIndex = loadStopIndex()

  const dayTrams = index.lines.filter((l) => l.mode === "tram" && !l.isNight)
  const buses = index.lines.filter((l) => l.mode === "bus" && !l.isNight)
  const topTrams = busiest(dayTrams, 3)
  const topBuses = busiest(buses, 3)
  // Mobile shows one mixed group instead of two sections (Paper mobile board).
  const mobileMix = [...topTrams.slice(0, 2), ...topBuses]

  const stopCount = stopIndex.stops.length
  const stopSlugs = new Set(stopIndex.stops.map((s) => s.slug))
  // Letter anchors only exist for promoted stops on /stanice — derive the
  // strip from the same set so every letter link lands somewhere.
  const letters = new Set(
    stopIndex.stops
      .filter((s) => s.lineCount >= MIN_LINES)
      .map((s) => firstLetter(s.name))
  )

  return (
    <EditorialShell>
      <HomeHero hero={loadHomeHero()} />

      <HeroIntro />
      <SearchBlock stopSlugs={stopSlugs} />

      <DesktopLineSection
        eyebrow={`tramvaji · ${dayTrams.length} ${plural(dayTrams.length, "dnevna linija", "dnevne linije", "dnevnih linija")}`}
        hook="Tramvajska mreža."
        lines={topTrams}
        moreLabel={`svih ${dayTrams.length} tramvajskih linija`}
      />
      <DesktopLineSection
        eyebrow={`autobusi · ${buses.length} ${plural(buses.length, "linija", "linije", "linija")}`}
        hook="Autobusna mreža."
        lines={topBuses}
        moreLabel={`svih ${buses.length} autobusnih linija`}
      />
      <MobileLineGroup total={index.lines.length} lines={mobileMix} />

      <StaniceSection stopCount={stopCount} letters={letters} />
      <MobileLedger stopCount={stopCount} />

      <TrazenoSection stopSlugs={stopSlugs} />
      <KartaTeaser />

      <Footer updated={index.generatedAt} />
    </EditorialShell>
  )
}
