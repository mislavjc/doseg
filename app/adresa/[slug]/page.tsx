import {
  IconArrowRight,
  IconBus,
  IconClock,
  IconMapPin,
  IconMoon,
} from "@central-icons-react/square-outlined-radius-0-stroke-2"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { Suspense } from "react"

import { cap, numberWordF, plural } from "@/app/linije/copy"
import { computeWalk } from "@/app/statistika/editorial/facts"
import { Footer } from "@/app/statistika/editorial/footer"
import { LineBadge } from "@/app/statistika/editorial/blocks"
import {
  Body,
  EditorialShell,
  Eyebrow,
  Hook,
  PageTitle,
  Section,
} from "@/app/statistika/editorial/primitives"
import { PoiRow, type PoiKey } from "@/app/statistika/editorial/poi"
import { HomeHero } from "@/app/home-hero"
import { FOCUS_SCALE } from "@/app/home-hero-variant"
import {
  BajsGauges,
  LedgerCell,
  LineTable,
  NearbyLines,
  StopGauges,
} from "@/components/doseg-readout"
import { resolveAdresaSlug, type ResolvedAdresa } from "@/lib/adresa"
import { loadScores } from "@/lib/district-scores"
import {
  dosegAt,
  type DosegAtPayload,
  type NearbyLine,
  type NearbyStop,
} from "@/lib/doseg-at"
import { projector } from "@/lib/geo"
import { loadHomeHero } from "@/lib/home-hero"
import { loadLineIndex } from "@/lib/line-data"
import {
  nearestBajs,
  nearestPois,
  type NearestBajs,
  type NearestPoi,
} from "@/lib/okolina"

/**
 * /adresa/[slug] — the doseg page for one address (Paper "Adresa — LOCK-IN ·
 * polasci + bajs + okolina"): the city banner zoomed to the point, an
 * icon-anchored fact ledger, then everything about THIS address — stop
 * distances against the city average, the per-line timetable on a 5-min walk,
 * nearest Bajs stations with live bike counts, and the nearest school, park
 * and hospital in the kvart Blizina row grammar. The kvart itself is one link
 * line; kvart-level storytelling stays on /kvartovi.
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

// ── Data-driven section hooks ────────────────────────────────────────────────

function stopsHook(nearby: NearbyStop[], cityAvgM: number | null) {
  const n = nearby.length
  if (cityAvgM !== null && n >= 2 && nearby[n - 1].distM <= cityAvgM)
    return `${cap(numberWordF(n))} stanice prije nego što prosjek grada uopće stigne do prve.`
  if (cityAvgM !== null)
    return nearby[0].distM <= cityAvgM
      ? "Najbliža stanica bliža je nego u prosjeku grada."
      : "Do najbliže stanice hoda se dulje nego u prosjeku grada."
  return `Najbliža stanica je ${nearby[0].name}, ${nearby[0].walkMin} min hoda.`
}

function linesHook(data: DosegAtPayload, minPeak: number | null) {
  if (minPeak !== null) {
    return data.firstDeparture && data.lastDeparture
      ? `Svakih ~${Math.round(minPeak)} minuta u špici, od ${data.firstDeparture} do ${data.lastDeparture}.`
      : `Najčešća ti linija ide svakih ~${Math.round(minPeak)} minuta u špici.`
  }
  const day = (data.lines ?? []).filter((l) => !l.isNight)
  const n = day.length
  if (n === 0) return "Ovdje staju samo noćne linije."
  const trams = day.filter((l) => l.mode === "tram").length
  let mode = "tramvaji i autobusi"
  if (trams === n) mode = n === 1 ? "tramvajska" : "sve tramvajske"
  else if (trams === 0) mode = n === 1 ? "autobusna" : "sve autobusne"
  return `${cap(numberWordF(n))} ${plural(n, "dnevna linija", "dnevne linije", "dnevnih linija")}, ${mode}.`
}

function bajsHook(stations: NearestBajs[], nearestStop?: NearbyStop) {
  const first = stations[0]
  if (nearestStop && first.distM < nearestStop.distM) {
    return `Bajs ti je bliže nego stanica: ${first.distM} ${plural(first.distM, "metar", "metra", "metara")}.`
  }
  return `Najbliži Bajs: ${first.name}, ${first.walkMin} min hoda.`
}

/** "Škola na minutu, park na četiri, bolnica na devet." — sorted by distance. */
function okolinaHook(pois: NearestPoi[]) {
  const t = (n: number) => (n === 1 ? "minutu" : numberWordF(n))
  return (
    pois
      .map((p, i) => {
        const label = POI_TITLE[p.key]
        return `${i === 0 ? label : label.toLowerCase()} na ${t(p.walkMin)}`
      })
      .join(", ") + "."
  )
}

// ── Sections ─────────────────────────────────────────────────────────────────

function Ledger({ data, minPeak }: { data: DosegAtPayload; minPeak: number | null }) {
  const nearest = data.nearby?.[0]
  const dayCount = data.lines?.filter((l) => !l.isNight).length ?? 0
  const nightCount = (data.lines?.length ?? 0) - dayCount
  const lineParts = [
    dayCount > 0 && `${dayCount} ${plural(dayCount, "dnevna", "dnevne", "dnevnih")}`,
    nightCount > 0 && `${nightCount} ${plural(nightCount, "noćna", "noćne", "noćnih")}`,
  ].filter(Boolean)

  // Up to 4 facts, hairline rows of 2 — each entry renders only when its data
  // exists, so thin addresses get a shorter band, never empty cells.
  const cells = [
    nearest && {
      key: "stanica",
      icon: IconMapPin,
      value: `${nearest.name} · ${nearest.distM} m`,
      label: `najbliža stanica · ${nearest.walkMin} min hoda`,
    },
    minPeak !== null && {
      key: "spica",
      icon: IconClock,
      value: `svakih ~${Math.round(minPeak)} min`,
      label: "najčešća linija u špici",
    },
    data.firstDeparture &&
      data.lastDeparture && {
        key: "polasci",
        icon: IconMoon,
        value: `${data.firstDeparture} → ${data.lastDeparture}`,
        label: "prvi i zadnji polazak",
      },
    lineParts.length > 0 && {
      key: "linije",
      icon: IconBus,
      value: lineParts.join(" + "),
      label: "linije na 5 min hoda",
    },
  ].filter((c) => !!c)
  if (!cells.length) return null

  const rows = []
  for (let i = 0; i < cells.length; i += 2) rows.push(cells.slice(i, i + 2))
  return (
    <Section
      width="article"
      className="pb-0 pt-10 sm:pb-0"
      innerClassName="flex flex-col divide-y divide-hairline border-y border-hairline"
    >
      {rows.map((row, i) => (
        <div key={i} className="flex flex-col gap-5 py-4 sm:flex-row sm:gap-10">
          {row.map((c) => (
            <LedgerCell key={c.key} icon={c.icon} value={c.value} label={c.label} />
          ))}
        </div>
      ))}
    </Section>
  )
}

function StaniceSection({
  nearby,
  cityAvgM,
}: {
  nearby: NearbyStop[]
  cityAvgM: number | null
}) {
  return (
    <Section width="article" className="pb-0 sm:pb-0" innerClassName="flex flex-col gap-6">
      <Eyebrow>stanice u blizini</Eyebrow>
      <Hook>{stopsHook(nearby, cityAvgM)}</Hook>
      <StopGauges stops={nearby} cityAvgM={cityAvgM} />
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {nearby.map((s) => (
          <MonoLink key={s.slug} href={`/stanice/${s.slug}`}>
            {s.name}
          </MonoLink>
        ))}
      </div>
    </Section>
  )
}

const TABLE_LINES = 4

function LinijeSection({
  data,
  withPeak,
  minPeak,
}: {
  data: DosegAtPayload
  withPeak: (NearbyLine & { peakMin: number })[]
  minPeak: number | null
}) {
  const lines = data.lines ?? []
  const shown = withPeak.slice(0, TABLE_LINES)
  const shownSet = new Set(shown.map((l) => l.broj))
  const restDay = lines.filter((l) => !l.isNight && !shownSet.has(l.broj))
  const night = lines.filter((l) => l.isNight)
  return (
    <Section width="article" className="pb-0 sm:pb-0" innerClassName="flex flex-col gap-6">
      <Eyebrow>linije</Eyebrow>
      <Hook>{linesHook(data, minPeak)}</Hook>
      {shown.length > 0 ? <LineTable lines={shown} /> : <NearbyLines lines={lines} />}
      {shown.length > 0 && (restDay.length > 0 || night.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {restDay.length > 0 && (
            <span className="font-mono text-label text-ink-muted">
              + još {restDay.length} {plural(restDay.length, "dnevna", "dnevne", "dnevnih")}:
            </span>
          )}
          {restDay.map((l) => (
            <LineBadge key={l.broj} broj={l.broj} mode={l.mode} href={`/linije/${l.broj}`} />
          ))}
          {night.length > 0 && (
            <span className="font-mono text-label text-ink-muted">· noćne:</span>
          )}
          {night.map((l) => (
            <LineBadge key={l.broj} broj={l.broj} mode={l.mode} href={`/linije/${l.broj}`} />
          ))}
        </div>
      )}
    </Section>
  )
}

/** Async so the GBFS fetch streams in behind the rest of the page (Suspense);
 *  renders nothing when the feed is down or no station is in walking range. */
async function BajsSection({
  lon,
  lat,
  nearestStop,
  karta,
}: {
  lon: number
  lat: number
  nearestStop?: NearbyStop
  karta: string
}) {
  const stations = await nearestBajs(lon, lat)
  if (!stations.length) return null
  return (
    <Section width="article" className="pb-0 sm:pb-0" innerClassName="flex flex-col gap-6">
      <Eyebrow>bajs</Eyebrow>
      <Hook>{bajsHook(stations, nearestStop)}</Hook>
      <BajsGauges stations={stations} />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-mono text-label text-ink-faint">broj bicikala je uživo ·</span>
        <MonoLink href={karta}>doseg Bajsom vidiš na karti</MonoLink>
      </div>
    </Section>
  )
}

const POI_TITLE: Record<PoiKey, string> = {
  school: "Škola",
  park: "Park",
  hospital: "Bolnica",
}

function OkolinaSection({ pois }: { pois: NearestPoi[] }) {
  return (
    <Section width="article" className="pb-0 sm:pb-0" innerClassName="flex flex-col gap-6">
      <Eyebrow>okolina</Eyebrow>
      <Hook>{okolinaHook(pois)}</Hook>
      <div className="flex flex-col">
        {pois.map((p) => (
          <PoiRow
            key={p.key}
            k={p.key}
            title={POI_TITLE[p.key]}
            detail={p.name}
            value={`${p.distM} m · ${p.walkMin} min hoda`}
            valueClassName="text-label"
          />
        ))}
      </div>
      <span className="font-mono text-label text-ink-faint">
        najbliže po zračnoj liniji, pješice · izvor: OpenStreetMap
      </span>
    </Section>
  )
}

/** The homepage KartaBanner recut for one address: the zoom window centres on
 *  the address (marker on the point) and the whole card opens the karta there. */
function AdresaKartaBanner({ adresa, karta }: { adresa: ResolvedAdresa; karta: string }) {
  const hero = loadHomeHero()
  const crop = hero?.desktop
  let img: { width: number; left: string; top: string } | null = null
  if (crop) {
    const viewW = crop.width / 2
    const viewH = crop.height / 2
    const [fx, fy] = projector(crop, viewW, viewH)(adresa.lon, adresa.lat)
    img = {
      width: viewW * FOCUS_SCALE,
      left: `calc(50% - ${(fx * FOCUS_SCALE).toFixed(0)}px)`,
      top: `calc(50% - ${(fy * FOCUS_SCALE).toFixed(0)}px)`,
    }
  }
  return (
    <Section width="article" className="pb-4 sm:pb-6">
      <div className="group relative flex gap-4 border border-hairline-strong transition-colors hover:border-zg-blue sm:gap-6">
        <span className="relative block w-24 shrink-0 self-stretch overflow-hidden sm:w-[150px]">
          {img && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/hero-zagreb.png"
                alt=""
                aria-hidden
                loading="lazy"
                className="absolute max-w-none [image-rendering:pixelated]"
                style={img}
              />
              <span className="absolute left-1/2 top-1/2 block size-3 -translate-x-1/2 -translate-y-1/2 border-2 border-white bg-zg-blue outline outline-1 outline-zg-blue" />
            </>
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col py-4 pr-4 sm:py-5 sm:pr-6">
          <Eyebrow>karta dosega</Eyebrow>
          <Hook className="mt-1.5 transition-colors group-hover:text-zg-blue">
            Točan doseg s ove adrese je na karti.
          </Hook>
          <Body className="mt-1.5 hidden sm:block">
            Doseg gore je prosjek kvarta. Klikni i vidi točno dokle stižeš:
            tramvajem, autobusom, vlakom i Bajsom.
          </Body>
          <span className="mt-3 inline-flex items-center gap-1 font-mono text-label text-zg-blue transition-colors group-hover:text-navy">
            <Link href={karta} className="absolute inset-0" aria-label="Otvori kartu s ove adrese" />
            otvori kartu s ove adrese
            <IconArrowRight size={14} className="shrink-0" />
          </span>
        </div>
      </div>
    </Section>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function AdresaPage({ params }: Params) {
  const { slug } = await params
  const adresa = resolveAdresaSlug(slug)
  if (!adresa) notFound()

  const data = dosegAt(adresa.lon, adresa.lat)
  const karta = `/karta?lat=${adresa.lat.toFixed(5)}&lon=${adresa.lon.toFixed(5)}`

  const scores = loadScores()
  const cityAvgM = (scores && computeWalk(scores)?.avg) ?? null
  const withPeak = (data.lines ?? [])
    .filter((l): l is NearbyLine & { peakMin: number } => !l.isNight && l.peakMin !== null)
    .sort((a, b) => a.peakMin - b.peakMin)
  const minPeak = withPeak[0]?.peakMin ?? null
  const pois = data.found ? nearestPois(adresa.lon, adresa.lat) : []

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
            ? `${data.reachKm2} km² grada za 30 minuta javnim prijevozom (prosjek kvarta). Sve ispod je izračunato za ovu adresu.`
            : "Ova adresa je izvan kvartova koje mjerimo — točan doseg pokazuje karta."}
        </Body>
      </Section>

      {data.found && (
        <>
          <Ledger data={data} minPeak={minPeak} />

          {data.nearby && data.nearby.length > 0 && (
            <StaniceSection nearby={data.nearby} cityAvgM={cityAvgM} />
          )}

          {data.lines && data.lines.length > 0 && (
            <LinijeSection data={data} withPeak={withPeak} minPeak={minPeak} />
          )}

          {/* Streams in behind the local sections — the GBFS fetch (up to 5s
              on a cold feed) must not block first byte of the page shell. */}
          <Suspense fallback={null}>
            <BajsSection
              lon={adresa.lon}
              lat={adresa.lat}
              nearestStop={data.nearby?.[0]}
              karta={karta}
            />
          </Suspense>

          {pois.length > 0 && <OkolinaSection pois={pois} />}

          {data.kvart && (
            <Section width="article" className="pb-0 sm:pb-0">
              <MonoLink href={`/kvartovi/${data.kvart.slug}`}>
                kvart ove adrese: {data.kvart.name} · {data.kvart.rank}. od {data.kvart.total}{" "}
                po dosegu
              </MonoLink>
            </Section>
          )}
        </>
      )}

      <AdresaKartaBanner adresa={adresa} karta={karta} />

      <Footer updated={loadLineIndex().generatedAt} />
    </EditorialShell>
  )
}
