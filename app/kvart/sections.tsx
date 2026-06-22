import Link from "next/link"

import { JsonLd } from "@/app/linije/sections"
import { SiteNav } from "@/app/statistika/editorial/site-nav"
import {
  Body,
  Eyebrow,
  Hook,
  MonoLabel,
} from "@/app/statistika/editorial/primitives"
import { scoreColor, scoreTextColor } from "@/lib/score-color"
import type { KvartData } from "@/lib/kvart-data"

/**
 * Kvart scorecard sections. Visual language is the statistika editorial kit
 * (16/12 type, Zagreb blue, sharp corners). Reachability tints reuse the shared
 * score ramp so the colour meaning stays identical across the site.
 */

const FILL_OTHER = "#e8edf2"

// ── Hero: Zagreb silhouette, this kvart highlighted ─────────────────────────

export function KvartHero({ data }: { data: KvartData }) {
  return (
    <div className="relative bg-surface">
      <div className="absolute inset-x-0 top-0 z-10 flex justify-center px-8 pt-5">
        <SiteNav active="statistika" className="w-[640px] max-w-full" />
      </div>
      <div className="mx-auto max-w-[940px] px-6 pt-24 pb-10">
        <svg
          viewBox="0 0 960 620"
          className="block h-auto w-full"
          role="img"
          aria-label={`Položaj kvarta ${data.name} u Zagrebu`}
        >
          {data.shapes.map((s) => (
            <path
              key={s.name}
              d={s.d}
              fill={s.isSelf ? scoreColor(data.score) : FILL_OTHER}
              stroke="#ffffff"
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          ))}
        </svg>
      </div>
    </div>
  )
}

// ── Naslov ──────────────────────────────────────────────────────────────────

export function Naslov({ data }: { data: KvartData }) {
  return (
    <>
      <p className="font-mono text-label text-ink-faint">
        <Link href="/statistika" className="text-zg-blue transition-colors hover:text-navy">
          statistika
        </Link>
        {" / kvartovi / "}
        {data.name}
      </p>
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
      <Eyebrow className="text-zg-blue">povezanost · indeks dosega</Eyebrow>
      <Hook className="mt-2">
        {data.rank}. od {data.total} kvartova.
      </Hook>
      <Body className="mt-2 max-w-[520px]">
        Indeks mjeri koliko grada dosegneš iz prosječne točke kvarta za 30
        minuta. Najbolji kvart dosegne višestruko više od najgoreg.
      </Body>
      <div className="mt-6 flex flex-col gap-[18px]">
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
      <Eyebrow className="text-zg-blue">matrica putovanja</Eyebrow>
      <Hook className="mt-2">Koliko grada ti je nadohvat?</Hook>
      <Body className="mt-2 max-w-[520px]">
        Vrijeme javnim prijevozom do svakog drugog kvarta u jutarnjoj špici.{" "}
        <strong className="font-bold text-ink">
          {data.within30} od {data.total - 1} kvartova unutar 30 min.
        </strong>
      </Body>
      <div className="mt-5">
        <div className="flex items-center justify-between px-3 pb-1.5">
          <MonoLabel className="text-[11px]">do kvarta</MonoLabel>
          <MonoLabel className="text-[11px]">min</MonoLabel>
        </div>
        <div className="flex items-center gap-3 bg-ink px-3 py-1.5">
          <span className="grow font-heros text-label text-ground">{data.name}</span>
          <span className="font-mono text-label text-ground/70">ovdje si</span>
        </div>
        {rows.map((r, i) => (
          <Link
            key={r.slug}
            href={`/kvart/${r.slug}`}
            className="flex items-center gap-3 px-3 py-1.5"
            style={tint(r.min)}
          >
            <span className="w-5 shrink-0 font-mono text-[11px] tabular-nums opacity-60">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="grow font-heros text-label">{r.name}</span>
            {r.transfer && (
              <span className="font-mono text-[11px] opacity-70">presj.</span>
            )}
            <span className="w-7 shrink-0 text-right font-mono text-label tabular-nums">
              {r.min}
            </span>
          </Link>
        ))}
        <MonoLabel className="mt-2.5 block text-[11px]">
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
      <Eyebrow>izvan špice</Eyebrow>
      <Hook className="mt-2">Vrijedi li i navečer i vikendom?</Hook>
      <Body className="mt-2 max-w-[520px]">
        Ocjena gore mjeri jutarnju špicu. Ovako kvart vozi ostatak vremena.
      </Body>
      <div className="mt-5 flex flex-col gap-3">
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

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-hairline py-[9px] last:border-b-0">
      <span className="shrink-0 font-heros text-body text-ink-muted">{label}</span>
      <span className="h-[13px] min-w-0 flex-1 border-b border-dotted border-hairline-strong" />
      <span className="shrink-0 font-mono text-body text-ink">{value}</span>
    </div>
  )
}

export function Cinjenice({ data }: { data: KvartData }) {
  return (
    <div className="flex flex-col">
      <FactRow label="tramvajske / autobusne linije" value={`${data.tramCount} / ${data.busCount}`} />
      <FactRow label="stanica u kvartu" value={String(data.stops)} />
      <FactRow label="prometna pustinja (>500 m od stanice)" value={`${data.desertPct}%`} />
      <FactRow label="javni bicikli (BAJS)" value={`${data.bajs.stations} stanica`} />
    </div>
  )
}

// ── Linije kroz kvart ────────────────────────────────────────────────────────

function LineChip({ line }: { line: KvartData["lines"][number] }) {
  const tram = line.mode === "tram"
  return (
    <Link
      href={`/linije/${line.broj}`}
      className={`flex h-6 w-[34px] shrink-0 items-center justify-center font-mono text-label ${
        tram
          ? "bg-zg-blue text-white"
          : "border border-zg-blue bg-white text-zg-blue"
      }`}
      title={`${tram ? "tramvaj" : "autobus"} ${line.broj}`}
    >
      {line.broj}
    </Link>
  )
}

export function Linije({ data }: { data: KvartData }) {
  return (
    <>
      <Eyebrow>linije kroz kvart</Eyebrow>
      <Hook className="mt-2">
        {data.lines.length} {data.lines.length === 1 ? "linija" : "linija"}.
      </Hook>
      <Body className="mt-2 max-w-[520px]">
        {data.tramCount} tramvajskih i {data.busCount} autobusnih. Svaka vodi na
        svoju stranicu s voznim redom.
      </Body>
      <div className="mt-[18px] flex flex-wrap gap-1.5">
        {data.lines.map((l) => (
          <LineChip key={`${l.mode}-${l.broj}`} line={l} />
        ))}
      </div>
      <MonoLabel className="mt-2.5 block text-[12px]">
        ispunjeno plavo: tramvaj · obrub: autobus
      </MonoLabel>
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
      <Eyebrow>ovisi o adresi</Eyebrow>
      <Hook className="mt-2">Nije svuda jednako.</Hook>
      <Body className="mt-2 max-w-[520px]">
        Kvart nije ujednačen: uz prugu dosegneš puno, na rubu znatno manje.
      </Body>
      <MonoLabel className="mt-[18px] block text-[12px]">
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
      <Eyebrow>doseg odavde</Eyebrow>
      <Hook className="mt-2">Vidi što stigneš za 30 minuta.</Hook>
      <Body className="mt-2 max-w-[520px]">
        Interaktivna karta dosega iz najpovezanije točke kvarta: dokle stigneš
        tramvajem, busom i pješice u 15, 30 ili 45 minuta.
      </Body>
      <Link
        href={`/?lat=${lat}&lon=${lon}`}
        className="mt-4 inline-flex items-center gap-1.5 font-mono text-label text-zg-blue transition-colors hover:text-navy"
      >
        otvori kartu dosega odavde
        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M7 17L17 7M17 7H9M17 7V15" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
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

function PoiIcon({ k }: { k: KvartData["poi"][number]["key"] }) {
  const c = "#0e51c9"
  if (k === "hospital")
    return (
      <svg width={22} height={22} viewBox="0 0 22 22" fill="none" aria-hidden className="shrink-0">
        <rect x="2" y="2" width="18" height="18" stroke={c} strokeWidth={2} />
        <path d="M11 6v10M6 11h10" stroke={c} strokeWidth={2} />
      </svg>
    )
  if (k === "school")
    return (
      <svg width={22} height={22} viewBox="0 0 22 22" fill="none" aria-hidden className="shrink-0">
        <path d="M2 8l9-4 9 4-9 4z" stroke={c} strokeWidth={2} strokeLinejoin="round" />
        <path d="M17 10v5" stroke={c} strokeWidth={2} />
      </svg>
    )
  return (
    <svg width={22} height={22} viewBox="0 0 22 22" fill="none" aria-hidden className="shrink-0">
      <path d="M11 20v-7" stroke={c} strokeWidth={2} />
      <path d="M11 3l6 11H5z" stroke={c} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  )
}

export function Blizina({ data }: { data: KvartData }) {
  return (
    <>
      <Eyebrow>blizina</Eyebrow>
      <Hook className="mt-2">Što je u kvartu?</Hook>
      <Body className="mt-2 max-w-[520px]">
        Bolnice, škole i parkovi unutar granica kvarta.
      </Body>
      <div className="mt-2 flex flex-col">
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
      <Eyebrow>promjene na linijama</Eyebrow>
      <Hook className="mt-2">Nedavne izmjene mreže.</Hook>
      <Body className="mt-2 max-w-[520px]">
        Trajne promjene na linijama koje voze kroz kvart.
      </Body>
      <div className="mt-4 flex flex-col">
        {data.promjene.map((p) => (
          <div key={p.id} className="flex flex-col gap-1.5 border-t border-hairline py-3.5">
            <div className="flex items-center gap-3">
              <MonoLabel className="text-[12px]">{p.date}</MonoLabel>
              <span className="inline-flex items-center border border-zg-blue px-[7px] py-0.5 font-mono text-[11px] text-zg-blue">
                {p.kind}
              </span>
            </div>
            <span className="font-heros text-head font-bold text-ink">{p.title}</span>
            <a
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-label text-zg-blue"
            >
              Službena obavijest ZET-a →
            </a>
          </div>
        ))}
      </div>
    </>
  )
}

// ── FAQ + JSON-LD ────────────────────────────────────────────────────────────

export function buildFaq(data: KvartData): { q: string; a: string }[] {
  const top = data.commute[0]
  return [
    {
      q: `Koliko je ${data.name} dobro povezan?`,
      a: `${data.rank}. je od ${data.total} kvartova po indeksu dosega. Kroz kvart vozi ${data.lines.length} linija (${data.tramCount} tramvajskih, ${data.busCount} autobusnih).`,
    },
    {
      q: `Koje linije voze kroz kvart ${data.name}?`,
      a: `Tramvaji ${data.lines.filter((l) => l.mode === "tram").map((l) => l.broj).join(", ") || "—"} te autobusi ${data.lines.filter((l) => l.mode === "bus").map((l) => l.broj).join(", ") || "—"}.`,
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

export function CestaPitanja({ items }: { items: { q: string; a: string }[] }) {
  return (
    <>
      <Eyebrow>česta pitanja</Eyebrow>
      <Hook className="mt-2 pb-2">Što ljudi pitaju.</Hook>
      <dl>
        {items.map((it) => (
          <div key={it.q} className="border-t border-hairline py-4">
            <dt className="font-heros text-head font-bold text-ink">{it.q}</dt>
            <dd className="mt-1.5 font-heros text-body text-ink-2">{it.a}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}

export function KvartJsonLd({ data, faq }: { data: KvartData; faq: { q: string; a: string }[] }) {
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Doseg", item: "https://doseg.hr" },
      { "@type": "ListItem", position: 2, name: "Statistika", item: "https://doseg.hr/statistika" },
      {
        "@type": "ListItem",
        position: 3,
        name: data.name,
        item: `https://doseg.hr/kvart/${data.slug}`,
      },
    ],
  }
  const place = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: data.name,
    address: { "@type": "PostalAddress", addressLocality: "Zagreb", addressCountry: "HR" },
    geo: { "@type": "GeoCoordinates", latitude: data.bestPoint.lat, longitude: data.bestPoint.lon },
  }
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    })),
  }
  return (
    <>
      <JsonLd data={breadcrumb} />
      <JsonLd data={place} />
      <JsonLd data={faqLd} />
    </>
  )
}
