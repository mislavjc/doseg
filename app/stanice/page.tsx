import type { Metadata } from "next"
import Link from "next/link"

import { Breadcrumb } from "@/app/statistika/editorial/blocks"
import { Footer } from "@/app/statistika/editorial/footer"
import { Hero } from "@/app/statistika/editorial/hero"
import { JsonLd } from "@/app/statistika/editorial/json-ld"
import { Body, EditorialShell, Eyebrow, Hook, PageTitle, Section } from "@/app/statistika/editorial/primitives"
import type { StopIndexEntry } from "@/lib/generated/StopIndexEntry"
import { loadStopIndex } from "@/lib/stop-data"

import { plural } from "../linije/copy"
import { LetterStrip } from "./letter-strip"
import { firstLetter, HR_LETTERS, letterId, MIN_LINES } from "./letters"

/**
 * /stanice — the hub for the stop pages, as an A–Ž directory (Paper "Imenik —
 * varijanta b"): every promoted stop (≥ MIN_LINES lines, the set the sitemap
 * carries while line pages index) listed alphabetically across the whole city,
 * the kvart shown as a suffix, with an A–Ž jump strip. Thin single-line stops
 * still have pages, reached via a line's stop list or a neighbour link.
 */

export const metadata: Metadata = {
  title: "Sve ZET stanice po imenu (A-Ž): linije i doseg | Doseg",
  description:
    "Sve veće stanice ZET-a po abecedi: koje linije staju, razmak u špici i dokle stigneš. Pronađi stanicu po imenu. Podaci iz službenog GTFS feeda.",
  alternates: { canonical: "/stanice" },
  openGraph: {
    type: "website",
    images: [{ url: "/og.jpg", width: 1200, height: 630 }],
  },
}


function StopRow({ stop }: { stop: StopIndexEntry }) {
  return (
    <li>
      <Link
        href={`/stanice/${stop.slug}`}
        className="group flex items-baseline justify-between gap-3 border-b border-hairline py-2"
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-heros text-[16px] leading-5 text-ink transition-colors group-hover:text-zg-blue">
            {stop.name}
          </span>
          {stop.kvart && (
            <span className="shrink-0 font-mono text-label text-ink-faint">{stop.kvart}</span>
          )}
        </span>
        <span className="shrink-0 font-mono text-label text-ink-muted">
          {stop.lineCount} {plural(stop.lineCount, "linija", "linije", "linija")}
        </span>
      </Link>
    </li>
  )
}

function LetterBlock({ letter, stops }: { letter: string; stops: StopIndexEntry[] }) {
  return (
    <div id={letterId(letter)} className="scroll-mt-24 pt-8 first:pt-0">
      <div className="flex items-center gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center border border-hairline-strong font-heros text-[16px] font-bold leading-none text-zg-blue">
          {letter}
        </span>
        <span className="h-px flex-1 bg-hairline-strong" />
      </div>
      <ul className="pt-2">
        {stops.map((s) => (
          <StopRow key={s.slug} stop={s} />
        ))}
      </ul>
    </div>
  )
}

export default function StaniceIndexPage() {
  const index = loadStopIndex()
  const promoted = index.stops.filter((s) => s.lineCount >= MIN_LINES)

  // Bucket by first letter, sort within each bucket (Croatian collation).
  const groups = new Map<string, StopIndexEntry[]>()
  for (const s of promoted) {
    const L = firstLetter(s.name)
    const bucket = groups.get(L)
    if (bucket) bucket.push(s)
    else groups.set(L, [s])
  }
  for (const arr of groups.values()) arr.sort((a, b) => a.name.localeCompare(b.name, "hr"))

  // Bucket order: the Croatian alphabet present here, then any leftovers (digits).
  const present = HR_LETTERS.filter((L) => groups.has(L))
  const extra = [...groups.keys()]
    .filter((k) => !(HR_LETTERS as readonly string[]).includes(k))
    .sort()
  const letters = [...present, ...extra]

  // JSON-LD order = the on-page order, derived from the already-sorted buckets.
  const alpha = letters.flatMap((L) => groups.get(L) ?? [])
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "ZET stanice",
    itemListElement: alpha.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `Stanica ${s.name}`,
      url: `https://doseg.hr/stanice/${s.slug}`,
    })),
  }

  return (
    <EditorialShell>
      <JsonLd data={itemListJsonLd} />
      <Hero active="stanice" />

      <Section width="article" className="pb-0 pt-10 sm:pb-0 sm:pt-14">
        <Breadcrumb trail={[{ label: "doseg.hr" }, { label: "sve stanice" }]} />
        <PageTitle className="mt-4">Sve stanice ZET-a, od A do Ž.</PageTitle>
        <Body className="mt-1 text-ink-muted">koje linije staju, razmak u špici i doseg</Body>
        <Body className="mt-5 max-w-[520px]">
          Svaka veća stanica ima svoju stranicu: linije koje ovdje staju, koliko
          često voze i dokle stigneš odavde. Pronađi je po imenu, kvart je
          naveden uz svaku. Podaci iz službenog GTFS feeda, osvježavaju se
          automatski.
        </Body>
      </Section>

      <Section width="article" className="pb-0 sm:pb-0">
        <Eyebrow>sve stanice · {promoted.length}</Eyebrow>
        <Hook className="mt-4">Cijeli grad, po abecedi.</Hook>
        <LetterStrip present={groups} className="mt-5" />
      </Section>

      <Section width="article" className="pt-4">
        {letters.map((L) => (
          <LetterBlock key={L} letter={L} stops={groups.get(L) ?? []} />
        ))}
      </Section>

      <Footer updated={index.generatedAt} />
    </EditorialShell>
  )
}
