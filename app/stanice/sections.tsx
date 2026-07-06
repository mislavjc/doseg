import { IconArrowUpRight } from "@central-icons-react/square-outlined-radius-0-stroke-2"
import Link from "next/link"

import {
  Breadcrumb,
  FactRow,
  LineBadge,
  PillLink,
  PrevNext as KitPrevNext,
  SectionHeader,
} from "@/app/statistika/editorial/blocks"
import { type FaqItem } from "@/app/statistika/editorial/faq"
import { Body, PageTitle } from "@/app/statistika/editorial/primitives"
import { fmtHR } from "@/lib/format"
import type { StopPageData } from "@/lib/generated/StopPageData"
import { kvartSlug } from "@/lib/kvart-slug"
import type { SiblingStop } from "@/lib/stop-data"

import {
  directionLabel,
  directionNote,
  dosegCopy,
  introText,
  lineHeadway,
  lineListProse,
  lineModeNoun,
  mostFrequentLine,
  subtitle,
} from "./copy"
import { numberWordF, plural } from "../linije/copy"

/**
 * Server sections of the /stanice/[slug] page (Paper "Stanica Reljkovićeva —
 * pSEO V1"). Mirrors the line-page editorial system; shared chrome comes from
 * the editorial kit. All copy is templated from the committed stop data, with
 * no live "next departure" — headway only.
 */

// ── Naslov (breadcrumb + title + subtitle + lede) ───────────────────────────

export function Naslov({ data }: { data: StopPageData }) {
  return (
    <>
      <Breadcrumb
        trail={[
          { label: "sve stanice", href: "/stanice" },
          ...(data.kvart
            ? [{ label: data.kvart, href: `/kvartovi/${kvartSlug(data.kvart)}` }]
            : []),
          { label: data.name.toLowerCase() },
        ]}
      />
      <PageTitle className="mt-4">Stanica {data.name}.</PageTitle>
      <Body className="mt-1 text-ink-muted">{subtitle(data)}</Body>
      <Body className="mt-5 max-w-[520px]">{introText(data)}</Body>
    </>
  )
}

// ── Činjenice ───────────────────────────────────────────────────────────────

export function Cinjenice({ data }: { data: StopPageData }) {
  const mf = mostFrequentLine(data)
  return (
    <div>
      <FactRow label="linije koje staju" value={String(data.lineCount)} />
      {data.kvart && (
        <FactRow
          label="kvart"
          value={data.kvart}
          href={`/kvartovi/${kvartSlug(data.kvart)}`}
        />
      )}
      <FactRow
        label="prvi i zadnji polazak"
        value={`${data.firstDeparture} · ${data.lastDeparture}`}
      />
      {mf && <FactRow label="najčešća linija" value={`${mf.line.broj} · ${mf.headway}`} />}
    </div>
  )
}

// ── Linije koje ovdje staju (rows) ──────────────────────────────────────────

function LinijaRow({ line }: { line: StopPageData["lines"][number] }) {
  const hw = lineHeadway(line)
  return (
    <li>
      <Link
        href={`/linije/${line.broj}`}
        className="group flex items-center gap-3.5 border-b border-hairline py-2.5"
      >
        <LineBadge broj={line.broj} />
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-heros text-[16px] leading-6 text-ink transition-colors group-hover:text-zg-blue">
            smjer {line.headsign}
          </span>
          <span className="shrink-0 font-mono text-label text-ink-faint">
            {lineModeNoun(line)}
            {line.isLoop && " · kružna"}
          </span>
        </span>
        <span className="h-3 min-w-3 flex-1 border-b border-dotted border-hairline-strong" />
        {hw && (
          <span className="shrink-0 font-mono text-label text-ink-muted">{hw}</span>
        )}
      </Link>
    </li>
  )
}

export function LinijeKojeStaju({ data }: { data: StopPageData }) {
  const n = data.lineCount
  const dir = directionLabel(data)
  return (
    <div>
      <SectionHeader
        eyebrow="linije koje ovdje staju"
        hook={`${numberWordF(n).charAt(0).toUpperCase() + numberWordF(n).slice(1)} ${plural(n, "linija", "linije", "linija")}${dir ? `, ${dir}.` : "."}`}
      >
        Svaka linija vodi na svoju stranicu s punim voznim redom. Brojke su
        tipičan razmak vozila radnim danom u špici.
      </SectionHeader>
      <ul>
        {data.lines.map((line) => (
          <LinijaRow key={`${line.mode}-${line.broj}`} line={line} />
        ))}
      </ul>
    </div>
  )
}

// ── Doseg odavde (15 / 30 / 45 reach bands) ─────────────────────────────────

export function DosegOdavde({ data }: { data: StopPageData }) {
  const copy = dosegCopy(data)
  if (!copy || !data.reach) return null
  const bands: [string, number][] = [
    ["za 15 min", data.reach.stations15],
    ["za 30 min", data.reach.stations30],
    ["za 45 min", data.reach.stations45],
  ]
  return (
    <div>
      <SectionHeader eyebrow="doseg odavde" hook={copy.hook}>
        {copy.lede}
      </SectionHeader>
      <div className="flex gap-6 sm:gap-10">
        {bands.map(([label, count]) => (
          <div key={label} className="flex-1 border-t-2 border-zg-blue pt-3">
            <p className="font-mono text-label text-ink-faint">{label}</p>
            <p className="mt-1 font-heros text-head font-bold text-ink">
              {count} <span className="font-normal text-ink-muted">stanica</span>
            </p>
          </div>
        ))}
      </div>
      <Link
        href={`/?lat=${data.lat}&lon=${data.lon}`}
        rel="nofollow"
        className="mt-5 inline-flex items-center gap-1.5 font-mono text-[16px] leading-6 text-zg-blue transition-colors hover:text-navy"
      >
        otvori kartu dosega odavde
        <IconArrowUpRight size={16} className="shrink-0" />
      </Link>
    </div>
  )
}

// ── Susjedne stanice ────────────────────────────────────────────────────────

export function SusjedneStanice({ data }: { data: StopPageData }) {
  if (data.neighbors.length === 0) return null
  return (
    <div>
      <SectionHeader eyebrow="susjedne stanice" hook="Stanice u blizini.">
        Stanice prije i poslije, na istim linijama.
      </SectionHeader>
      <div className="flex flex-wrap gap-2.5">
        {data.neighbors.map((n) =>
          n.slug ? (
            <PillLink key={n.slug} href={`/stanice/${n.slug}`}>
              {n.name}
            </PillLink>
          ) : (
            <PillLink key={n.name} muted>
              {n.name}
            </PillLink>
          )
        )}
      </div>
    </div>
  )
}

// ── Istoimene stanice (same-name disambiguation) ────────────────────────────

function fmtDist(m: number): string {
  return m < 950 ? `${m} m` : `${fmtHR(m / 1000, 1)} km`
}

export function IstoimeneStanice({
  name,
  siblings,
}: {
  name: string
  siblings: SiblingStop[]
}) {
  if (siblings.length === 0) return null
  const n = siblings.length
  const count = `${numberWordF(n)} ${plural(n, "stanica", "stanice", "stanica")}`
  const verb = n === 1 ? "Postoji" : "Postoje"
  return (
    <div>
      <SectionHeader eyebrow="istoimene stanice" hook={`${verb} još ${count} imena ${name}.`}>
        Različite lokacije s istim imenom. Provjeri kvart i udaljenost da ne
        zamijeniš stanicu.
      </SectionHeader>
      <div className="flex flex-wrap gap-2.5">
        {siblings.map((s) => (
          <PillLink key={s.slug} href={`/stanice/${s.slug}`}>
            {s.kvart ?? "Zagreb"} · {fmtDist(s.distM)}
          </PillLink>
        ))}
      </div>
    </div>
  )
}

// ── Prev / next ─────────────────────────────────────────────────────────────

export function PrevNext({ data }: { data: StopPageData }) {
  return (
    <KitPrevNext
      prev={
        data.prevSlug
          ? { href: `/stanice/${data.prevSlug}`, label: "prethodna stanica" }
          : null
      }
      next={
        data.nextSlug
          ? { href: `/stanice/${data.nextSlug}`, label: "sljedeća stanica" }
          : null
      }
    />
  )
}

// ── FAQ + JSON-LD ───────────────────────────────────────────────────────────

export function buildFaq(data: StopPageData): FaqItem[] {
  const items: FaqItem[] = []
  const n = data.lineCount

  items.push({
    q: `Koje linije staju na stanici ${data.name}?`,
    a: `${lineListProse(data)}. Ukupno ${numberWordF(n)} ${plural(n, "linija", "linije", "linija")}${directionNote(data)}.`,
  })

  const nearest = data.neighbors.slice(0, 2).map((x) => x.name)
  const locParts: string[] = []
  if (data.kvart) locParts.push(`Stanica ${data.name} nalazi se u kvartu ${data.kvart}.`)
  if (nearest.length > 0)
    locParts.push(
      `Najbliže susjedne stanice su ${nearest.join(nearest.length > 1 ? " i " : "")}.`
    )
  if (locParts.length > 0) {
    items.push({ q: `Gdje se nalazi stanica ${data.name}?`, a: locParts.join(" ") })
  }

  const mf = mostFrequentLine(data)
  const freq = mf
    ? ` Najčešća linija (${lineModeNoun(mf.line)} ${mf.line.broj}) ${
        mf.inPeak ? "u špici " : ""
      }vozi ${mf.headway}.`
    : ""
  items.push({
    q: `Kada vozi prvi i zadnji polazak sa stanice ${data.name}?`,
    a: `Prvi polazak sa stanice je u ${data.firstDeparture}, a zadnji u ${data.lastDeparture}.${freq}`,
  })

  return items
}

/**
 * Geo schema for the stop. `BusStop` only when the stop is bus-only — a tram or
 * mixed stop would be mislabelled, so those emit the generic `Place`.
 */
export function stopJsonLd(data: StopPageData) {
  return {
    "@context": "https://schema.org",
    "@type": data.mode === "bus" ? "BusStop" : "Place",
    name: `Stanica ${data.name}`,
    geo: {
      "@type": "GeoCoordinates",
      latitude: data.lat,
      longitude: data.lon,
    },
    ...(data.kvart && {
      address: {
        "@type": "PostalAddress",
        addressLocality: "Zagreb",
        addressRegion: data.kvart,
      },
    }),
    url: `https://doseg.hr/stanice/${data.slug}`,
  }
}
