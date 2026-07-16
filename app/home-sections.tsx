import { IconArrowRight } from "@central-icons-react/square-outlined-radius-0-stroke-2"
import Link from "next/link"
import type { ReactNode } from "react"

import { LineBadge } from "@/app/statistika/editorial/blocks"
import {
  Body,
  Eyebrow,
  Hook,
  PageTitle,
  Section,
} from "@/app/statistika/editorial/primitives"
import type { LineIndexEntry } from "@/lib/generated/LineIndexEntry"
import { HomeSearch } from "@/components/home-search"

import { plural } from "./linije/copy"
import { LineRow } from "./linije/line-row"
import { LetterStrip } from "./stanice/letter-strip"

/**
 * Homepage sections (Paper "Home v1.1 — Imenik + traženo"), composed by
 * app/page.tsx. Desktop and mobile diverge per the two approved boards:
 * tram/bus sections + A–Ž strip on desktop, one linije group + an index
 * ledger on mobile.
 */

/** GSC-sourced quick links under the search box (top queries, 28d). */
const QUICK_LINES = ["107", "269", "241", "15"] as const
const QUICK_STOPS = [
  { label: "kvaternikov trg", slug: "kvaternikov-trg" },
  { label: "heinzelova", slug: "heinzelova" },
] as const

/** Real search phrases people land with (GSC, 28d) → the page that answers. */
const TRAZENO = [
  { query: "zet bus 107 stanice", label: "linija 107", href: "/linije/107" },
  {
    query: "koji tramvaj vozi do Heinzelove",
    label: "stanica Heinzelova",
    href: "/stanice/heinzelova",
  },
  { query: "269 vozni red stanice", label: "linija 269", href: "/linije/269" },
  { query: "tramvaj za Kruge", label: "stanica Kruge", href: "/stanice/kruge-trnje" },
] as const

/** Blue "svih N linija →"-style trailing link under a row group. */
function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 pt-4 font-mono text-[16px] leading-6 text-zg-blue transition-colors hover:text-navy"
    >
      {children}
      <IconArrowRight size={16} className="shrink-0" />
    </Link>
  )
}

/** Small blue mono label with a trailing arrow (row metas, inline links). */
function ArrowLabel({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 font-mono text-label text-zg-blue">
      {children}
      <IconArrowRight size={14} className="shrink-0" />
    </span>
  )
}

export function HeroIntro() {
  // The dither banner above already breathes; keep the intro close to its fade.
  return (
    <Section width="article" className="pb-0 pt-6 sm:pb-0 sm:pt-8">
      <Eyebrow>doseg.hr · vozni redovi i doseg zet mreže</Eyebrow>
      <PageTitle className="mt-4">
        Svaka ZET linija, stanica i kvart na jednom mjestu.
      </PageTitle>
      <Body className="mt-3 max-w-[520px]">
        Polasci po satu, popis stanica u oba smjera i koliko grada dosežeš
        javnim prijevozom za 30 minuta.
      </Body>
    </Section>
  )
}

export function SearchBlock({ stopSlugs }: { stopSlugs: Set<string> }) {
  return (
    <Section width="article" className="pb-0 pt-8 sm:pb-0 sm:pt-10">
      <HomeSearch />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-label text-ink-muted">
          brzi linkovi:
        </span>
        {QUICK_LINES.map((broj) => (
          <LineBadge key={broj} broj={broj} href={`/linije/${broj}`} />
        ))}
        {QUICK_STOPS.filter((s) => stopSlugs.has(s.slug)).map((s) => (
          <Link
            key={s.slug}
            href={`/stanice/${s.slug}`}
            className="flex h-6 items-center border border-hairline-strong px-2 font-mono text-label text-ink transition-colors hover:border-zg-blue hover:text-zg-blue"
          >
            {s.label}
          </Link>
        ))}
      </div>
    </Section>
  )
}

/** Desktop-only line section (used for both tramvaji and autobusi). */
export function DesktopLineSection({
  eyebrow,
  hook,
  lines,
  moreLabel,
}: {
  eyebrow: string
  hook: string
  lines: LineIndexEntry[]
  moreLabel: string
}) {
  return (
    <Section width="article" className="hidden pb-0 sm:block sm:pb-0">
      <Eyebrow>{eyebrow}</Eyebrow>
      <Hook className="mt-4">{hook}</Hook>
      <ul className="pt-6">
        {lines.map((l) => (
          <LineRow key={l.broj} line={l} />
        ))}
      </ul>
      <MoreLink href="/linije">{moreLabel}</MoreLink>
    </Section>
  )
}

/** Mobile-only mixed linije group with a group header row. */
export function MobileLineGroup({
  total,
  lines,
}: {
  total: number
  lines: LineIndexEntry[]
}) {
  return (
    <Section width="article" className="pb-0 sm:hidden">
      <div className="flex items-baseline justify-between gap-3 border-b border-hairline pb-2">
        <Eyebrow>linije · {total}</Eyebrow>
        <Link href="/linije">
          <ArrowLabel>sve</ArrowLabel>
        </Link>
      </div>
      <ul>
        {lines.map((l) => (
          <LineRow key={l.broj} line={l} />
        ))}
      </ul>
    </Section>
  )
}

/** Desktop-only stanice section with the A–Ž jump strip into /stanice. */
export function StaniceSection({
  stopCount,
  letters,
}: {
  stopCount: number
  letters: Set<string>
}) {
  return (
    <Section width="article" className="hidden pb-0 sm:block sm:pb-0">
      <Eyebrow>
        stanice · {stopCount}{" "}
        {plural(stopCount, "stajalište", "stajališta", "stajališta")}
      </Eyebrow>
      <Hook className="mt-4">Svaka stanica ima svoju stranicu.</Hook>
      <Body className="mt-3 max-w-[520px]">
        Koje linije staju, prvi i zadnji polazak i interval u špici. Potraži
        svoju u imeniku.
      </Body>
      <LetterStrip present={letters} hrefBase="/stanice" className="mt-5" />
      <div>
        <MoreLink href="/stanice">imenik svih stanica</MoreLink>
      </div>
    </Section>
  )
}

function LedgerRow({
  title,
  meta,
  href,
}: {
  title: string
  meta: string
  href: string
}) {
  return (
    <li>
      <Link
        href={href}
        className="group flex items-center justify-between gap-3 border-b border-hairline py-3"
      >
        <span className="font-heros text-body font-bold text-ink transition-colors group-hover:text-zg-blue">
          {title}
        </span>
        <ArrowLabel>{meta}</ArrowLabel>
      </Link>
    </li>
  )
}

/** Mobile-only index ledger (Stanice / Kvartovi / Promjene). */
export function MobileLedger({ stopCount }: { stopCount: number }) {
  return (
    <Section width="article" className="pb-0 sm:hidden">
      <ul className="border-t border-hairline">
        <LedgerRow title="Stanice" meta={`imenik ${stopCount}`} href="/stanice" />
        <LedgerRow title="Kvartovi" meta="svih 17" href="/kvartovi" />
        <LedgerRow title="Promjene" meta="zadnje izmjene" href="/promjene" />
      </ul>
    </Section>
  )
}

/** Real GSC queries, each linking to the page that answers it. Stop links
 *  are validated against the live index so a feed roll that prunes a slug
 *  drops the row instead of shipping a dead homepage link. */
export function TrazenoSection({ stopSlugs }: { stopSlugs: Set<string> }) {
  const items = TRAZENO.filter((t) => {
    const stopSlug = t.href.match(/^\/stanice\/(.+)$/)?.[1]
    return !stopSlug || stopSlugs.has(stopSlug)
  })
  return (
    <Section width="article" className="pb-0 sm:pb-0">
      <Eyebrow>iz stvarnih google upita · zadnjih 28 dana</Eyebrow>
      <Hook className="mt-4">Ljudi upravo traže.</Hook>
      <ul className="pt-4">
        {items.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              className="group flex flex-col gap-0.5 border-b border-hairline py-2.5 sm:flex-row sm:items-center sm:gap-3.5"
            >
              <span className="font-heros text-body text-ink transition-colors group-hover:text-zg-blue">
                “{t.query}”
              </span>
              <span className="hidden h-3 min-w-3 flex-1 border-b border-dotted border-hairline-strong sm:block" />
              <ArrowLabel>{t.label}</ArrowLabel>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  )
}

/** Teaser into the interactive map at /karta (dither thumbnail + hook). */
export function KartaTeaser() {
  return (
    <Section width="article" className="pb-4 sm:pb-6">
      <Link href="/karta" className="group flex items-start gap-4 sm:gap-6">
        <span className="relative block h-24 w-24 shrink-0 overflow-hidden sm:h-[120px] sm:w-[200px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/hero-map.png"
            alt=""
            aria-hidden
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: "center 46%" }}
          />
        </span>
        <span className="flex min-w-0 flex-col">
          <Eyebrow>karta dosega</Eyebrow>
          <Hook as="span" className="mt-1.5">
            Koliko grada dosegneš za 30 minuta?
          </Hook>
          <Body className="mt-1.5 hidden max-w-[396px] sm:block">
            Klikni bilo koju adresu i vidi dokle stigneš tramvajem, autobusom,
            vlakom i BAJS biciklom.
          </Body>
          <span className="mt-2">
            <ArrowLabel>otvori kartu</ArrowLabel>
          </span>
        </span>
      </Link>
    </Section>
  )
}
