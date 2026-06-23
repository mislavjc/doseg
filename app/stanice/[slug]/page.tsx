import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { Provenijencija } from "@/app/statistika/editorial/blocks"
import { CestaPitanja, faqJsonLd } from "@/app/statistika/editorial/faq"
import { Footer } from "@/app/statistika/editorial/footer"
import { JsonLd, breadcrumbJsonLd } from "@/app/statistika/editorial/json-ld"
import { EditorialShell, Section } from "@/app/statistika/editorial/primitives"
import { loadStopData, loadStopHeroMeta, loadStopIndex } from "@/lib/stop-data"

import { introText, stopTitle } from "../copy"
import {
  Cinjenice,
  DosegOdavde,
  LinijeKojeStaju,
  Naslov,
  PrevNext,
  SusjedneStanice,
  buildFaq,
  stopJsonLd,
} from "../sections"
import { StopHero } from "../stop-hero"

export const dynamicParams = false

export function generateStaticParams() {
  return loadStopIndex().stops.map((s) => ({ slug: s.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const data = loadStopData(slug)
  if (!data) return {}
  const title = stopTitle(data)
  const description = introText(data)
  return {
    title,
    description,
    alternates: { canonical: `/stanice/${data.slug}` },
    openGraph: { title, description, type: "article" },
  }
}

export default async function StanicaPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const data = loadStopData(slug)
  if (!data) notFound()
  const index = loadStopIndex()
  const faq = buildFaq(data)

  return (
    <EditorialShell>
      <JsonLd data={faqJsonLd(faq)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Stanice", path: "/stanice" },
          { name: `Stanica ${data.name}`, path: `/stanice/${data.slug}` },
        ])}
      />
      <JsonLd data={stopJsonLd(data)} />

      <StopHero data={data} meta={loadStopHeroMeta(slug)} />

      <Section width="article" className="pb-0 pt-10 sm:pb-0 sm:pt-14">
        <Naslov data={data} />
      </Section>

      <Section width="article" className="pb-0 sm:pb-0">
        <Cinjenice data={data} />
      </Section>

      <Section id="linije" width="article" className="pb-0 sm:pb-0">
        <LinijeKojeStaju data={data} />
      </Section>

      <Section id="doseg" width="article" className="pb-0 sm:pb-0">
        <DosegOdavde data={data} />
      </Section>

      <Section width="article" className="pb-0 sm:pb-0">
        <SusjedneStanice data={data} />
      </Section>

      <Section width="article" className="pb-0 sm:pb-0">
        <CestaPitanja items={faq} />
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
