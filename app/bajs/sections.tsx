import {
  IconArrowDown,
  IconArrowLeftRight,
  IconArrowRight,
} from "@central-icons-react/square-outlined-radius-0-stroke-2"

import { plural } from "@/app/linije/copy"
import { SectionHeader } from "@/app/statistika/editorial/blocks"
import {
  Body,
  BodyMuted,
  Chip,
  Eyebrow,
  Hairline,
  Hook,
  MonoLabel,
  Section,
  Strong,
} from "@/app/statistika/editorial/primitives"
import type { BajsBalance, BalanceRow } from "@/lib/bajs-balance"
import type { BajsFlow, BajsRelocations, KvartFlow } from "@/lib/bajs-flow"
import type { BajsRanking, BajsRides } from "@/lib/bajs-rides"
import { RANKING_MIN_DAYS } from "@/lib/bajs-rides"
import { buildBajsTerrain } from "@/lib/bajs-terrain"
import type { BajsRankedStation } from "@/lib/generated"
import { cn } from "@/lib/utils"

import { KvartTerrain } from "./kvart-terrain"

/**
 * /bajs sections. Everything here reads measured ride events (a bike leaving a
 * dock and a bike arriving at one), never the inferred `bikes_in_use` series.
 *
 * Narration is derived from the numbers rather than written next to them: the
 * peak hour, the busiest day and the ranking all move as data accumulates, and
 * prose that restates them by hand goes stale silently.
 */

const HR_NUM = new Intl.NumberFormat("hr-HR", { maximumFractionDigits: 0 })
const HR_DAY = new Intl.DateTimeFormat("hr-HR", {
  day: "numeric",
  month: "long",
  timeZone: "Europe/Zagreb",
})

function num(value: number) {
  return HR_NUM.format(Math.round(value))
}

/**
 * Headline figures are rounded to the nearest hundred. A mean over a handful of
 * days is not precise to the single ride, and "9.919" claims that it is.
 */
function approx(value: number) {
  return HR_NUM.format(Math.round(value / 100) * 100)
}

/**
 * "6 dana". Takes the raw observed span because every caller has a fractional
 * one and every caller wants it floored: a window is only worth claiming for
 * the days it covered end to end.
 */
function dayCount(n: number) {
  const whole = Math.floor(n)
  return `${whole} ${plural(whole, "dan", "dana", "dana")}`
}

/**
 * "323 bicikla", "340 bicikala". Croatian agreement follows the last digits,
 * so the noun cannot be written next to a figure that moves with the data.
 */
function bikes(n: number) {
  const whole = Math.round(n)
  return `${num(whole)} ${plural(whole, "bicikl", "bicikla", "bicikala")}`
}

/** The same for the colloquial name the page uses for the bikes themselves. */
function bajsevi(n: number) {
  const whole = Math.round(n)
  return `${num(whole)} ${plural(whole, "bajs", "bajsa", "bajseva")}`
}

/** "2026-08-19" (a Zagreb local date) → "19. kolovoza". */
function dayLabel(date: string) {
  return HR_DAY.format(new Date(`${date}T12:00:00Z`))
}

function hourLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}h`
}

// ── Ravnoteža: where the fleet is right now ─────────────────────────────────

/**
 * One bar for the whole fleet. Only the docked count is measured; the rest is
 * the gap to the largest number of bikes seen docked in the last 24 h, which
 * lumps together bikes being ridden and bikes withdrawn for service. The bar
 * keeps that as a single honest "not at a station" block rather than splitting
 * it into a rider count nobody measured.
 */
export function Ravnoteza({
  docked,
  knownFleet,
  stations,
  empty,
}: {
  docked: number
  knownFleet: number
  stations: number
  empty: number
}) {
  const away = Math.max(0, knownFleet - docked)
  const total = docked + away || 1
  const dockedPct = (docked / total) * 100

  return (
    <Section id="ravnoteza" width="wide" className="pb-0 pt-12 sm:pb-0 sm:pt-14">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 pb-8">
        <MonoLabel className="text-ink">{stations} stanica</MonoLabel>
        <MonoLabel className="text-ink">{bajsevi(docked)}</MonoLabel>
        <MonoLabel className="text-ink">{empty} praznih</MonoLabel>
      </div>

      <div className="relative">
        <div className="flex h-11 w-full">
          <div
            className="flex shrink-0 items-center bg-zg-blue pl-3"
            style={{ width: `${dockedPct}%` }}
          >
            <span className="truncate font-mono text-label text-white">
              na stanicama {num(docked)}
            </span>
          </div>
          <div className="min-w-0 flex-1 bg-ink-ghost" />
        </div>
        <MonoLabel className="mt-2 block text-right">
          nije na stanici {num(away)}
        </MonoLabel>
      </div>

      <BodyMuted className="mt-4 max-w-[560px]">
        Broj na stanicama je izbrojan. Ostatak je razlika do najvišeg broja
        bajsa viđenog na stanicama u zadnja 24 sata, pa u njemu su i vožnje u
        tijeku i bicikli povučeni na servis. Koliko je čega, feed ne kaže.
      </BodyMuted>
    </Section>
  )
}

// ── Ritam: rides by hour of day ─────────────────────────────────────────────

const RITAM_HEIGHT = 170

export function Ritam({ rides }: { rides: BajsRides }) {
  const { hourly, peakHour, morningPeak } = rides
  if (!peakHour) return null

  const max = Math.max(...hourly.map((h) => h.avgStarts))
  // The morning commute only reads as its own event when it is not the peak.
  const separateMorning =
    morningPeak && morningPeak.hour !== peakHour.hour ? morningPeak : null

  // Hours with no observation at all are skipped rather than drawn as zero,
  // so a gap in coverage never reads as a gap in riding.
  const byHour = new Map(hourly.map((h) => [h.hour, h]))
  const columns = Array.from({ length: 24 }, (_, hour) => byHour.get(hour) ?? null)

  return (
    <Section id="ritam">
      <SectionHeader
        eyebrow={`ritam · ${dayCount(peakHour.days)} mjerenja`}
        hook={
          separateMorning
            ? "Dva vala: na posao i s posla."
            : `Najviše se vozi u ${hourLabel(peakHour.hour)}.`
        }
      >
        {separateMorning
          ? `Jutarnji val stane oko ${num(separateMorning.avgStarts)} vožnji u ${hourLabel(separateMorning.hour)}; popodnevni ga prerasta i u ${hourLabel(peakHour.hour)} dira ${num(peakHour.avgStarts)}.`
          : "Prosječan broj vožnji započetih u svakom satu dana."}
      </SectionHeader>

      <div className="relative pt-6">
        <div
          className="flex items-end gap-1"
          style={{ height: `${RITAM_HEIGHT}px` }}
        >
          {columns.map((h, hour) => (
            <div
              key={hour}
              title={h ? `${hourLabel(hour)} · ${num(h.avgStarts)}` : undefined}
              className={cn(
                "min-w-0 flex-1",
                hour === peakHour.hour || hour === separateMorning?.hour
                  ? "bg-zg-blue"
                  : "bg-ink-ghost"
              )}
              style={{
                height: h ? `${Math.max(2, (h.avgStarts / max) * RITAM_HEIGHT)}px` : 0,
              }}
            />
          ))}
        </div>
        <span
          className="absolute top-0 -translate-x-1/2 whitespace-nowrap font-mono text-label text-zg-blue"
          style={{ left: `${((peakHour.hour + 0.5) / 24) * 100}%` }}
        >
          {hourLabel(peakHour.hour)} · {num(peakHour.avgStarts)}
        </span>
      </div>

      <Hairline className="mt-0" />
      <div className="flex justify-between pt-1.5">
        {["00", "06", "12", "18", "23"].map((t) => (
          <MonoLabel key={t}>{t}</MonoLabel>
        ))}
      </div>

      <BodyMuted className="mt-6 font-mono text-label">
        prosjek po satu · {dayCount(peakHour.days)} mjerenja · noću
        se vozi i dalje
      </BodyMuted>
    </Section>
  )
}

// ── Dani: measured totals per day ───────────────────────────────────────────

export function Dani({ rides }: { rides: BajsRides }) {
  const { fullDays, avgPerDay, busiestDay, partialDay } = rides
  if (!fullDays.length || !avgPerDay || !busiestDay) return null

  const max = Math.max(...fullDays.map((d) => d.starts))
  const totalBulk = fullDays.reduce(
    (sum, d) => sum + d.bulkOut + d.relocations,
    0
  )

  return (
    <Section id="dani">
      <SectionHeader
        eyebrow={`dani · ${fullDays.length} ${plural(fullDays.length, "cijeli dan", "cijela dana", "cijelih dana")}`}
        hook={`Oko ${approx(avgPerDay)} vožnji dnevno`}
      >
        Svaka vožnja je izbrojana, ne procijenjena: bicikl koji je nestao sa
        stanice i bicikl koji je stigao na neku drugu.
      </SectionHeader>

      <div className="flex flex-col gap-[5px]">
        {fullDays.map((d) => (
          <div key={d.date} className="flex h-[19px] items-center gap-3">
            <span className="w-[92px] shrink-0 text-right font-mono text-label text-ink-muted">
              {dayLabel(d.date)}
            </span>
            <span className="flex h-3 min-w-0 flex-1 bg-surface">
              <span
                className={cn(
                  d.date === busiestDay.date ? "bg-zg-blue" : "bg-ink-faint"
                )}
                style={{ width: `${(d.starts / max) * 100}%` }}
              />
            </span>
            <span className="w-12 shrink-0 text-right font-mono text-label tabular-nums text-ink">
              {num(d.starts)}
            </span>
          </div>
        ))}
      </div>

      <BodyMuted className="mt-6">
        Najprometniji izmjereni dan je {dayLabel(busiestDay.date)} s{" "}
        {num(busiestDay.starts)} vožnji.
        {partialDay
          ? ` Danas je do sada ${num(partialDay.starts)}, ali dan još traje.`
          : ""}{" "}
        Uz to je {bikes(totalBulk)} premješteno kombijem; ti pomaci nisu
        vožnje, ne ulaze u brojke gore i brojimo ih{" "}
        <a
          href="#kombi"
          className="inline-flex items-center gap-1 text-zg-blue transition-colors hover:text-navy"
        >
          zasebno
          <IconArrowDown size={14} className="shrink-0" />
        </a>
        .
      </BodyMuted>
    </Section>
  )
}

// ── Odstupanje: surplus and emptiness on one axis ───────────────────────────

function BalanceRowView({
  row,
  maxSurplus,
  maxEmpty,
}: {
  row: BalanceRow
  maxSurplus: number
  maxEmpty: number
}) {
  const surplus = row.surplus ?? 0
  const share = row.emptyShare ?? 0
  const rightPct = surplus > 0 ? (surplus / maxSurplus) * 100 : 0
  const leftPct = share > 0 ? (share / maxEmpty) * 100 : 0

  return (
    <div className="flex items-center gap-3 border-b border-hairline py-2 last:border-b-0">
      <span className="w-[150px] shrink-0 truncate font-mono text-label text-ink sm:w-[190px]">
        {row.name}
      </span>
      <span className="hidden w-[150px] shrink-0 truncate font-mono text-label text-ink-faint sm:block">
        {row.kvart ?? "-"}
      </span>
      {/* One shared axis: emptiness grows left of the tick, surplus right. */}
      <span className="hidden h-3 w-[260px] shrink-0 items-center sm:flex">
        <span className="flex flex-1 justify-end">
          <span className="h-2 bg-ink-ghost" style={{ width: `${leftPct}%` }} />
        </span>
        <span className="h-3 w-px shrink-0 bg-hairline" />
        <span className="flex flex-1">
          <span className="h-2 bg-zg-blue" style={{ width: `${rightPct}%` }} />
        </span>
      </span>
      <span
        className={cn(
          "ml-auto shrink-0 text-right font-mono text-label tabular-nums",
          surplus > 0 ? "font-bold text-zg-blue" : "text-ink-muted"
        )}
      >
        {surplus > 0
          ? `+${surplus}`
          : `${Math.round(share * 100)} % prazno`}
      </span>
    </div>
  )
}

export function Odstupanje({ balance }: { balance: BajsBalance | null }) {
  if (!balance) return null
  const { surplus, empty, overCapacity, totalStations } = balance
  const maxSurplus = Math.max(1, ...surplus.map((r) => r.surplus ?? 0))
  const maxEmpty = Math.max(0.01, ...empty.map((r) => r.emptyShare ?? 0))

  return (
    <Section id="odstupanje" width="wide">
      <SectionHeader
        eyebrow="odstupanje od ravnoteže"
        hook="Višak raste desno od osi, praznina lijevo."
      >
        Bajs se zaključava na stalak ili na drugi bajs, pa kapacitet nije
        granica. Trenutno {overCapacity} od {totalStations} stanica drži više
        bicikala nego što ima mjesta, dok druge stoje prazne.
      </SectionHeader>

      <div>
        {/* Two lists, one axis: the surplus end then the empty end. */}
        {[...surplus, ...empty].map((r) => (
          <BalanceRowView
            key={r.stationId}
            row={r}
            maxSurplus={maxSurplus}
            maxEmpty={maxEmpty}
          />
        ))}
      </div>

      <BodyMuted className="mt-4 font-mono text-label">
        stanje sada · udio praznog vremena zadnjih{" "}
        {dayCount(balance.observedDays)} ·
        mjereno svake minute
      </BodyMuted>
    </Section>
  )
}

// ── Reljef: rides as the city standing up ───────────────────────────────────

export function Reljef({ ranking }: { ranking: BajsRanking | null }) {
  const terrain = buildBajsTerrain(ranking)
  if (!ranking || !terrain) return null

  const top = terrain.kvartovi[0]
  const covered = terrain.kvartovi.length
  // The share the busiest three carry says more than any single number: it is
  // the whole point of the shape below. Names stay in the nominative: Croatian
  // kvart names do not decline from a suffix rule.
  const topThree = terrain.kvartovi
    .slice(0, 3)
    .reduce((sum, k) => sum + k.share, 0)

  return (
    <Section id="reljef" width="wide">
      <Hook className="pb-8">
        {top ? `Grad ima planinu, a vrh joj je ${top.name}.` : "Grad ima planinu."}
      </Hook>

      <KvartTerrain kvartovi={terrain.kvartovi} values={terrain.values} />

      <BodyMuted className="mt-6 font-mono text-label">
        mjereno zadnjih {dayCount(ranking.observedDays)} · vožnja se broji kvartu u
        kojem je počela
      </BodyMuted>
      <Body className="mt-3 max-w-[560px]">
        Bajs stoji u <Strong>{covered}</Strong> od sedamnaest zagrebačkih
        kvartova, a <Strong>{`${Math.round(topThree * 100)}%`}</Strong> vožnji
        počinje u samo tri. Ostatak grada je ravnica jer stanica ondje gotovo i
        nema.
      </Body>
    </Section>
  )
}

// ── Prose breather ──────────────────────────────────────────────────────────

export function Kicker({ rides }: { rides: BajsRides }) {
  const balance =
    rides.fullDays.length > 0
      ? rides.fullDays.reduce((sum, d) => sum + d.returns, 0) /
        rides.fullDays.reduce((sum, d) => sum + d.starts, 0)
      : null

  return (
    <Section id="mjerenje">
      <div className="flex flex-col gap-5">
        <Eyebrow>zašto vjerovati brojci</Eyebrow>
        <Hook>Svaki bicikl ima ime.</Hook>
        <Body>
          Javni feed sustava ne objavljuje broj vožnji. Objavljuje popis
          bicikala na svakoj stanici, svake minute, i svaki od njih ima svoju
          oznaku. Kad usporedimo dvije uzastopne minute, bicikl koji je nestao
          je krenuo, a bicikl koji se pojavio negdje drugdje je stigao.
        </Body>
        <Body>
          To znači da brojke ovdje nisu procjena iz razlike u zauzetosti
          stanica, nego zbroj pojedinačnih događaja.{" "}
          {balance !== null && (
            <>
              Provjera koja to potvrđuje: kroz cijeli dan broj dolazaka prati
              broj polazaka na{" "}
              <Strong>{(balance * 100).toFixed(1)} %</Strong>. Bicikli koji
              krenu se i vrate, pa se dvije neovisno brojane strane moraju
              poklopiti.
            </>
          )}
        </Body>
      </div>
    </Section>
  )
}

// ── Station ranking ─────────────────────────────────────────────────────────

function RankRow({
  station,
  value,
  label,
  max,
  index,
}: {
  station: BajsRankedStation
  value: number
  /** Rendered figure. The two lists carry different units, so it is explicit. */
  label: string
  max: number
  index: number
}) {
  return (
    <li className="flex items-center gap-3 border-b border-hairline py-2.5 last:border-b-0">
      <span className="w-6 shrink-0 font-mono text-label tabular-nums text-ink-faint">
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="w-[150px] shrink-0 truncate font-heros text-body text-ink sm:w-[190px]">
        {station.name}
      </span>
      <span className="hidden h-3 min-w-0 flex-1 bg-surface sm:flex">
        <span className="bg-zg-blue" style={{ width: `${(value / max) * 100}%` }} />
      </span>
      <span className="ml-auto w-16 shrink-0 text-right font-mono text-label tabular-nums text-ink sm:ml-0">
        {label}
      </span>
    </li>
  )
}

export function Stanice({
  ranking,
  rides,
}: {
  ranking: BajsRanking | null
  rides: BajsRides
}) {
  const measuring = rides.measuredFrom
    ? `Mjerenje traje od ${dayLabel(
        rides.measuredFrom.toISOString().slice(0, 10)
      )}.`
    : ""

  if (!ranking || !ranking.trustworthy) {
    return (
      <Section id="stanice">
        <SectionHeader eyebrow="stanice" hook="Poredak stanica se još skuplja">
          Koje su stanice najprometnije, a koje najčešće prazne, ima smisla
          objaviti tek kad mjerenje pokrije nekoliko tjedana.
        </SectionHeader>
        <BodyMuted>
          Zasad je izmjereno {dayCount(ranking?.observedDays ?? 0)}, a poredak postaje
          stabilan oko {RANKING_MIN_DAYS}. Jedan koncert ili jedan kišni vikend
          na kraćem uzorku preokrene vrh ljestvice, pa bi brojka zvučala
          točnije nego što jest. {measuring}
        </BodyMuted>
      </Section>
    )
  }

  const busiestMax = ranking.busiest[0]?.startsPerDay ?? 1
  const emptiestMax = ranking.emptiest[0]?.emptyShare ?? 1

  return (
    <Section id="stanice">
      <SectionHeader
        eyebrow={`stanice · ${dayCount(ranking.observedDays)} mjerenja`}
        hook={`${ranking.busiest[0]?.name} je najprometnija stanica u gradu`}
      >
        Vožnje započete po danu, po stanici.
      </SectionHeader>

      <ul>
        {ranking.busiest.map((s, i) => (
          <RankRow
            key={s.stationId}
            station={s}
            value={s.startsPerDay}
            label={`${num(s.startsPerDay)}/dan`}
            max={busiestMax}
            index={i}
          />
        ))}
      </ul>

      <div className="mt-12">
        <MonoLabel>najčešće prazne</MonoLabel>
        <ul className="mt-3">
          {ranking.emptiest.map((s, i) => (
            <RankRow
              key={s.stationId}
              station={s}
              value={s.emptyShare}
              label={`${Math.round(s.emptyShare * 100)} %`}
              max={emptiestMax}
              index={i}
            />
          ))}
        </ul>
        <BodyMuted className="mt-4">
          Postotak vremena u kojem na stanici nije bilo nijednog bicikla. Prazna
          stanica u sedam ujutro je propuštena vožnja.
        </BodyMuted>
      </div>
    </Section>
  )
}

// ── Zaključak ───────────────────────────────────────────────────────────────

export function Zakljucak({
  rides,
  balance,
  relocations,
}: {
  rides: BajsRides
  balance: BajsBalance | null
  relocations: BajsRelocations | null
}) {
  const morning = rides.morningPeak
  const emptiest = balance?.empty[0]

  return (
    <Section id="zakljucak">
      <div className="flex flex-col gap-5">
        <Eyebrow>zaključak</Eyebrow>
        <Hook>Bajs ne prevozi grad, dopunjuje ga.</Hook>
        <Body>
          {morning
            ? `U ${hourLabel(morning.hour)} krene oko ${num(morning.avgStarts)} vožnji i grad se pomakne prema poslu. `
            : ""}
          Navečer se bicikli vrate, ali ne na iste stanice s kojih su otišli.
          {relocations
            ? ` Kombi ih vraća danju, najviše u ${hourLabel(relocations.busiestHour)}, oko ${bikes(relocations.perDay)} dnevno.`
            : " Kombi ih zatim vraća natrag."}{" "}
          Ujutro sve krene ispočetka.
          {emptiest
            ? ` ${emptiest.name} je u tom ciklusu prazna ${Math.round((emptiest.emptyShare ?? 0) * 100)} % vremena.`
            : ""}
        </Body>
        <p className="font-heros text-head font-bold text-zg-blue">
          Prazna stanica u sedam ujutro je propuštena vožnja.
        </p>
      </div>
    </Section>
  )
}

// ── Smjer: which way demand runs ────────────────────────────────────────────

/**
 * One kvart on a shared axis: bikes leaving to the left of the tick, arriving
 * to the right. Net figures only, because a kvart's own internal rides cancel
 * out and what is left is the movement between kvartovi.
 *
 * The van's own moves are already netted out upstream, in `riderNet`. Without
 * that this chart would mostly draw the operator undoing the pattern it is
 * meant to show.
 */
function SmjerRow({ row, max }: { row: KvartFlow; max: number }) {
  const pct = (Math.abs(row.morningNet) / max) * 100
  const empties = row.morningNet < 0

  return (
    <div className="flex items-center gap-3 border-b border-hairline py-2 last:border-b-0">
      <span className="w-[150px] shrink-0 truncate font-mono text-label text-ink sm:w-[190px]">
        {row.name}
      </span>
      <span className="flex h-3 min-w-0 flex-1 items-center">
        <span className="flex flex-1 justify-end">
          {empties && (
            <span className="h-2 bg-ink-faint" style={{ width: `${pct}%` }} />
          )}
        </span>
        <span className="h-3 w-px shrink-0 bg-hairline" />
        <span className="flex flex-1">
          {!empties && (
            <span className="h-2 bg-zg-blue" style={{ width: `${pct}%` }} />
          )}
        </span>
      </span>
      <span
        className={cn(
          "flex w-[86px] shrink-0 items-center justify-end gap-1.5 font-mono text-label tabular-nums",
          empties ? "text-ink-muted" : "font-bold text-zg-blue"
        )}
      >
        {empties ? "" : "+"}
        {num(row.morningNet)}
        {row.reverses && (
          <IconArrowLeftRight
            size={12}
            className="shrink-0"
            aria-label="popodne se okreće"
          />
        )}
      </span>
    </div>
  )
}

export function Smjer({ flow }: { flow: BajsFlow | null }) {
  if (!flow || flow.kvartovi.length === 0) return null

  const shown = flow.kvartovi.filter((k) => Math.abs(k.morningNet) >= 1)
  if (shown.length < 3) return null

  const max = Math.max(1, ...shown.map((k) => Math.abs(k.morningNet)))
  const drain = flow.drains[0]
  const fill = flow.fills[0]
  const reversing = flow.kvartovi.filter((k) => k.reverses)

  return (
    <Section id="smjer" width="wide">
      <SectionHeader
        eyebrow={`smjer · jutro 07-09 · ${dayCount(flow.morningDays)} mjerenja`}
        // Kvart names are left in the nominative: they carry hyphens and
        // compass words that no suffix rule declines correctly.
        hook={
          fill
            ? `${fill.name} ujutro dobije ${bajsevi(fill.morningNet)}.`
            : "Ujutro bajsevi ne stoje na mjestu."
        }
      >
        Koliko bicikala svako jutro neto stigne u kvart, a koliko ga napusti.
        Vožnje unutar istog kvarta se poništavaju, pa ostaje samo ono što
        prelazi granicu.{" "}
        {drain ? `Najviše ih gubi ${drain.name}. ` : ""}
        Premještanja kombijem su odbijena, inače bi se vidjelo kako ih operater
        vraća, a ne kamo ih ljudi voze.
      </SectionHeader>

      <div>
        {shown.map((k) => (
          <SmjerRow key={k.name} row={k} max={max} />
        ))}
      </div>

      <BodyMuted className="mt-6 max-w-[560px]">
        {reversing.length > 0 ? (
          // Kept singular: a relative clause after a counted noun would have to
          // agree with the count, and the count changes as data accumulates.
          <>
            Strelica desno od brojke označava kvart koji se popodne okrene: ono
            što ujutro izgubi, poslijepodne dobije natrag. Takvih je{" "}
            {reversing.length}. To je vožnja na posao i s posla, vidljiva bez
            ijednog podatka o putniku.
          </>
        ) : (
          <>
            Nijedan kvart se popodne ne okreće dovoljno jasno da bi se to moglo
            zvati vožnjom na posao i natrag.
          </>
        )}
      </BodyMuted>
    </Section>
  )
}

// ── Kombi: the rebalancing van ──────────────────────────────────────────────

const KOMBI_HEIGHT = 140

/** The van's regular runs, which repeat often enough to be routes. */
function Rute({ corridors }: { corridors: BajsRelocations["corridors"] }) {
  if (corridors.length === 0) return null

  return (
    <div className="mt-8">
      <MonoLabel>najčešće rute</MonoLabel>
      <div className="mt-2.5">
        {corridors.slice(0, 6).map((c) => (
          <div
            key={`${c.from}-${c.to}`}
            className="flex items-baseline gap-3 border-b border-hairline py-2 last:border-b-0"
          >
            <span className="min-w-0 flex-1 truncate font-mono text-label text-ink">
              {c.from}
            </span>
            <IconArrowRight size={14} className="shrink-0 text-zg-blue" />
            <span className="min-w-0 flex-1 truncate font-mono text-label text-ink">
              {c.to}
            </span>
            <span className="w-16 shrink-0 text-right font-mono text-label tabular-nums text-ink-muted">
              {c.moves}×
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * The van, measured. A bike that turns up at a different station still
 * carrying the id it left with was never rented, because GBFS rotates
 * `bike_id` on rental precisely so rides cannot be followed. So every one of
 * these is somebody carrying a bike, and the set of them is the only
 * origin-destination data this feed will ever give up.
 */
export function Kombi({
  relocations,
  rides,
}: {
  relocations: BajsRelocations | null
  rides: BajsRides
}) {
  if (!relocations) return null
  const { perDay, hourly, busiestHour, avgMinutes, corridors } = relocations
  const max = Math.max(...hourly)
  if (max === 0) return null

  const ridePeak = rides.peakHour?.hour ?? null

  return (
    <Section id="kombi">
      <SectionHeader
        eyebrow={`kombi · ${dayCount(relocations.observedDays)} mjerenja`}
        hook={`Kombi svaki dan preveze oko ${bikes(perDay)}.`}
      >
        Htjeli smo znati odakle kamo ljudi voze. Feed to skriva namjerno: svaki
        bicikl pri iznajmljivanju dobije novi id, pa se vožnja ne može pratiti.
        Bicikl koji stigne na drugu stanicu sa starim id-om nitko nije
        iznajmio. Netko ga je prevezao. Ostalo nam je tako mjerenje kombija
        umjesto mjerenja grada.
      </SectionHeader>

      <div className="pt-2">
        <div
          className="flex items-end gap-1"
          style={{ height: `${KOMBI_HEIGHT}px` }}
        >
          {hourly.map((moves, hour) => (
            <div
              key={hour}
              title={`${hourLabel(hour)} · ${num(moves)}`}
              className={cn(
                "min-w-0 flex-1",
                hour === busiestHour ? "bg-zg-blue" : "bg-ink-ghost"
              )}
              style={{ height: `${Math.max(1, (moves / max) * KOMBI_HEIGHT)}px` }}
            />
          ))}
        </div>
        <Hairline className="mt-0" />
        <div className="flex justify-between pt-1.5">
          {["00", "06", "12", "18", "23"].map((t) => (
            <MonoLabel key={t}>{t}</MonoLabel>
          ))}
        </div>
      </div>

      <Body className="mt-6 max-w-[560px]">
        To je raspored smjene. Kreće u zoru, radi najviše u{" "}
        <Strong>{hourLabel(busiestHour)}</Strong>, stane oko podneva i vrati se
        popodne.
        {ridePeak !== null && ridePeak !== busiestHour
          ? ` Vrh vožnji dolazi tek u ${hourLabel(ridePeak)}, kad kombi već posustaje: bicikli se namještaju unaprijed, satima prije nego što zatrebaju.`
          : ""}{" "}
        Bicikl u kombiju provede u prosjeku {num(avgMinutes)}{" "}
        {plural(Math.round(avgMinutes), "minutu", "minute", "minuta")}.
      </Body>

      <Rute corridors={corridors} />

      <BodyMuted className="mt-6 max-w-[560px]">
        Objavljujemo ih jer nitko drugi ne objavljuje koliko posla stoji iza
        toga da bajs ujutro bude ondje gdje ga netko traži.
      </BodyMuted>
    </Section>
  )
}

// ── Metodologija ────────────────────────────────────────────────────────────

export function Metodologija({ rides }: { rides: BajsRides }) {
  const from = rides.measuredFrom
    ? dayLabel(rides.measuredFrom.toISOString().slice(0, 10))
    : null

  const chips = [
    "gbfs feed",
    "uzorak svake minute",
    "brojani događaji",
    "kombi isključen",
    "cc0 licenca",
  ]

  const caveats = [
    "vožnje se broje od uključenja mjerenja, ne od početka sustava. Starijih brojki nema jer ih javni feed nikad nije objavljivao.",
    "bicikl koji nestane s feeda i vrati se na isti stalak samo je greška feeda. Kratke nestanke odbacujemo odmah, a duže povlačimo naknadno: kad se bicikl pojavi ondje odakle je otišao, i to sa starim id-om, vožnja se briše iz sata u kojem je bila upisana.",
    "premještanje kombijem prepoznaje se na dva načina i ni u jednom ne ulazi u broj vožnji: po više bicikala koji odjednom napuste istu stanicu, i po biciklu koji stigne na drugu stanicu sa starim id-om. Feed pri iznajmljivanju dodijeli novi id, pa stari id znači da bicikl nije bio iznajmljen.",
    "kad feed zastane dulje od tri minute, te minute izostavljamo iz svih zbrojeva. Mirnima ih ne brojimo.",
    "privremene stanice, one kojima je rok trajanja upisan u ime, izostavljene su iz popisa najpraznijih jer su prazne po dogovoru, a ne zbog potražnje.",
  ]

  return (
    <Section id="metodologija">
      <div className="flex flex-col gap-5">
        <Eyebrow>metodologija</Eyebrow>
        <Hook>Odakle brojke</Hook>
        <Body>
          Sustav javnih bicikala objavljuje otvoreni GBFS feed sa stanjem svake
          stanice. Snimamo ga svake minute{from ? ` od ${from}` : ""} i
          uspoređujemo uzastopne snimke.
        </Body>

        <div className="flex flex-wrap gap-1.75 pt-0.5">
          {chips.map((c) => (
            <Chip key={c}>{c}</Chip>
          ))}
        </div>

        <div className="mt-2 flex flex-col gap-2.25">
          <MonoLabel>uz oprez</MonoLabel>
          {caveats.map((c) => (
            <div key={c} className="flex items-baseline gap-2.5">
              <span className="shrink-0 font-mono text-label text-zg-blue">·</span>
              <BodyMuted>{c}</BodyMuted>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}
