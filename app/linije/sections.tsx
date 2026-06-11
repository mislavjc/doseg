import Link from "next/link"

import {
  Body,
  BodyMuted,
  Eyebrow,
  Hook,
  PageTitle,
} from "@/app/statistika/editorial/primitives"
import type { LinePageData } from "@/lib/generated/LinePageData"
import { cn } from "@/lib/utils"

import {
  MODE_ADJ,
  clockTime,
  introText,
  modeNoun,
  numberWord,
  peakHourly,
  peakRange,
  plural,
  serviceDays,
} from "./copy"

/**
 * Server sections of the /linije/[broj] page (Paper "Linija 109 — pSEO V1").
 * All copy is templated from line data — terminal names stay nominative.
 */

// ── Section header (eyebrow + hook + lede) ─────────────────────────────────

export function SectionHeader({
  eyebrow,
  hook,
  children,
}: {
  eyebrow: string
  hook: string
  children?: React.ReactNode
}) {
  return (
    <header className="pb-8">
      <Eyebrow>{eyebrow}</Eyebrow>
      <Hook className="mt-4">{hook}</Hook>
      {children && (
        <Body className="mt-3 max-w-[520px] text-ink-muted">{children}</Body>
      )}
    </header>
  )
}

// ── Naslov (breadcrumb + title + lede) ──────────────────────────────────────

export function Naslov({ data }: { data: LinePageData }) {
  const modeAdj = MODE_ADJ[data.mode]
  return (
    <>
      <p className="font-mono text-label text-ink-faint">
        <Link href="/linije" className="transition-colors hover:text-ink">
          sve linije
        </Link>
        {" / "}
        {modeAdj}
        {" / "}linija {data.broj} · vozni red
      </p>
      <PageTitle className="mt-4">
        Linija {data.broj}: {data.terminals[0]} - {data.terminals[1]}.
      </PageTitle>
      <Body className="mt-1 text-ink-muted">
        {modeNoun(data.mode)}
        {data.via.length > 0 && ` preko ${data.via.join(" i ")}`}
        {data.oneWay && " · kružna linija"}
      </Body>
      <Body className="mt-5 max-w-[520px]">{introText(data)}</Body>
    </>
  )
}

// ── Činjenice ───────────────────────────────────────────────────────────────

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3 py-[9px]">
      <span className="shrink-0 font-heros text-[16px] leading-[22px] text-ink-muted">
        {label}
      </span>
      <span className="h-[13px] min-w-0 flex-1 border-b border-dotted border-hairline-strong" />
      <span className="shrink-0 font-mono text-[16px] leading-[22px] text-ink">
        {value}
      </span>
    </div>
  )
}

function FactGroup({ label, first = false }: { label: string; first?: boolean }) {
  return (
    <p className={cn("pb-2 font-mono text-label text-zg-blue", !first && "pt-6")}>
      {label}
    </p>
  )
}

export function Cinjenice({ data }: { data: LinePageData }) {
  const range = peakRange(data)
  const km = data.stats.distanceKm.toLocaleString("hr-HR", {
    maximumFractionDigits: 1,
  })
  return (
    <div>
      <FactGroup label="usluga" first />
      {range && <FactRow label="razmak u špici" value={`${range[0]} min`} />}
      <FactRow
        label="polazaka radnim danom"
        value={String(data.stats.dailyDepartures)}
      />
      <FactRow
        label="prvi i zadnji polazak"
        value={`${clockTime(data.stats.firstDeparture)} · ${clockTime(data.stats.lastDeparture)}`}
      />
      <FactGroup label="trasa" />
      <FactRow
        label="broj stanica"
        value={String(data.directions[0].stops.length)}
      />
      <FactRow label="duljina trase" value={`${km} km`} />
      <FactRow
        label="vožnja od kraja do kraja"
        value={`${Math.round(data.stats.travelTimeMin)} min`}
      />
    </div>
  )
}

// ── Koliko često vozi (histogram) ───────────────────────────────────────────

export function Frekvencija({ data }: { data: LinePageData }) {
  const hasNight = data.histogram.slice(0, 4).some((c) => c > 0)
  const hours = hasNight
    ? Array.from({ length: 24 }, (_, h) => h)
    : Array.from({ length: 20 }, (_, i) => i + 4)
  const max = Math.max(...data.histogram, 1)
  return (
    <div className="flex items-end justify-between gap-px">
      {hours.map((h) => {
        const count = data.histogram[h]
        const height = count > 0 ? Math.max((count / max) * 84, 6) : 2
        return (
          <div key={h} className="flex w-full max-w-5 flex-col items-center gap-1">
            <div
              className={cn(
                "w-full",
                count === max ? "bg-zg-blue" : "bg-blue-pale"
              )}
              style={{ height }}
            />
            <span className="font-mono text-label text-ink-faint">{h}</span>
          </div>
        )
      })}
    </div>
  )
}

export function frekvencijaCopy(data: LinePageData): {
  hook: string
  body: string
} {
  const peak = peakHourly(data)
  const word = numberWord(peak)
  const hook = `${word.charAt(0).toUpperCase()}${word.slice(1)} ${plural(peak, "polazak", "polaska", "polazaka")} na sat u špici.`
  const maxHours = data.histogram
    .map((c, h) => ({ c, h }))
    .filter(({ c }) => c === peak)
    .map(({ h }) => h)
  const body = `Polasci radnim danom po satu, oba smjera. Najgušće vozi oko ${maxHours[0]} h.`
  return { hook, body }
}

// ── Doseg linije ────────────────────────────────────────────────────────────

export function DosegLinije({ data }: { data: LinePageData }) {
  const reach = data.reach
  const stops = data.directions[0].stops.length
  const mapHref = reach
    ? `/?lat=${reach.lat}&lon=${reach.lon}`
    : "/"
  return (
    <div>
      <Eyebrow>doseg linije</Eyebrow>
      <Hook className="mt-4">
        {reach
          ? `${Math.round(reach.areaKm2)} km² grada u pola sata.`
          : "Dokle stigneš u pola sata?"}
      </Hook>
      <Body className="mt-3 max-w-[520px] text-ink-muted">
        {reach
          ? `Sa stanice ${reach.stopName}, na sredini trase, 30 minuta javnim prijevozom pokriva ${Math.round(reach.areaKm2)} km² grada. Provjeri dokle stigneš sa svake od ${stops} ${plural(stops, "stanice", "stanice", "stanica")} linije ${data.broj}.`
          : `Provjeri dokle stigneš za 30 minuta javnim prijevozom sa svake od ${stops} ${plural(stops, "stanice", "stanice", "stanica")} linije ${data.broj}.`}
      </Body>
      <Link
        href={mapHref}
        className="mt-4 inline-block font-mono text-[16px] leading-6 text-zg-blue transition-colors hover:text-navy"
      >
        otvori liniju {data.broj} na karti →
      </Link>
    </div>
  )
}

// ── Česta pitanja ───────────────────────────────────────────────────────────

export interface FaqItem {
  q: string
  a: string
}

export function buildFaq(data: LinePageData): FaqItem[] {
  const items: FaqItem[] = []
  const noun = modeNoun(data.mode)
  const range = peakRange(data)
  const days = serviceDays(data)

  const freqParts: string[] = []
  if (range) {
    freqParts.push(
      range[0] === range[1]
        ? `Radnim danom svakih ${range[0]} minuta u špici`
        : `Radnim danom svakih ${range[0]} do ${range[1]} minuta u špici`
    )
    if (data.stats.avgHeadwayMin) {
      freqParts.push(
        `a u prosjeku svakih ${Math.round(data.stats.avgHeadwayMin)} minuta tijekom dana`
      )
    }
  } else {
    freqParts.push(
      `${data.stats.dailyDepartures} ${plural(data.stats.dailyDepartures, "polazak", "polaska", "polazaka")} radnim danom`
    )
  }
  const weekend =
    days.subota && days.nedjelja
      ? "Vozi i subotom i nedjeljom."
      : days.subota
        ? "Subotom vozi, nedjeljom ne."
        : days.nedjelja
          ? "Nedjeljom vozi, subotom ne."
          : "Vikendom ne vozi."
  items.push({
    q: `Koliko često vozi linija ${data.broj}?`,
    a: `${freqParts.join(", ")}. ${weekend}`,
  })

  const [lastH] = data.stats.lastDeparture.split(":").map(Number)
  const night = lastH >= 24 || lastH < 4
  items.push({
    q: `Vozi li ${data.broj} noću?`,
    a: night
      ? `Da, zadnji polazak s terminala ${data.terminals[0]} je u ${clockTime(data.stats.lastDeparture)}.`
      : `Ne. Zadnji polazak s terminala ${data.terminals[0]} je u ${clockTime(data.stats.lastDeparture)}, prvi sljedeći u ${clockTime(data.stats.firstDeparture)}.`,
  })

  // Tram transfer — only when the line actually meets daytime trams (the
  // generator already excludes night trams from interchange data).
  const terminalTrams = data.directions[0].stops[0].tramInterchange
  const crossings = data.related.tramCrossings
  if (data.mode === "bus" && (crossings.length > 0 || terminalTrams.length > 0)) {
    const parts: string[] = []
    if (crossings.length > 0) {
      // Stop with the most tram lines wins.
      const byStop = new Map<string, string[]>()
      for (const c of crossings) {
        byStop.set(c.stopName, [...(byStop.get(c.stopName) ?? []), c.broj])
      }
      const [stopName, trams] = [...byStop.entries()].sort(
        (a, b) => b[1].length - a[1].length
      )[0]
      parts.push(
        `Na stanici ${stopName} na ${plural(trams.length, "tramvaj", "tramvaje", "tramvaje")} ${trams.join(" i ")}`
      )
    }
    if (terminalTrams.length > 0) {
      parts.push(
        `na polazištu ${data.terminals[0]} na ${plural(terminalTrams.length, "tramvaj", "tramvaje", "tramvaje")} ${terminalTrams.join(", ")}`
      )
    }
    items.push({
      q: "Gdje presjedam na tramvaj?",
      a: `${parts.join(", ili ")}.`,
    })
  }

  // One-way loops get an explainer instead.
  if (data.oneWay) {
    items.push({
      q: `Zašto linija ${data.broj} ima samo jedan smjer?`,
      a: `Linija ${data.broj} vozi kružno: ${noun} kreće s terminala ${data.terminals[0]} i istom se trasom vraća bez zasebnog povratnog smjera.`,
    })
  }

  return items
}

export function faqJsonLd(items: FaqItem[]): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  })
}

export function CestaPitanja({ items }: { items: FaqItem[] }) {
  return (
    <div>
      <Eyebrow className="pb-2">česta pitanja</Eyebrow>
      <dl className="flex flex-col gap-7 pt-4">
        {items.map((item) => (
          <div key={item.q}>
            <dt>
              <Hook as="h3">{item.q}</Hook>
            </dt>
            <dd className="mt-2 max-w-[520px]">
              <BodyMuted>{item.a}</BodyMuted>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

// ── Povezane linije ─────────────────────────────────────────────────────────

export function PovezaneLinije({ data }: { data: LinePageData }) {
  // Night lines connect with each other; day lines list day connections.
  const related = data.related.sharedTerminal.filter(
    (r) => r.isNight === data.isNight
  )
  const byTerminal = (t: string) =>
    related.filter((r) => r.terminal === t)
  const describe = (t: string) => {
    const lines = byTerminal(t)
    if (lines.length === 0) return null
    const trams = lines.filter((l) => l.mode === "tram").map((l) => l.broj)
    const buses = lines.filter((l) => l.mode === "bus").map((l) => l.broj)
    const parts: string[] = []
    if (trams.length > 0)
      parts.push(
        `${plural(trams.length, "tramvaj", "tramvaji", "tramvaji")} ${trams.join(", ")}`
      )
    if (buses.length > 0)
      parts.push(
        `${plural(buses.length, "autobus", "autobusi", "autobusi")} ${buses.slice(0, 6).join(", ")}`
      )
    return parts.join(" i ")
  }

  const fromA = describe(data.terminals[0])
  const fromB = describe(data.terminals[1])
  const sentence = [
    fromA && `S terminala ${data.terminals[0]} kreću i ${fromA}`,
    fromB && `s terminala ${data.terminals[1]} ${fromB}`,
  ]
    .filter(Boolean)
    .join(", a ")

  const chips = [
    ...related.filter((r) => r.mode === "tram").slice(0, 3),
    ...related.filter((r) => r.mode === "bus").slice(0, 3),
  ]

  return (
    <div>
      <Eyebrow>povezane linije</Eyebrow>
      {sentence && (
        <Body className="mt-4 max-w-[520px] text-ink-muted">{sentence}.</Body>
      )}
      <div className="mt-5 flex flex-wrap gap-2.5">
        {chips.map((r) => (
          <Link
            key={r.broj}
            href={`/linije/${r.broj}`}
            className="border border-zg-blue px-3.5 py-1.5 font-mono text-[16px] leading-5 text-zg-blue transition-colors hover:bg-zg-blue hover:text-white"
          >
            {r.mode === "tram" ? "tram" : "bus"} {r.broj}
          </Link>
        ))}
        <Link
          href="/linije"
          className="border border-zg-blue px-3.5 py-1.5 font-mono text-[16px] leading-5 text-zg-blue transition-colors hover:bg-zg-blue hover:text-white"
        >
          sve linije
        </Link>
      </div>
    </div>
  )
}

// ── Prev / next ─────────────────────────────────────────────────────────────

export function PrevNext({ data }: { data: LinePageData }) {
  return (
    <nav className="flex items-start justify-between">
      {data.prevBroj ? (
        <Link href={`/linije/${data.prevBroj}`} className="group flex flex-col gap-0.5">
          <span className="font-mono text-label text-ink-faint">
            prethodna linija
          </span>
          <span className="font-mono text-[16px] leading-6 text-zg-blue transition-colors group-hover:text-navy">
            ← {data.prevBroj}
          </span>
        </Link>
      ) : (
        <span />
      )}
      {data.nextBroj && (
        <Link
          href={`/linije/${data.nextBroj}`}
          className="group flex flex-col items-end gap-0.5"
        >
          <span className="font-mono text-label text-ink-faint">
            sljedeća linija
          </span>
          <span className="font-mono text-[16px] leading-6 text-zg-blue transition-colors group-hover:text-navy">
            {data.nextBroj} →
          </span>
        </Link>
      )}
    </nav>
  )
}

// ── Provenijencija ──────────────────────────────────────────────────────────

export function Provenijencija({ date }: { date: string }) {
  return (
    <p className="font-mono text-label text-ink-faint">
      vozni red iz službenog zet gtfs feeda · osvježava se automatski ·
      vrijedi za {date}
    </p>
  )
}

