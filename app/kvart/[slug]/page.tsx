import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { Footer } from "@/app/statistika/editorial/footer"
import { EditorialShell, Section } from "@/app/statistika/editorial/primitives"
import { loadScores } from "@/app/statistika/stat-data"
import { loadKvart, loadKvartIndex } from "@/lib/kvart-data"

import {
  Blizina,
  CestaPitanja,
  Cinjenice,
  DosegLink,
  IzvanSpice,
  KvartHero,
  KvartJsonLd,
  Linije,
  Matrica,
  Naslov,
  OvisiOAdresi,
  Promjene,
  Scorecard,
  buildFaq,
} from "../sections"

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
  return {
    title,
    description,
    alternates: { canonical: `/kvart/${data.slug}` },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: "/og.jpg", width: 1200, height: 630 }],
    },
  }
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
