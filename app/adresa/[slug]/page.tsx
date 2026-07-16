import { IconArrowRight } from "@central-icons-react/square-outlined-radius-0-stroke-2"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { Footer } from "@/app/statistika/editorial/footer"
import {
  Body,
  EditorialShell,
  Eyebrow,
  PageTitle,
  Section,
} from "@/app/statistika/editorial/primitives"
import { HomeHero } from "@/app/home-hero"
import { Fact, NearbyLines, NearbyStops, Row } from "@/components/doseg-readout"
import { resolveAdresaSlug } from "@/lib/adresa"
import { dosegAt } from "@/lib/doseg-at"
import { loadHomeHero } from "@/lib/home-hero"
import { loadLineIndex } from "@/lib/line-data"

/**
 * /adresa/[slug] — the doseg page for one address (Paper "Adresa je stranica
 * — cijela stranica"): the city banner zoomed to the point, then the readout
 * that used to render inline on the homepage. Every search result is now a
 * page, so the input has one verb; this one is shareable and revisitable.
 *
 * noindex: 138k possible thin pages would eat the crawl budget the /?lat fix
 * just recovered — these exist for people, not for Google. Internal links to
 * them carry rel="nofollow" for the same reason.
 */

interface Params {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const adresa = resolveAdresaSlug(slug)
  if (!adresa) return { robots: { index: false } }
  return {
    title: `${adresa.label} — doseg javnim prijevozom | doseg.hr`,
    description: `Koliko grada dosežeš za 30 minuta s adrese ${adresa.label}: najbliže stanice, linije u blizini i povezanost kvarta.`,
    robots: { index: false, follow: true },
  }
}

function MonoLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 font-mono text-label text-zg-blue transition-colors hover:text-navy"
    >
      {children}
      <IconArrowRight size={14} className="shrink-0" />
    </Link>
  )
}

export default async function AdresaPage({ params }: Params) {
  const { slug } = await params
  const adresa = resolveAdresaSlug(slug)
  if (!adresa) notFound()

  const data = dosegAt(adresa.lon, adresa.lat)
  const karta = `/karta?lat=${adresa.lat.toFixed(5)}&lon=${adresa.lon.toFixed(5)}`

  return (
    <EditorialShell>
      <HomeHero hero={loadHomeHero()} focus={{ lon: adresa.lon, lat: adresa.lat }} />

      <Section width="article" className="pb-0 pt-8 sm:pb-0 sm:pt-10">
        <Eyebrow>
          doseg.hr · adresa
          {data.kvart ? ` · ${data.kvart.name.toLowerCase()}` : ` · ${adresa.naselje.toLowerCase()}`}
        </Eyebrow>
        <PageTitle className="mt-4">{adresa.label}</PageTitle>
        <Body className="mt-3 max-w-[520px]">
          {data.found && typeof data.reachKm2 === "number"
            ? `${data.reachKm2} km² grada za 30 minuta javnim prijevozom. Sve ispod je izračunato za ovu adresu i njezin kvart.`
            : "Ova adresa je izvan kvartova koje mjerimo — točan doseg pokazuje karta."}
        </Body>
      </Section>

      {data.found && (
        <Section width="article" className="flex flex-col gap-3 pb-0 pt-8 sm:pb-0">
          {data.nearby && <NearbyStops stops={data.nearby} />}
          {data.lines && <NearbyLines lines={data.lines} />}
          {typeof data.stations30 === "number" && (
            <Row label="stanica za 30 min · s najbliže stanice">
              <Fact>{data.stations30}</Fact>
            </Row>
          )}
          {data.kvart && (
            <>
              <Row label="kvart">
                <Link
                  href={`/kvartovi/${data.kvart.slug}`}
                  className="shrink-0 font-heros text-body font-bold text-zg-blue transition-colors hover:text-navy"
                >
                  {data.kvart.name}
                </Link>
              </Row>
              <Row label="doseg za 30 min · prosjek kvarta">
                <Fact>{data.reachKm2} km²</Fact>
              </Row>
              <Row label="povezanost kvarta">
                <Fact>
                  {data.kvart.rank}. od {data.kvart.total}
                </Fact>
              </Row>
            </>
          )}
        </Section>
      )}

      <Section width="article" className="pb-4 sm:pb-6">
        <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2">
          <MonoLink href={karta}>točan doseg s ove adrese na karti</MonoLink>
          <MonoLink href="/">nova pretraga</MonoLink>
        </div>
      </Section>

      <Footer updated={loadLineIndex().generatedAt} />
    </EditorialShell>
  )
}
