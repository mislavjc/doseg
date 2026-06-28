import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { Provenijencija, SectionHeader } from "@/app/statistika/editorial/blocks"
import { CestaPitanja, faqJsonLd } from "@/app/statistika/editorial/faq"
import { Footer } from "@/app/statistika/editorial/footer"
import { JsonLd, breadcrumbJsonLd, lineStopsJsonLd } from "@/app/statistika/editorial/json-ld"
import { EditorialShell, Section } from "@/app/statistika/editorial/primitives"
import { loadHeroMeta, loadLineData, loadLineIndex } from "@/lib/line-data"
import { resolveStopSlugs } from "@/lib/stop-data"

import {
  departureTerminals,
  introText,
  plural,
  serviceStatus,
  terminalChips,
  vozniRedNote,
} from "../copy"
import { LineHero } from "../line-hero"
import {
  Cinjenice,
  DosegLinije,
  Frekvencija,
  Naslov,
  PovezaneLinije,
  PrevNext,
  buildFaq,
  frekvencijaCopy,
} from "../sections"
import { Stanice } from "../stanice"
import { VozniRed } from "../vozni-red"

export const dynamicParams = false

export function generateStaticParams() {
  return loadLineIndex().lines.map((l) => ({ broj: l.broj }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ broj: string }>
}): Promise<Metadata> {
  const { broj } = await params
  const data = loadLineData(broj)
  if (!data) return {}
  // Title keywords follow real GSC demand: trams are searched "tramvaj {N}",
  // buses "zet {N}" — so each mode leads with its own pattern. Route endpoints
  // live in the description/page body, not the title (keeps it under ~60 chars
  // and prioritises the "vozni red"/"stanice" modifiers people actually type).
  const title =
    data.mode === "tram"
      ? `Tramvaj ${data.broj} (ZET): vozni red i stanice | Doseg`
      : `ZET ${data.broj} (autobus): vozni red i stanice | Doseg`
  const description = introText(data)
  // The v param busts X/Telegram per-URL caches when the feed rolls.
  const ogVersion = loadLineIndex().serviceDates.radniDan
  return {
    title,
    description,
    alternates: { canonical: `/linije/${data.broj}` },
    openGraph: {
      title,
      description,
      type: "article",
      images: [
        {
          url: `/api/og?linija=${data.broj}&v=${ogVersion}`,
          width: 1200,
          height: 630,
        },
      ],
    },
  }
}

export default async function LinijaPage({
  params,
}: {
  params: Promise<{ broj: string }>
}) {
  const { broj } = await params
  const data = loadLineData(broj)
  if (!data) notFound()
  const index = loadLineIndex()
  const stops = data.directions[0].stops.length
  const status = serviceStatus(data)
  const faq = buildFaq(data)
  const frek = frekvencijaCopy(data)
  const voznickiNote = vozniRedNote(data)
  // Link each stop to its own page; duplicate names resolve by nearest coords.
  const stopSlugs = resolveStopSlugs(data.directions.flatMap((d) => d.stops))

  return (
    <EditorialShell>
      <JsonLd data={faqJsonLd(faq)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Linije", path: "/linije" },
          { name: `Linija ${data.broj}`, path: `/linije/${data.broj}` },
        ])}
      />
      <JsonLd data={lineStopsJsonLd(data.broj, data.directions[0].stops, stopSlugs)} />

      <LineHero data={data} meta={loadHeroMeta(broj)} />

      <Section width="article" className="pb-0 pt-10 sm:pb-0 sm:pt-14">
        <Naslov data={data} />
      </Section>

      <Section width="article" className="pb-0 sm:pb-0">
        <Cinjenice data={data} />
      </Section>

      <Section id="stanice" width="article" className="pb-0 sm:pb-0">
        <SectionHeader
          eyebrow="stanice"
          hook={`${stops} ${plural(stops, "stanica", "stanice", "stanica")} ${data.oneWay ? "na trasi" : "u svakom smjeru"}.`}
        >
          Vremena su tipična radnim danom, mjerena od polazne stanice. Veze na
          tramvaj označene su uz stanicu.
        </SectionHeader>
      </Section>
      <Section width="full" className="py-0" innerClassName="max-w-[1240px]">
        <Stanice
          directions={data.directions}
          terminalChips={terminalChips(data)}
          stopSlugs={stopSlugs}
        />
      </Section>

      <Section width="article" className="pb-0 sm:pb-0">
        <DosegLinije data={data} />
      </Section>

      {frek && (
        <Section id="frekvencija" width="article" className="pb-0 sm:pb-0">
          <SectionHeader eyebrow="koliko često vozi" hook={frek.hook}>
            {frek.body}
          </SectionHeader>
          <Frekvencija data={data} />
        </Section>
      )}

      {status !== "none" && (
        <Section id="vozni-red" width="article" className="pb-0 sm:pb-0">
          <SectionHeader
            eyebrow="vozni red"
            hook={data.oneWay ? "Svi polasci." : "Svi polasci, oba smjera."}
          >
            Plavi čip je sljedeći polazak.
            {voznickiNote}
          </SectionHeader>
          <VozniRed
            timetable={data.timetable}
            terminals={departureTerminals(data)}
          />
        </Section>
      )}

      <Section width="article" className="pb-0 sm:pb-0">
        <CestaPitanja items={faq} />
      </Section>

      <Section width="article" className="pb-0 sm:pb-0">
        <PovezaneLinije data={data} />
      </Section>

      <Section width="article" className="pb-6 sm:pb-8">
        <PrevNext data={data} />
        <div className="pt-12">
          <Provenijencija date={index.serviceDates.radniDan} />
        </div>
      </Section>

      <Footer updated={index.generatedAt} />
    </EditorialShell>
  )
}
