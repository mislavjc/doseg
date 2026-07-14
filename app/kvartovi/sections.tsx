import {
  IconArrowUpRight,
  IconMedicalCross,
  IconPark,
  IconSchool,
} from "@central-icons-react/square-outlined-radius-0-stroke-2"
import Link from "next/link"

import {
  Breadcrumb,
  FactRow,
  LineBadge,
  PillLink,
  SectionHeader,
} from "@/app/statistika/editorial/blocks"
import { faqJsonLd, type FaqItem } from "@/app/statistika/editorial/faq"
import {
  JsonLd,
  breadcrumbJsonLd,
} from "@/app/statistika/editorial/json-ld"
import { Body, Hook, MonoLabel } from "@/app/statistika/editorial/primitives"
import { SiteNav } from "@/app/statistika/editorial/site-nav"
import { HeroPicture } from "@/components/hero-picture"
import { mercatorY } from "@/lib/geo"
import type { LineHeroCrop } from "@/lib/line-data"
import { scoreColor, scoreTextColor } from "@/lib/score-color"
import { cn } from "@/lib/utils"
import type { KvartData } from "@/lib/kvart-data"

import { plural } from "../linije/copy"

/**
 * Kvart scorecard sections. Visual language is the statistika editorial kit
 * (16/12 type, Zagreb blue, sharp corners). Shared chrome (SectionHeader,
 * FactRow, Breadcrumb, LineBadge, JsonLd) comes from the kit; only the kvart
 * hero + data-specific blocks live here. Reachability tints reuse the shared
 * score ramp so the colour meaning stays identical across the site.
 */

// ── Hero: dithered map cropped to the kvart, with its border ────────────────

function kvartProjector(crop: LineHeroCrop, viewW: number, viewH: number) {
  const yTop = mercatorY(crop.north)
  const yBottom = mercatorY(crop.south)
  return (lon: number, lat: number): [number, number] => [
    ((lon - crop.west) / (crop.east - crop.west)) * viewW,
    ((mercatorY(lat) - yTop) / (yBottom - yTop)) * viewH,
  ]
}

function KvartHeroVariant({
  data,
  crop,
  src,
  variant,
  className,
}: {
  data: KvartData
  crop: LineHeroCrop
  src: string
  variant: "desktop" | "mobile"
  className?: string
}) {
  const viewW = crop.width / 2
  const viewH = crop.height / 2
  const project = kvartProjector(crop, viewW, viewH)
  const pts = data.boundary.map(([lon, lat]) => project(lon, lat))
  const path = pts.length
    ? `M ${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ")} Z`
    : ""
  const cx = pts.reduce((s, p) => s + p[0], 0) / (pts.length || 1)
  const cy = pts.reduce((s, p) => s + p[1], 0) / (pts.length || 1)
  const lw = data.name.length * 8.9 + 20
  const lh = 28
  const lx = Math.min(Math.max(cx - lw / 2, 8), viewW - lw - 8)
  const ly = Math.min(Math.max(cy - lh / 2, 84), viewH - lh - 8)
  return (
    <div
      className={cn("relative w-full overflow-clip", className)}
      style={{ aspectRatio: `${crop.width} / ${crop.height}` }}
    >
      <HeroPicture
        src={src}
        alt={`Karta kvarta ${data.name} u Zagrebu`}
        variant={variant}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/hero-cloud.png"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover [image-rendering:pixelated]"
      />
      {path && (
        <svg
          aria-hidden
          viewBox={`0 0 ${viewW} ${viewH}`}
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 h-full w-full"
        >
          <path d={path} fill="var(--zg-blue)" fillOpacity={0.08} stroke="#fff" strokeWidth={6} strokeLinejoin="round" />
          <path d={path} fill="none" stroke="var(--zg-blue)" strokeWidth={3} strokeLinejoin="round" />
          <rect x={lx} y={ly} width={lw} height={lh} fill="var(--zg-blue)" />
          <text
            x={lx + lw / 2}
            y={ly + lh / 2 + 5.5}
            textAnchor="middle"
            fontSize={16}
            fontWeight={700}
            fontFamily="var(--font-heros), system-ui, sans-serif"
            fill="#fff"
          >
            {data.name}
          </text>
        </svg>
      )}
    </div>
  )
}

export function KvartHero({ data }: { data: KvartData }) {
  return (
    <header className="relative bg-white">
      {data.hero ? (
        <>
          <KvartHeroVariant
            data={data}
            crop={data.hero.desktop}
            src={`/kvart/hero-${data.slug}.png`}
            variant="desktop"
            className="hidden sm:block"
          />
          <KvartHeroVariant
            data={data}
            crop={data.hero.mobile}
            src={`/kvart/hero-${data.slug}-m.png`}
            variant="mobile"
            className="sm:hidden"
          />
        </>
      ) : (
        <div className="h-[180px]" />
      )}
      <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)_+_18px)] z-10 flex w-full justify-center px-4 sm:px-16">
        <SiteNav active="kvartovi" />
      </div>
    </header>
  )
}

// ── Naslov ──────────────────────────────────────────────────────────────────

export function Naslov({ data }: { data: KvartData }) {
  return (
    <>
      <Breadcrumb
        trail={[
          { label: "svi kvartovi", href: "/kvartovi" },
          { label: data.name },
        ]}
      />
      <Hook as="h1" className="mt-4">
        {data.name}.
      </Hook>
      <Body className="mt-1 text-ink-muted">
        {data.rank}. od {data.total} po povezanosti javnim prijevozom
        {data.population ? ` · ${data.population.toLocaleString("hr")} stanovnika` : ""}
      </Body>
    </>
  )
}

// ── Scorecard: comparison bars ──────────────────────────────────────────────

export function Scorecard({ data }: { data: KvartData }) {
  return (
    <>
      <SectionHeader
        accent
        eyebrow="povezanost · indeks dosega"
        hook={`${data.rank}. od ${data.total} kvartova.`}
      >
        Indeks mjeri koliko grada dosegneš iz prosječne točke kvarta za 30
        minuta. Najbolji kvart dosegne višestruko više od najgoreg.
      </SectionHeader>
      <div className="flex flex-col gap-[18px]">
        {data.bars.map((b) => {
          const self = b.kind === "self"
          const fill = self ? "#0e51c9" : b.kind === "city" ? "#c9cdd3" : "#a9c2ec"
          return (
            <div key={b.kind} className="flex items-center gap-3.5">
              <span
                className={`w-[150px] shrink-0 font-heros text-body ${self ? "font-bold text-ink" : "text-ink-muted"}`}
              >
                {b.name}
              </span>
              <span className="flex h-4 flex-1 bg-surface">
                <span style={{ width: `${b.score}%`, backgroundColor: fill }} />
              </span>
              <span
                className={`w-8 shrink-0 text-right font-mono text-body ${self ? "text-ink" : "text-ink-muted"}`}
              >
                {b.score}
              </span>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ── Matrica putovanja: commute to every other kvart ─────────────────────────

export function Matrica({ data }: { data: KvartData }) {
  const rows = data.commute
  const maxMin = Math.max(...rows.map((r) => r.min), 1)
  const tint = (min: number) => {
    const score = (1 - min / maxMin) * 100
    return { backgroundColor: scoreColor(score), color: scoreTextColor(score) }
  }
  return (
    <>
      <SectionHeader
        accent
        eyebrow="matrica putovanja"
        hook="Koliko grada ti je nadohvat?"
      >
        Vrijeme javnim prijevozom do svakog drugog kvarta u jutarnjoj špici.{" "}
        <strong className="font-bold text-ink">
          {data.within30} od {data.total - 1} kvartova unutar 30 min.
        </strong>
      </SectionHeader>
      <div>
        <div className="flex items-center justify-between px-3 pb-1.5">
          <MonoLabel>do kvarta</MonoLabel>
          <MonoLabel>min</MonoLabel>
        </div>
        <div className="flex items-center gap-3 bg-ink px-3 py-1.5">
          <span className="grow font-heros text-label text-ground">{data.name}</span>
          <span className="font-mono text-label text-ground/70">ovdje si</span>
        </div>
        {rows.map((r, i) => (
          <Link
            key={r.slug}
            href={`/kvartovi/${r.slug}`}
            className="flex items-center gap-3 px-3 py-1.5"
            style={tint(r.min)}
          >
            <span className="w-5 shrink-0 font-mono text-label tabular-nums opacity-60">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="grow font-heros text-label">{r.name}</span>
            {r.transfer && (
              <span className="font-mono text-label opacity-70">presj.</span>
            )}
            <span className="w-7 shrink-0 text-right font-mono text-label tabular-nums">
              {r.min}
            </span>
          </Link>
        ))}
        <MonoLabel className="mt-2.5 block">
          tamnije = bliže · iz najpovezanije točke kvarta
        </MonoLabel>
      </div>
    </>
  )
}

// ── Izvan špice: peak / evening / weekend reach + headway + night ───────────

export function IzvanSpice({ data }: { data: KvartData }) {
  const bars: [string, number][] = [
    ["špica", 100],
    ["navečer", data.eveningPctOfPeak],
  ]
  if (data.weekendRetentionPct != null) bars.push(["vikend", data.weekendRetentionPct])
  return (
    <>
      <SectionHeader eyebrow="izvan špice" hook="Vrijedi li i navečer i vikendom?">
        Ocjena gore mjeri jutarnju špicu. Ovako kvart vozi ostatak vremena.
      </SectionHeader>
      <div className="flex flex-col gap-3">
        <MonoLabel className="text-[12px]">doseg u odnosu na špicu</MonoLabel>
        {bars.map(([label, pct]) => (
          <div key={label} className="flex items-center gap-3.5">
            <span className="w-[84px] shrink-0 font-heros text-body text-ink">{label}</span>
            <span className="flex h-[18px] flex-1 bg-surface">
              <span className="bg-zg-blue" style={{ width: `${pct}%` }} />
            </span>
            <span className="w-9 shrink-0 text-right font-mono text-body text-ink">{pct}</span>
          </div>
        ))}
        <MonoLabel className="mt-1 text-[12px]">
          interval: radnim danom ~{data.weekdayHeadwayMin} min
          {data.weekendHeadwayMin != null ? `, vikendom ~${data.weekendHeadwayMin} min` : ""}
          {data.nightLines.length > 0
            ? ` · noćne linije ${data.nightLines.join(" · ")}`
            : " · nema noćnih linija"}
        </MonoLabel>
      </div>
    </>
  )
}

// ── Činjenice ────────────────────────────────────────────────────────────────

export function Cinjenice({ data }: { data: KvartData }) {
  return (
    <div className="flex flex-col">
      <FactRow divided label="tramvajske / autobusne linije" value={`${data.tramCount} / ${data.busCount}`} />
      <FactRow divided label="stanica u kvartu" value={String(data.stops)} />
      <FactRow divided label="prometna pustinja (>500 m od stanice)" value={`${data.desertPct}%`} />
      <FactRow divided label="javni bicikli (BAJS)" value={`${data.bajs.stations} ${plural(data.bajs.stations, "stanica", "stanice", "stanica")}`} />
    </div>
  )
}

// ── Linije kroz kvart ────────────────────────────────────────────────────────

export function Linije({ data }: { data: KvartData }) {
  return (
    <>
      <SectionHeader eyebrow="linije kroz kvart" hook={`${data.lines.length} ${plural(data.lines.length, "linija", "linije", "linija")}.`}>
        {data.tramCount} tramvajskih i {data.busCount} autobusnih. Svaka vodi na
        svoju stranicu s voznim redom.
      </SectionHeader>
      <div className="flex flex-wrap gap-1.5">
        {data.lines.map((l) => (
          <LineBadge
            key={`${l.mode}-${l.broj}`}
            broj={l.broj}
            mode={l.mode}
            href={`/linije/${l.broj}`}
          />
        ))}
      </div>
      <MonoLabel className="mt-2.5 block text-[12px]">
        ispunjeno plavo: tramvaj · obrub: autobus
      </MonoLabel>
    </>
  )
}

// ── Stanice u kvartu ─────────────────────────────────────────────────────────

export type KvartStop = { name: string; slug: string; lineCount: number }

export function StaniceUKvartu({ stops }: { stops: KvartStop[] }) {
  if (stops.length === 0) return null
  return (
    <>
      <SectionHeader eyebrow="stanice u kvartu" hook="Najprometnije stanice.">
        Stanice s najviše linija u kvartu. Svaka vodi na svoju stranicu s voznim
        redom i dosegom.
      </SectionHeader>
      <div className="flex flex-wrap gap-1.5">
        {stops.map((s) => (
          <PillLink key={s.slug} href={`/stanice/${s.slug}`}>
            {s.name}
          </PillLink>
        ))}
      </div>
    </>
  )
}

// ── Ovisi o adresi: reachable-cell spread ───────────────────────────────────

export function OvisiOAdresi({ data }: { data: KvartData }) {
  const { min, median, max } = data.reach
  const axis = max * 1.05
  const pct = (v: number) => `${(v / axis) * 100}%`
  return (
    <>
      <SectionHeader eyebrow="ovisi o adresi" hook="Nije svuda jednako.">
        Kvart nije ujednačen: uz prugu dosegneš puno, na rubu znatno manje.
      </SectionHeader>
      <MonoLabel className="block text-[12px]">
        dostupnih dijelova grada (mrežnih ćelija) za 30 min, ovisno o adresi
      </MonoLabel>
      <div className="relative mt-1.5 h-16 w-full">
        <div className="absolute top-[30px] left-0 h-2 w-full bg-surface" />
        <div
          className="absolute top-[30px] h-2 bg-[#8ba3da]"
          style={{ left: pct(min), width: pct(max - min) }}
        />
        <div className="absolute top-[24px] h-5 w-[5px] bg-ink" style={{ left: pct(median) }} />
        <span
          className="absolute top-0 font-mono text-label text-ink"
          style={{ left: pct(median) }}
        >
          medijan {median.toLocaleString("hr")}
        </span>
        <span className="absolute top-[44px] font-mono text-label text-ink-muted" style={{ left: pct(min) }}>
          {min.toLocaleString("hr")}
        </span>
        <span className="absolute top-[44px] right-0 font-mono text-label text-ink-muted">
          {max.toLocaleString("hr")}
        </span>
      </div>
      <MonoLabel className="block text-[12px]">
        rub kvarta → uz prugu · do najbliže stanice prosječno {data.avgNearestStopM} m · {data.desertPct}% pustinja
      </MonoLabel>
    </>
  )
}

// ── Doseg: link into the live isochrone map (the moat) ──────────────────────

export function DosegLink({ data }: { data: KvartData }) {
  const { lat, lon } = data.bestPoint
  return (
    <>
      <SectionHeader eyebrow="doseg odavde" hook="Vidi što stigneš za 30 minuta.">
        Interaktivna karta dosega iz najpovezanije točke kvarta: dokle stigneš
        tramvajem, busom i pješice u 15, 30 ili 45 minuta.
      </SectionHeader>
      <Link
        href={`/karta?lat=${lat}&lon=${lon}`}
        rel="nofollow"
        className="inline-flex items-center gap-1.5 font-mono text-label text-zg-blue transition-colors hover:text-navy"
      >
        otvori kartu dosega odavde
        <IconArrowUpRight size={14} className="shrink-0" />
      </Link>
    </>
  )
}

// ── Blizina (POI in the kvart) ──────────────────────────────────────────────

const POI_LABEL: Record<KvartData["poi"][number]["key"], string> = {
  hospital: "Bolnice",
  school: "Škole",
  park: "Parkovi",
}

// Central icons (square-outlined-radius-0-stroke-2) match the locked icon system.
const POI_ICON: Record<KvartData["poi"][number]["key"], typeof IconPark> = {
  hospital: IconMedicalCross,
  school: IconSchool,
  park: IconPark,
}

function PoiIcon({ k }: { k: KvartData["poi"][number]["key"] }) {
  const Icon = POI_ICON[k]
  return <Icon size={22} className="shrink-0 text-zg-blue" />
}

export function Blizina({ data }: { data: KvartData }) {
  return (
    <>
      <SectionHeader eyebrow="blizina" hook="Što je u kvartu?">
        Bolnice, škole i parkovi unutar granica kvarta.
      </SectionHeader>
      <div className="flex flex-col">
        {data.poi.map((c) => (
          <div
            key={c.key}
            className="flex items-center gap-3.5 border-b border-hairline py-[13px] first:border-t first:border-hairline"
          >
            <PoiIcon k={c.key} />
            <div className="flex min-w-0 grow flex-col gap-0.5">
              <span className="font-heros text-body text-ink">{POI_LABEL[c.key]}</span>
              {c.nearestName && (
                <span className="truncate font-mono text-label text-ink-muted">
                  najbliža/i {c.nearestName}
                  {c.nearestKm != null ? ` · ${c.nearestKm.toLocaleString("hr")} km` : ""}
                </span>
              )}
            </div>
            <span className="shrink-0 font-mono text-body text-ink">{c.count}</span>
          </div>
        ))}
      </div>
    </>
  )
}

// ── Promjene (conditional) ──────────────────────────────────────────────────

export function Promjene({ data }: { data: KvartData }) {
  if (data.promjene.length === 0) return null
  return (
    <>
      <SectionHeader eyebrow="promjene na linijama" hook="Nedavne izmjene mreže.">
        Trajne promjene na linijama koje voze kroz kvart.
      </SectionHeader>
      <div className="flex flex-col">
        {data.promjene.map((p) => (
          <div key={p.id} className="flex flex-col gap-1.5 border-t border-hairline py-3.5">
            <div className="flex items-center gap-3">
              <MonoLabel>{p.date}</MonoLabel>
              <span className="inline-flex items-center border border-zg-blue px-[7px] py-0.5 font-mono text-label text-zg-blue">
                {p.kind}
              </span>
            </div>
            <span className="font-heros text-head font-bold text-ink">{p.title}</span>
            <a
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-mono text-label text-zg-blue"
            >
              Službena obavijest ZET-a
              <IconArrowUpRight size={14} className="shrink-0" />
            </a>
          </div>
        ))}
      </div>
    </>
  )
}

// ── FAQ + JSON-LD ────────────────────────────────────────────────────────────

export function buildFaq(data: KvartData): FaqItem[] {
  const top = data.commute[0]
  const tram = data.lines.filter((l) => l.mode === "tram").map((l) => l.broj)
  const bus = data.lines.filter((l) => l.mode === "bus").map((l) => l.broj)
  // Only name the modes the kvart actually has — gluing an empty list left a
  // dangling "te autobusi —." (broken Croatian + a forbidden em-dash).
  const lineParts: string[] = []
  if (tram.length) lineParts.push(`${tram.length === 1 ? "tramvaj" : "tramvaji"} ${tram.join(", ")}`)
  if (bus.length) lineParts.push(`${bus.length === 1 ? "autobus" : "autobusi"} ${bus.join(", ")}`)
  const joined = lineParts.join(" te ")
  const linesAnswer = joined
    ? `${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`
    : "Kroz kvart trenutno ne vozi nijedna linija."
  const n = data.lines.length
  return [
    {
      q: `Koliko je ${data.name} dobro povezan?`,
      a: `${data.rank}. je od ${data.total} kvartova po indeksu dosega. Kroz kvart vozi ${n} ${plural(n, "linija", "linije", "linija")} (${data.tramCount} ${plural(data.tramCount, "tramvajska", "tramvajske", "tramvajskih")}, ${data.busCount} ${plural(data.busCount, "autobusna", "autobusne", "autobusnih")}).`,
    },
    {
      q: `Koje linije voze kroz kvart ${data.name}?`,
      a: linesAnswer,
    },
    ...(top
      ? [
          {
            q: `Koliko traje put do drugih kvartova?`,
            a: `Najbrže do kvarta ${top.name} (${top.min} min). Ukupno ${data.within30} od ${data.total - 1} kvartova dosegneš javnim prijevozom za 30 minuta.`,
          },
        ]
      : []),
  ]
}

export function KvartJsonLd({ data, faq }: { data: KvartData; faq: FaqItem[] }) {
  const breadcrumb = breadcrumbJsonLd([
    { name: "Kvartovi", path: "/kvartovi" },
    { name: data.name, path: `/kvartovi/${data.slug}` },
  ])
  const place = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: data.name,
    address: { "@type": "PostalAddress", addressLocality: "Zagreb", addressCountry: "HR" },
    geo: { "@type": "GeoCoordinates", latitude: data.bestPoint.lat, longitude: data.bestPoint.lon },
  }
  const faqLd = faqJsonLd(faq)
  return (
    <>
      <JsonLd data={breadcrumb} />
      <JsonLd data={place} />
      <JsonLd data={faqLd} />
    </>
  )
}
