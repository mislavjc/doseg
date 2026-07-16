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
import { resolveAdresaSlug } from "@/lib/adresa"
import { loadScores, reachKm2 } from "@/lib/district-scores"
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

/** Probaj chips under the search box: addresses first (the headline product),
 *  then a stop and the top GSC lines. Address chips are nofollow — the
 *  /adresa pages are noindex and shouldn't cost crawl budget. */
const QUICK_ADDRESSES = [
  { label: "Savska cesta 25", slug: "savska-cesta-25" },
  { label: "Ilica 5", slug: "ilica-5" },
] as const
const QUICK_LINES = ["107", "15"] as const
const QUICK_STOPS = [{ label: "kvaternikov trg", slug: "kvaternikov-trg" }] as const

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
  // Doseg-first positioning (Paper "Home v3.0 — doseg-first"): the name is the
  // thesis, the address is the entry point, the imenik is demoted below.
  return (
    <Section width="article" className="pb-0 pt-6 sm:pb-0 sm:pt-8">
      <Eyebrow>doseg.hr · dostupnost javnog prijevoza u zagrebu</Eyebrow>
      <PageTitle className="mt-4">
        Doseg: koliko grada dosežeš javnim prijevozom.
      </PageTitle>
      <Body className="mt-3 max-w-[520px]">
        Upiši svoju adresu i vidi dokle stižeš za 30 minuta: tramvajem,
        autobusom, vlakom i Bajsom. Ocjena povezanosti za svaki kvart, svaku
        liniju i svako stajalište.
      </Body>
    </Section>
  )
}

export function SearchBlock({ stopSlugs }: { stopSlugs: Set<string> }) {
  return (
    <Section width="article" className="pb-0 pt-8 sm:pb-0 sm:pt-10">
      <HomeSearch />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-label text-ink-muted">probaj:</span>
        {QUICK_ADDRESSES.map((a) => (
          <Link
            key={a.slug}
            href={`/adresa/${a.slug}`}
            rel="nofollow"
            className="flex h-6 items-center border border-hairline-strong px-2 font-mono text-label text-ink transition-colors hover:border-zg-blue hover:text-zg-blue"
          >
            {a.label}
          </Link>
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
        {QUICK_LINES.map((broj) => (
          <LineBadge key={broj} broj={broj} href={`/linije/${broj}`} />
        ))}
      </div>
    </Section>
  )
}

/** Frames the directory below as the source data of the doseg, answering
 *  "kome je namijenjen taj miks" — timetables are one product's inputs. */
export function ImenikIntro() {
  return (
    <Section width="article" className="pb-0 sm:pb-0">
      <Eyebrow>imenik · podaci iza dosega</Eyebrow>
      <Hook className="mt-4">
        Svaka linija, stanica i kvart ima svoju stranicu.
      </Hook>
      <Body className="mt-3 max-w-[520px]">
        Polasci po satu, prvi i zadnji polazak, interval u špici. Isti podaci
        iz kojih se računa doseg.
      </Body>
    </Section>
  )
}

/** Teaser into /statistika with the live best/worst kvart reach numbers. */
export function StatistikaTeaser() {
  const scores = loadScores()
  const ranked = scores
    ? [...scores.districts].sort((a, b) => a.rank - b.rank)
    : []
  const best = ranked[0]
  const worst = ranked[ranked.length - 1]
  return (
    <Section width="article" className="pb-4 sm:pb-6">
      <Eyebrow>statistika · 17 kvartova</Eyebrow>
      <Hook className="mt-4">Gdje mreža radi, a gdje staje.</Hook>
      <Body className="mt-3 max-w-[520px]">
        {scores && best && worst
          ? `${best.name} dosegne ${reachKm2(scores, best.avgReachableCells)} km², ${worst.name} ${reachKm2(scores, worst.avgReachableCells)}. `
          : ""}
        Analiza povezanosti po kvartu, dobu dana i udaljenosti do stanice.
      </Body>
      <div>
        <MoreLink href="/statistika">cijela analiza</MoreLink>
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

/** Banner into /karta right under the search (Paper "Karta banner · CTA
 *  redak", It3): a zoomed dither window with the address marker promises what
 *  clicking the karta returns, the probaj chip opens the karta centred on a
 *  seed address (this callout sells the karta, not the /adresa pages). The
 *  bitmap is the hero bake blown up to the hero's focus scale, so the thumb
 *  matches what the zoomed hero actually renders. */
export function KartaBanner() {
  const proba = resolveAdresaSlug("savska-cesta-25")
  const probaHref = proba
    ? `/karta?lat=${proba.lat.toFixed(5)}&lon=${proba.lon.toFixed(5)}`
    : "/karta"
  return (
    <Section width="article" className="pb-0 sm:pb-0">
      <div className="group relative flex gap-4 border border-hairline-strong transition-colors hover:border-zg-blue sm:gap-6">
        <span className="relative block w-24 shrink-0 self-stretch overflow-hidden sm:w-[150px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/hero-zagreb.png"
            alt=""
            aria-hidden
            loading="lazy"
            className="absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 [image-rendering:pixelated]"
            style={{ width: 6480 }}
          />
          <span className="absolute left-1/2 top-1/2 block size-3 -translate-x-1/2 -translate-y-1/2 border-2 border-white bg-zg-blue outline outline-1 outline-zg-blue" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col py-4 pr-4 sm:py-5 sm:pr-6">
          <Eyebrow>karta dosega</Eyebrow>
          <Hook className="mt-1.5 transition-colors group-hover:text-zg-blue">
            Koliko grada dosegneš za 30 minuta?
          </Hook>
          <Body className="mt-1.5 hidden sm:block">
            Klikni bilo koju adresu i vidi točan doseg, ne prosjek kvarta.
          </Body>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span className="flex items-center gap-2">
              <span className="font-mono text-label text-ink-muted">probaj:</span>
              <Link
                href={probaHref}
                rel="nofollow"
                className="relative z-10 flex h-6 items-center border border-hairline-strong px-2 font-mono text-label text-ink transition-colors hover:border-zg-blue hover:text-zg-blue"
              >
                Savska cesta 25
              </Link>
            </span>
            {/* Stretched link: the inset span makes the whole bordered card
                this link's hit area; the chip above opts out via z-10. */}
            <Link
              href="/karta"
              className="inline-flex items-center gap-1 font-mono text-label text-zg-blue transition-colors hover:text-navy"
            >
              <span aria-hidden className="absolute inset-0" />
              otvori kartu
              <IconArrowRight size={14} className="shrink-0" />
            </Link>
          </div>
        </div>
      </div>
    </Section>
  )
}
