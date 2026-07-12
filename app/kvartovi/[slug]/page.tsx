import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { CestaPitanja } from "@/app/statistika/editorial/faq"
import { Footer } from "@/app/statistika/editorial/footer"
import { EditorialShell, Section } from "@/app/statistika/editorial/primitives"
import { loadScores } from "@/app/statistika/stat-data"
import { loadKvart, loadKvartIndex } from "@/lib/kvart-data"
import { pseoMetadata } from "@/lib/pseo-metadata"
import { loadStopIndex } from "@/lib/stop-data"

import {
  Blizina,
  Cinjenice,
  DosegLink,
  IzvanSpice,
  type KvartStop,
  KvartHero,
  KvartJsonLd,
  Linije,
  Matrica,
  Naslov,
  OvisiOAdresi,
  Promjene,
  Scorecard,
  StaniceUKvartu,
  buildFaq,
} from "../sections"

/** Busiest stops physically in this kvart, deduped by name (a stop name can
 * repeat per direction), for the kvart → stop internal links. Built from the
 * committed stop index, so no Rust regen is needed. */
function notableStopsInKvart(kvart: string): KvartStop[] {
  const byName = new Map<string, KvartStop>()
  for (const s of loadStopIndex().stops) {
    if (s.kvart !== kvart) continue
    const prev = byName.get(s.name)
    if (!prev || s.lineCount > prev.lineCount) {
      byName.set(s.name, { name: s.name, slug: s.slug, lineCount: s.lineCount })
    }
  }
  return [...byName.values()]
    .sort((a, b) => b.lineCount - a.lineCount)
    .slice(0, 12)
}

export const dynamicParams = false

export function generateStaticParams() {
  return loadKvartIndex().map((k) => ({ slug: k.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const data = loadKvart(slug)
  if (!data) return {}
  const title = `${data.name}: javni prijevoz i povezanost | Doseg`
  const description = `${data.name} je ${data.rank}. od ${data.total} zagrebačkih kvartova po povezanosti javnim prijevozom. ${data.tramCount} tramvajskih i ${data.busCount} autobusnih linija; ${data.within30} kvartova nadohvat za 30 minuta.`
  return pseoMetadata({
    title,
    description,
    path: `/kvartovi/${data.slug}`,
    ogType: "website",
    ogImage: "/og.jpg",
  })
}

export default async function KvartPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const data = loadKvart(slug)
  if (!data) notFound()
  const faq = buildFaq(data)
  const updated = loadScores()?.generatedAt ?? ""
  const stopsInKvart = notableStopsInKvart(data.name)

  return (
    <EditorialShell>
      <KvartJsonLd data={data} faq={faq} />
      <KvartHero data={data} />

      <Section width="article" className="pb-0 pt-10 sm:pb-0 sm:pt-14">
        <Naslov data={data} />
      </Section>
      <Section width="article" className="pb-0 sm:pb-0">
        <Scorecard data={data} />
      </Section>
      <Section width="article" className="pb-0 sm:pb-0">
        <Matrica data={data} />
      </Section>
      <Section width="article" className="pb-0 sm:pb-0">
        <IzvanSpice data={data} />
      </Section>
      <Section width="article" className="pb-0 sm:pb-0">
        <Cinjenice data={data} />
      </Section>
      <Section width="article" className="pb-0 sm:pb-0">
        <Linije data={data} />
      </Section>
      {stopsInKvart.length > 0 && (
        <Section width="article" className="pb-0 sm:pb-0">
          <StaniceUKvartu stops={stopsInKvart} />
        </Section>
      )}
      <Section width="article" className="pb-0 sm:pb-0">
        <OvisiOAdresi data={data} />
      </Section>
      <Section width="article" className="pb-0 sm:pb-0">
        <DosegLink data={data} />
      </Section>
      <Section width="article" className="pb-0 sm:pb-0">
        <Blizina data={data} />
      </Section>
      {data.promjene.length > 0 && (
        <Section width="article" className="pb-0 sm:pb-0">
          <Promjene data={data} />
        </Section>
      )}
      <Section width="article">
        <CestaPitanja items={faq} />
      </Section>

      <Footer updated={updated} />
    </EditorialShell>
  )
}
