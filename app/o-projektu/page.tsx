import type { Metadata } from "next"

import { MonoLabel } from "@/components/home/ui"
import { Breadcrumb } from "@/app/statistika/editorial/blocks"
import { Footer } from "@/app/statistika/editorial/footer"
import { Hero } from "@/app/statistika/editorial/hero"
import { loadLineIndex } from "@/lib/line-data"

export const metadata: Metadata = {
  title: "O projektu | Doseg",
  description:
    "Kako radi Doseg: interaktivna karta dosega javnog prijevoza u Zagrebu. Dijkstrin algoritam, ZET GTFS vozni red, GTFS-RT kašnjenja i pješačka mreža s 422K čvorova.",
  alternates: { canonical: "/o-projektu" },
  openGraph: {
    title: "O projektu | Doseg",
    description:
      "Kako radi Doseg: interaktivna karta dosega javnog prijevoza u Zagrebu. Dijkstrin algoritam, ZET GTFS vozni red, GTFS-RT kašnjenja i pješačka mreža s 422K čvorova.",
    type: "article",
    images: [{ url: "/og.jpg", width: 1200, height: 630, type: "image/jpeg" }],
  },
}

/**
 * O projektu — "Kolofon B / memorandum": a short author's note on letterhead.
 * Shared header band (Paper "Nav unifikacija — U3" — same height + nav offset
 * as /statistika, park-belt map crop), mono sender line over a strong
 * hairline, three paragraphs, signature, p.s. with sources + repo link.
 * Matches Paper node LGZ-0 (Kolofon B). Same editorial system as /statistika.
 */

function SenderLine() {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-hairline-strong pb-3">
      <Breadcrumb trail={[{ label: "doseg.hr" }, { label: "o projektu" }]} />
      <MonoLabel>zagreb, lipanj 2026.</MonoLabel>
    </div>
  )
}

function Signature() {
  return (
    <div className="flex flex-col gap-1 pt-10">
      <p className="font-heros text-body font-bold text-ink">- Mislav</p>
      <a
        href="https://mislavjc.com"
        className="w-fit font-mono text-label text-ink-faint transition-colors duration-150 hover:text-ink"
      >
        mislavjc.com
      </a>
    </div>
  )
}

export default function AboutPage() {
  const updated = loadLineIndex().generatedAt
  return (
    <div className="min-h-svh bg-ground font-heros text-ink-2 antialiased selection:bg-zg-blue/15">
      <Hero active="o projektu" mapPosition="center 70%" />

      <main
        id="main-content"
        className="mx-auto w-full max-w-[620px] px-4 pt-4 pb-24 sm:px-8 sm:pb-32"
      >
        <h1 className="sr-only">O projektu</h1>
        <SenderLine />

        <div className="flex flex-col gap-[22px] pt-11 text-body">
          <p>
            Doseg mjeri koliko je grada stvarno dostupno javnim prijevozom.
            Klik na kartu vraća izokrone za 15, 30 i 45 minuta, prema stvarnom
            voznom redu i s kašnjenjima koja se osvježavaju svakih trideset
            sekundi.
          </p>
          <p>
            Izračun je Dijkstrin algoritam: prvo mrežom tramvaja i buseva,
            zatim pješice, kroz 422 tisuće čvorova OpenStreetMapa. Težak dio
            računa Rust servis, rute se sklapaju u pregledniku, a odgovori se
            cachiraju na mreži od stotinjak metara, pa karta reagira odmah.
          </p>
          <p>
            Stranica ne koristi kolačiće ni praćenje; upiti ostaju između
            preglednika i servera. Podaci i kod su javni.
          </p>
        </div>

        <Signature />
      </main>

      <Footer updated={updated} />
    </div>
  )
}
