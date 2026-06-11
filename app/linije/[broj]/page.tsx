import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { Footer } from "@/app/statistika/editorial/footer"
import { EditorialShell, Section } from "@/app/statistika/editorial/primitives"
import { loadHeroMeta, loadLineData, loadLineIndex } from "@/lib/line-data"

import {
  departureTerminals,
  introText,
  plural,
  serviceDays,
  terminalChips,
} from "../copy"
import { LineHero } from "../line-hero"
import {
  CestaPitanja,
  Cinjenice,
  DosegLinije,
  Frekvencija,
  Naslov,
  PovezaneLinije,
  PrevNext,
  Provenijencija,
  SectionHeader,
  buildFaq,
  faqJsonLd,
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
  const title = `Linija ${data.broj} vozni red: ${data.terminals[0]} - ${data.terminals[1]} | Doseg`
  const description = introText(data)
  return {
    title,
    description,
    alternates: { canonical: `/linije/${data.broj}` },
    openGraph: {
      title,
      description,
      type: "article",
      images: [
        { url: `/api/og?linija=${data.broj}`, width: 1200, height: 630 },
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
  const days = serviceDays(data)
  const faq = buildFaq(data)
  const frek = frekvencijaCopy(data)

  return (
    <EditorialShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: faqJsonLd(faq) }}
      />

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
        />
      </Section>

      <Section width="article" className="pb-0 sm:pb-0">
        <DosegLinije data={data} />
      </Section>

      <Section id="frekvencija" width="article" className="pb-0 sm:pb-0">
        <SectionHeader eyebrow="koliko često vozi" hook={frek.hook}>
          {frek.body}
        </SectionHeader>
        <Frekvencija data={data} />
      </Section>

      <Section id="vozni-red" width="article" className="pb-0 sm:pb-0">
        <SectionHeader
          eyebrow="vozni red"
          hook={data.oneWay ? "Svi polasci." : "Svi polasci, oba smjera."}
        >
          Plavi čip je sljedeći polazak.
          {days.subota || days.nedjelja
            ? " Polasci za radni dan, subotu i nedjelju."
            : " Vozi samo radnim danom."}
        </SectionHeader>
        <VozniRed
          timetable={data.timetable}
          terminals={departureTerminals(data)}
        />
      </Section>

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
