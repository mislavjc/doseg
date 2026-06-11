import type { Metadata } from "next"
import Link from "next/link"

import { Footer } from "@/app/statistika/editorial/footer"
import { Hero } from "@/app/statistika/editorial/hero"
import {
  Body,
  EditorialShell,
  Eyebrow,
  Hook,
  PageTitle,
  Section,
} from "@/app/statistika/editorial/primitives"
import type { LineIndexEntry } from "@/lib/generated/LineIndexEntry"
import { loadLineIndex } from "@/lib/line-data"

import { plural } from "./copy"

export const metadata: Metadata = {
  title: "Sve ZET linije na jednom mjestu: vozni redovi i stanice | Doseg",
  description:
    "Vozni red, trasa i doseg svake tramvajske i autobusne linije ZET-a. Podaci iz službenog GTFS feeda, osvježavaju se automatski.",
  alternates: { canonical: "/linije" },
  openGraph: {
    type: "website",
    images: [{ url: "/og.jpg", width: 1200, height: 630 }],
  },
}

/** Right-column fact for a row: peak headway, or daily departures. */
function rowFact(line: LineIndexEntry): string {
  const peak = line.peakHeadwayMin
  if (peak && peak <= 60) return `svakih ${Math.round(peak)} min`
  return `${line.dailyDepartures} pol. dnevno`
}

function LineRow({ line }: { line: LineIndexEntry }) {
  return (
    <li>
      <Link
        href={`/linije/${line.broj}`}
        className="group flex items-center gap-3.5 border-b border-hairline py-2.5"
      >
        <span className="flex h-6 w-[34px] shrink-0 items-center justify-center bg-zg-blue font-mono text-label text-white">
          {line.broj}
        </span>
        <span className="min-w-0 truncate font-heros text-[16px] leading-6 text-ink transition-colors group-hover:text-zg-blue">
          {line.terminals[0]} - {line.terminals[1]}
        </span>
        <span className="h-3 min-w-3 flex-1 border-b border-dotted border-hairline-strong" />
        <span className="shrink-0 font-mono text-label text-ink-muted">
          {rowFact(line)}
        </span>
      </Link>
    </li>
  )
}

function LineGroup({
  lines,
  topCount,
  moreLabel,
}: {
  lines: LineIndexEntry[]
  topCount: number
  moreLabel: string
}) {
  const top = lines.slice(0, topCount)
  const rest = lines.slice(topCount)
  return (
    <div className="pt-6">
      <ul>
        {top.map((l) => (
          <LineRow key={l.broj} line={l} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="group/det">
          <summary className="cursor-pointer list-none pt-4 font-mono text-[16px] leading-6 text-zg-blue transition-colors hover:text-navy [&::-webkit-details-marker]:hidden">
            <span className="group-open/det:hidden">{moreLabel} →</span>
            <span className="hidden group-open/det:inline">manje ↑</span>
          </summary>
          <ul className="pt-2">
            {rest.map((l) => (
              <LineRow key={l.broj} line={l} />
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

export default function LinijeIndexPage() {
  const index = loadLineIndex()
  const byDeps = (a: LineIndexEntry, b: LineIndexEntry) =>
    b.dailyDepartures - a.dailyDepartures
  const dayTrams = index.lines
    .filter((l) => l.mode === "tram" && !l.isNight)
    .sort(byDeps)
  const nightLines = index.lines.filter((l) => l.isNight)
  const buses = index.lines
    .filter((l) => l.mode === "bus" && !l.isNight)
    .sort(byDeps)
  const nightHeadway = nightLines[0]?.avgHeadwayMin

  return (
    <EditorialShell>
      <Hero active="linije" />

      <Section width="article" className="pb-0 pt-10 sm:pb-0 sm:pt-14">
        <p className="font-mono text-label text-ink-faint">
          doseg.hr / sve linije
        </p>
        <PageTitle className="mt-4">Sve ZET linije na jednom mjestu.</PageTitle>
        <Body className="mt-1 text-ink-muted">
          vozni red, trasa i doseg svake linije
        </Body>
        <Body className="mt-5 max-w-[520px]">
          Svaka linija ima svoju stranicu: polasci po satu, popis stanica s
          presjedanjima i doseg s karte. Podaci dolaze iz službenog GTFS feeda
          i osvježavaju se automatski.
        </Body>
      </Section>

      <Section width="article" className="pb-0 sm:pb-0">
        <Eyebrow>
          tramvaji · {dayTrams.length}{" "}
          {plural(dayTrams.length, "dnevna linija", "dnevne linije", "dnevnih linija")}
        </Eyebrow>
        <Hook className="mt-4">Tramvajska mreža.</Hook>
        <LineGroup
          lines={dayTrams}
          topCount={8}
          moreLabel={`svih ${dayTrams.length} tramvajskih linija`}
        />
      </Section>

      <Section width="article" className="pb-0 sm:pb-0">
        <Eyebrow>
          autobusi · {buses.length}{" "}
          {plural(buses.length, "linija", "linije", "linija")}
        </Eyebrow>
        <Hook className="mt-4">Autobusna mreža.</Hook>
        <LineGroup
          lines={buses}
          topCount={8}
          moreLabel={`svih ${buses.length} autobusnih linija`}
        />
      </Section>

      <Section width="article">
        <Eyebrow>
          noćne linije · {nightLines.length}{" "}
          {plural(nightLines.length, "linija", "linije", "linija")}
        </Eyebrow>
        <Hook className="mt-4">Grad ne spava skroz.</Hook>
        <Body className="mt-3 max-w-[520px] text-ink-muted">
          Noćni tramvaji 31 do 34 preuzimaju mrežu dok dnevne linije spavaju
          {nightHeadway
            ? `, s polascima otprilike svakih ${Math.round(nightHeadway)} minuta`
            : ""}
          .
        </Body>
        <div className="pt-2">
          <ul>
            {nightLines.map((l) => (
              <LineRow key={l.broj} line={l} />
            ))}
          </ul>
        </div>
      </Section>

      <Footer updated={index.generatedAt} />
    </EditorialShell>
  )
}
