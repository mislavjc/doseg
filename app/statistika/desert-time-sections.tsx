import type {
  District as DistrictScore,
  DistrictScoresOutput as ScoreData,
} from "@/lib/generated"
import type {
  computeDesertInsights,
  computeEveningInsights,
  computeBaseInsights,
  computeWeekendData,
  WeekendItem,
} from "./stat-data"
import { fmtHR } from "@/lib/format"
import { pct } from "./stat-data"
import { RankingList } from "./stat-shared"
import { CollapsibleContent } from "./stat-expandable"
import { StatModuleTitle } from "./stat-typography"

type DesertInsights = ReturnType<typeof computeDesertInsights>
type EveningInsights = ReturnType<typeof computeEveningInsights>
type BaseInsights = ReturnType<typeof computeBaseInsights>
type WeekendData = ReturnType<typeof computeWeekendData>

export function TransitDesertSection({
  data,
  desert,
}: {
  data: ScoreData
  desert: DesertInsights
}) {
  return (
    <section
      id="pustinje"
      className="flex flex-col border-t border-hairline py-16 sm:py-24"
    >
      <TransitDesertHeader />
      <CollapsibleContent
        expandLabel="Prikaži prometne pustinje"
        collapseLabel="Suzi prometne pustinje"
      >
        <div className="flex flex-col items-start gap-12 lg:flex-row lg:gap-16">
          {desert.desertDistricts.length > 0 && (
            <div className="w-full shrink-0 lg:w-[400px]">
              <DesertRanking data={data} desert={desert} />
            </div>
          )}
          <div className="flex-1">
            <DesertInterpretation data={data} desert={desert} />
          </div>
        </div>
      </CollapsibleContent>
    </section>
  )
}

function TransitDesertHeader() {
  return (
    <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <StatModuleTitle>Prometne pustinje</StatModuleTitle>
        <p className="mt-4 max-w-xl text-body text-ink-2">
          Područja gdje je najbliža stanica udaljena više od 500 metara zračne
          linije (realna pješačka udaljenost je 20-40% veća) ili gdje prijevoz
          dolazi rjeđe od 2 puta na sat.
        </p>
      </div>
    </div>
  )
}

function DesertRanking({
  data,
  desert,
}: {
  data: ScoreData
  desert: DesertInsights
}) {
  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="font-mono text-label font-bold text-ink-muted">
          Daleko od stanice (&gt;500m)
        </h3>
        <span className="font-sans text-body text-ink-muted">
          {data.cityDesertPct}% grada
        </span>
      </div>
      <p className="mb-6 text-body text-ink-muted">
        Udio uzorkovanih točaka u svakom kvartu udaljenijih više od 500m od
        najbliže stanice javnog prijevoza.
      </p>
      <RankingList
        items={desert.desertDistricts}
        value={(d) => d.desertPct}
        label={(d) => `${d.desertPct}%`}
        trailing={(d) => `~${d.avgNearestStopM}m`}
        color={{
          text: "text-ink",
          bg: "bg-surface",
          bar: "bg-ink-2",
        }}
      />
    </div>
  )
}

function DesertInterpretation({
  data,
  desert,
}: {
  data: ScoreData
  desert: DesertInsights
}) {
  return (
    <div>
      <h3 className="font-sans text-head font-bold text-ink">
        Koliko je to loše?
      </h3>
      <DesertStatCards data={data} desert={desert} />
      <DesertInterpretationText desert={desert} />
    </div>
  )
}

function DesertStatCards({
  data,
  desert,
}: {
  data: ScoreData
  desert: DesertInsights
}) {
  return (
    <div className="my-8 flex flex-col gap-8 border-y border-hairline py-6 sm:flex-row sm:gap-12">
      <div className="flex flex-col border-l-2 border-ink-2 py-1 pl-4">
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          {data.cityDesertPct}%
        </div>
        <div className="mt-2 text-body text-ink-muted">
          uzorkovanih točaka grada
          <br className="hidden sm:block" /> je &gt;500m od stanice
        </div>
      </div>
      <div className="flex flex-col border-l-2 border-ink-2 py-1 pl-4">
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          {desert.desertDistricts.length}
        </div>
        <div className="mt-2 text-body text-ink-muted">
          od {data.districts.length} kvartova ima barem
          <br className="hidden sm:block" /> jednu pustinjsku zonu
        </div>
      </div>
    </div>
  )
}

function DesertInterpretationText({ desert }: { desert: DesertInsights }) {
  return (
    <div className="space-y-6 text-body text-ink-2">
      <p>
        Najveća prometna pustinja je{" "}
        <strong className="font-medium text-ink">
          {desert.desertDistricts[0]?.name}
        </strong>{" "}
        - {desert.desertDistricts[0]?.desertPct}% uzorkovanih točaka je više od
        500m zračne linije od najbliže stanice, s prosječnom udaljenošću od{" "}
        <strong className="font-medium text-ink">
          ~{desert.desertDistricts[0]?.avgNearestStopM}m
        </strong>
        .
      </p>
      {desert.lowFreqDistricts.length > 0 && (
        <p>
          Dodatno,{" "}
          <strong className="font-medium text-ink">
            {desert.lowFreqDistricts.length}
          </strong>{" "}
          {desert.lowFreqDistricts.length === 1
            ? "kvart ima"
            : desert.lowFreqDistricts.length % 10 >= 2 &&
                desert.lowFreqDistricts.length % 10 <= 4 &&
                (desert.lowFreqDistricts.length % 100 < 12 ||
                  desert.lowFreqDistricts.length % 100 > 14)
              ? "kvarta imaju"
              : "kvartova ima"}{" "}
          medijan intervala ≥30 min - manje od 2 polaska na sat (
          {desert.lowFreqDistricts.map((d) => d.name).join(", ")}).
        </p>
      )}
    </div>
  )
}

export function StopDistanceSection({ desert }: { desert: DesertInsights }) {
  if (desert.stopDistSorted.length === 0) {
    return null
  }
  return (
    <section
      id="udaljenost-stajalista"
      className="flex flex-col border-t border-hairline py-16 sm:py-24"
    >
      <StopDistanceHeader />
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
        <StopDistanceChart desert={desert} />
        <StopDistanceInterpretation desert={desert} />
      </div>
    </section>
  )
}

function StopDistanceHeader() {
  return (
    <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <StatModuleTitle>Udaljenost do najbližeg stajališta</StatModuleTitle>
        <p className="mt-4 max-w-xl text-body text-ink-2">
          Prosječna udaljenost pješačenja do najbliže stanice javnog prijevoza.
          Urbanistički standard od{" "}
          <strong className="font-medium text-ink">400 metara</strong> smatra se
          ugodnom pješačkom udaljenošću - sve iznad toga odvraća ljude od
          korištenja javnog prijevoza.
        </p>
      </div>
    </div>
  )
}

function StopDistanceChart({ desert }: { desert: DesertInsights }) {
  return (
    <div>
      <h3 className="mb-6 font-mono text-label font-bold text-ink-muted">
        Prosječna udaljenost po kvartu (m)
      </h3>
      <div className="flex flex-col gap-2">
        {desert.stopDistSorted.slice(0, 10).map((d, i) => (
          <StopDistanceBar
            key={d.osmId}
            d={d}
            i={i}
            maxStopDist={desert.maxStopDist}
          />
        ))}
      </div>
      <StopDistanceLegend />
    </div>
  )
}

function StopDistanceBar({
  d,
  i,
  maxStopDist,
}: {
  d: DistrictScore
  i: number
  maxStopDist: number
}) {
  const meters = d.avgNearestStopM
  const barPct = (meters / maxStopDist) * 100
  const thresholdPct = (400 / maxStopDist) * 100
  const barColor =
    meters < 200
      ? "bg-zg-blue"
      : meters <= 400
        ? "bg-ink-ghost"
        : meters <= 500
          ? "bg-ink-faint"
          : "bg-ink-2"
  return (
    <div className="flex items-center gap-3">
      <span className="w-5 shrink-0 text-right font-mono text-label text-ink-faint">
        {i + 1}
      </span>
      <span className="w-20 shrink-0 truncate text-body text-ink-2 sm:w-[7.5rem]">
        {d.name}
      </span>
      <div className="relative h-5 flex-1 overflow-hidden bg-track">
        <div
          className={`absolute inset-y-0 left-0 ${barColor}`}
          style={{ width: `${barPct}%` }}
        />
        <div
          className="absolute inset-y-0 w-px border-l-2 border-dashed border-ink-ghost"
          style={{ left: `${thresholdPct}%` }}
          title="400m"
        />
      </div>
      <span className="w-12 shrink-0 text-right font-mono text-label text-ink tabular-nums">
        {Math.round(meters)}m
      </span>
    </div>
  )
}

function StopDistanceLegend() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-label text-ink-muted">
      <span className="flex items-center gap-1">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-zg-blue" />
        &lt;200m
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-ink-ghost" />
        200-400m
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-ink-faint" />
        400-500m
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-ink-2" />
        &gt;500m
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-3.5 w-px border-l-2 border-dashed border-ink-ghost" />
        400m prag
      </span>
    </div>
  )
}

function StopDistanceInterpretation({ desert }: { desert: DesertInsights }) {
  const first = desert.stopDistSorted[0]
  const last = desert.stopDistSorted[desert.stopDistSorted.length - 1]
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6">
        <StopDistStatCards first={first} last={last} />
        <StopDistInterpretationText desert={desert} first={first} last={last} />
      </div>
    </div>
  )
}

function StopDistStatCards({
  first,
  last,
}: {
  first: DistrictScore
  last: DistrictScore
}) {
  return (
    <div className="flex flex-col gap-8 sm:flex-row">
      <div className="flex flex-col border-l-2 border-zg-blue py-1 pl-4">
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          ~{Math.round(first?.avgNearestStopM ?? 0)}m
        </div>
        <div className="mt-2 text-body text-ink-muted">{first?.name}</div>
        <div className="mt-1 text-body text-ink-faint">
          najbliže stanice u prosjeku
        </div>
      </div>
      <div className="flex flex-col border-l-2 border-ink-2 py-1 pl-4">
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          ~{Math.round(last?.avgNearestStopM ?? 0)}m
        </div>
        <div className="mt-2 text-body text-ink-muted">{last?.name}</div>
        <div className="mt-1 text-body text-ink-faint">
          najudaljenije stanice u prosjeku
        </div>
      </div>
    </div>
  )
}

function StopDistInterpretationText({
  desert,
  first,
  last,
}: {
  desert: DesertInsights
  first: DistrictScore
  last: DistrictScore
}) {
  return (
    <div className="space-y-4 text-body text-ink-2">
      <p>
        Stanovnici{" "}
        <strong className="font-medium text-ink">{first?.name}</strong> u
        prosjeku pješače samo ~{Math.round(first?.avgNearestStopM ?? 0)}m do
        najbliže stanice, dok stanovnici{" "}
        <strong className="font-medium text-ink">{last?.name}</strong> moraju
        prijeći ~{Math.round(last?.avgNearestStopM ?? 0)}m -{" "}
        {Math.round(
          (last?.avgNearestStopM ?? 0) /
            Math.max(first?.avgNearestStopM ?? 1, 1)
        )}
        x više.
      </p>
      <p>
        <strong className="font-medium text-ink">
          {desert.stopDistOver400.length}
        </strong>{" "}
        od {desert.stopDistSorted.length} kvartova prelazi prag od 400m ugodne
        pješačke udaljenosti
        {desert.stopDistOver400.length > 0 && (
          <> ({desert.stopDistOver400.map((d) => d.name).join(", ")})</>
        )}
        . Iznad tog praga, značajno opada spremnost građana da koriste javni
        prijevoz kao svakodnevni oblik putovanja.
      </p>
    </div>
  )
}

export function PeakOffPeakSection({
  data,
  base,
  evening,
}: {
  data: ScoreData
  base: BaseInsights
  evening: EveningInsights
}) {
  if (evening.eveningRankedByDrop.length === 0) {
    return null
  }
  return (
    <section
      id="vrsni-sat"
      className="flex flex-col border-t border-hairline py-16 sm:py-24"
    >
      <PeakOffPeakHeader departureTime={base.displayDepartureTime} />
      <CollapsibleContent
        expandLabel="Prikaži jutro vs. večer"
        collapseLabel="Suzi jutro vs. večer"
      >
        <div className="flex flex-col items-start gap-12 overflow-hidden lg:flex-row lg:gap-16">
          <div className="w-full shrink-0 lg:w-[400px]">
            <PeakOffPeakRanking data={data} evening={evening} />
          </div>
          <div className="min-w-0 flex-1">
            <PeakOffPeakInterpretation evening={evening} />
          </div>
        </div>
      </CollapsibleContent>
    </section>
  )
}

function PeakOffPeakHeader({ departureTime }: { departureTime: string }) {
  return (
    <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <StatModuleTitle>Jutro vs. večer</StatModuleTitle>
        <p className="mt-4 max-w-xl text-body text-ink-2">
          Koliko dostupnosti svaki kvart gubi navečer (21:00) u usporedbi s
          jutarnjim vršnim satom ({departureTime}). Ista mreža, manji broj
          polazaka.
        </p>
      </div>
    </div>
  )
}

function PeakOffPeakRanking({
  data,
  evening,
}: {
  data: ScoreData
  evening: EveningInsights
}) {
  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="font-mono text-label font-bold text-ink-muted">
          Najveći pad navečer
        </h3>
        <div className="inline-flex items-center gap-1.5 bg-blue-wash px-2.5 py-0.5 font-sans text-body text-zg-blue">
          <span className="font-semibold tracking-tight tabular-nums">
            -{evening.cityEveningDrop}%
          </span>
          <span className="font-normal opacity-70">prosjek</span>
        </div>
      </div>
      <p className="mb-6 text-body text-ink-muted">
        Postotak smanjenja dosežnih ćelija u 30 minuta navečer u usporedbi s
        jutarnjim vršnim satom.
      </p>
      <div className="space-y-3">
        <RankingList
          items={evening.eveningRankedByDrop}
          value={(d) => d.peakOffpeakDrop}
          label={(d) => `-${d.peakOffpeakDrop}%`}
          trailing={(d) =>
            `${pct(d.eveningAvgReachableCells, data.totalGridCells)}%`
          }
          color={{
            text: "text-zg-blue",
            bg: "bg-chip-blue",
            bar: "bg-zg-blue",
          }}
        />
      </div>
    </div>
  )
}

function PeakOffPeakInterpretation({ evening }: { evening: EveningInsights }) {
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <PeakOffPeakStatCards evening={evening} />
      <div className="min-w-0 space-y-4 text-body text-ink-2">
        <p>
          Gradski prosjek pada za{" "}
          <strong className="font-medium text-ink">
            {evening.cityEveningDrop}%
          </strong>{" "}
          navečer. Najviše gube rubni kvartovi koji ovise o rijetkim autobusnim
          linijama, dok centar s gustom tramvajskom mrežom zadržava većinu
          povezanosti.
        </p>
      </div>
    </div>
  )
}

function PeakOffPeakStatCards({ evening }: { evening: EveningInsights }) {
  return (
    <div className="flex min-w-0 flex-col gap-8 sm:flex-row">
      <div className="flex min-w-0 flex-col border-l-2 border-zg-blue py-1 pl-4">
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          -{evening.cityEveningDrop}%
        </div>
        <div className="mt-2 text-body text-ink-muted">
          prosječni pad dosega
          <br className="hidden sm:block" /> u cijelom gradu
        </div>
      </div>
      <div className="flex min-w-0 flex-col border-l-2 border-zg-blue py-1 pl-4">
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          -{evening.eveningRankedByDrop[0]?.peakOffpeakDrop ?? 0}%
        </div>
        <div className="mt-2 text-body text-ink-muted">
          najgori pad
          <br className="hidden sm:block" /> (
          {evening.eveningRankedByDrop[0]?.name ?? "-"})
        </div>
      </div>
    </div>
  )
}

export function WeekendSection({ weekend }: { weekend: WeekendData }) {
  if (!weekend.weekendComparison || weekend.weekendComparison.length === 0) {
    return null
  }
  return (
    <section
      id="vikend"
      className="flex flex-col border-t border-hairline py-16 sm:py-24"
    >
      <WeekendHeader cityWeekendChange={weekend.cityWeekendChange} />
      <CollapsibleContent
        expandLabel="Prikaži vikend analizu"
        collapseLabel="Suzi vikend analizu"
      >
        <div className="flex flex-col items-start gap-12">
          <div className="w-full">
            <WeekendBarChart weekend={weekend} />
          </div>
          <div>
            <WeekendInterpretation weekend={weekend} />
          </div>
        </div>
      </CollapsibleContent>
    </section>
  )
}

function WeekendHeader({ cityWeekendChange }: { cityWeekendChange: number }) {
  return (
    <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <StatModuleTitle>Radni dan vs. subota</StatModuleTitle>
        <p className="mt-4 max-w-xl text-body text-ink-2">
          Usporedba rezultata dostupnosti radnim danom i subotom.
          {cityWeekendChange > 0
            ? " Iznenađujuće, subotom je povezanost u prosjeku bolja. OTP model koristi subotnja vremena vožnje koja su kraća zbog manjeg prometa, što više nego kompenzira rjeđi vozni red."
            : " Manji broj polazaka subotom smanjuje doseg većine kvartova."}
        </p>
      </div>
    </div>
  )
}

function WeekendBarChart({ weekend }: { weekend: WeekendData }) {
  if (!weekend.weekendComparison) {
    return null
  }
  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="font-mono text-label font-bold text-ink-muted">
          Promjena rezultata subotom
        </h3>
        <div className="inline-flex items-center gap-1.5 bg-surface px-2.5 py-0.5 font-sans text-body text-ink-2">
          <span className="font-semibold tracking-tight tabular-nums">
            {weekend.cityWeekendChange > 0 ? "+" : ""}
            {fmtHR(weekend.cityWeekendChange, 1)}%
          </span>
          <span className="font-normal opacity-70">prosjek</span>
        </div>
      </div>
      <p className="mb-6 text-body text-ink-muted">
        Postotak promjene rezultata subotom u usporedbi s radnim danom.
      </p>
      <div className="flex flex-col gap-2">
        {(() => {
          const maxAbsChange = Math.max(
            ...weekend.weekendComparison.map((x) => Math.abs(x.change)),
            1
          )
          return weekend.weekendComparison.map((p, i) => (
            <WeekendBarRow
              key={p.name}
              p={p}
              i={i}
              maxAbsChange={maxAbsChange}
            />
          ))
        })()}
      </div>
    </div>
  )
}

function WeekendBarRow({
  p,
  i,
  maxAbsChange,
}: {
  p: WeekendItem
  i: number
  maxAbsChange: number
}) {
  const barPct = (Math.abs(p.change) / maxAbsChange) * 100
  const isPositive = p.change >= 0
  const barColor = isPositive ? "bg-zg-blue" : "bg-ink-2"
  const barBg = isPositive ? "bg-chip-blue" : "bg-surface"
  return (
    <div className="flex flex-col border-b border-hairline py-3 last:border-0">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-label font-bold text-ink-faint">
            {(i + 1).toString().padStart(2, "0")}
          </span>
          <span className="text-body text-ink-2">{p.name}</span>
        </div>
        <span
          className={`shrink-0 font-sans text-body tabular-nums ${isPositive ? "text-zg-blue" : "text-ink"}`}
        >
          {p.change > 0 ? "+" : ""}
          {fmtHR(p.change, 1)}%
        </span>
      </div>
      <div className="ml-2 sm:ml-7">
        <div className={`relative h-1.5 w-full overflow-hidden ${barBg}`}>
          <div
            className={`absolute inset-y-0 left-0 ${barColor}`}
            style={{ width: `${barPct}%` }}
          />
        </div>
        <div className="mt-2 font-mono text-label text-ink-muted tabular-nums">
          Radni dan: {p.weekdayScore} &rarr; Subota: {p.weekendScore}
        </div>
      </div>
    </div>
  )
}

function WeekendInterpretation({ weekend }: { weekend: WeekendData }) {
  if (!weekend.weekendComparison) {
    return null
  }
  return (
    <div className="flex flex-col gap-8">
      <WeekendStatCards weekend={weekend} />
      <div className="space-y-6 text-body text-ink-2">
        {weekend.cityWeekendChange > 0 ? (
          <WeekendPositiveText
            weekendComparison={weekend.weekendComparison}
            cityWeekendChange={weekend.cityWeekendChange}
          />
        ) : (
          <WeekendNegativeText
            weekendComparison={weekend.weekendComparison}
            cityWeekendChange={weekend.cityWeekendChange}
          />
        )}
      </div>
    </div>
  )
}

function WeekendStatCards({ weekend }: { weekend: WeekendData }) {
  if (!weekend.weekendComparison) {
    return null
  }
  return (
    <div className="flex flex-col gap-8 sm:flex-row">
      <div className="flex flex-col border-l-2 border-ink-muted py-1 pl-4">
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          {weekend.cityWeekendChange > 0 ? "+" : ""}
          {fmtHR(weekend.cityWeekendChange, 1)}%
        </div>
        <div className="mt-2 text-body text-ink-muted">
          pop. ponderirana
          <br className="hidden sm:block" /> prosječna promjena
        </div>
      </div>
      <div className="flex flex-col border-l-2 border-ink-muted py-1 pl-4">
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          {weekend.weekendComparison[0]?.change > 0 ? "+" : ""}
          {fmtHR(weekend.weekendComparison[0]?.change ?? 0, 1)}%
        </div>
        <div className="mt-2 text-body text-ink-muted">
          najveća promjena
          <br className="hidden sm:block" /> (
          {weekend.weekendComparison[0]?.name ?? "-"})
        </div>
      </div>
    </div>
  )
}

function WeekendPositiveText({
  weekendComparison,
  cityWeekendChange,
}: {
  weekendComparison: Array<WeekendItem>
  cityWeekendChange: number
}) {
  const worst = weekendComparison
    .toSorted((a, b) => a.change - b.change)
    .slice(0, 3)
  const hasNegative = worst.some((p) => p.change < 0)
  return (
    <>
      <p>
        Iznenađujuće, subotom je povezanost u prosjeku{" "}
        <strong className="font-medium text-ink">
          bolja za {fmtHR(cityWeekendChange, 1)}%
        </strong>
        . Manji promet ubrzava tramvaje i autobuse, a kraća čekanja na ključnim
        stajalištima kompenziraju rjeđi vozni red.
      </p>
      <p>
        Najviše profitiraju{" "}
        <strong className="font-medium text-ink">
          {weekendComparison
            .slice(0, 3)
            .map((p) => p.name)
            .join(", ")}
        </strong>{" "}
        ,kvartovi gdje radnim danom gužva usporava promet.
      </p>
      {hasNegative ? (
        <p>
          Ipak,{" "}
          <strong className="font-medium text-ink">
            {worst
              .filter((p) => p.change < 0)
              .map((p) => p.name)
              .join(", ")}
          </strong>{" "}
          gube subotom,ovise o linijama koje vikendom voze rjeđe.
        </p>
      ) : (
        <p>
          Svi kvartovi imaju jednaku ili bolju povezanost subotom ,rijetka
          pozitivna priča u javnom prijevozu.
        </p>
      )}
    </>
  )
}

function WeekendNegativeText({
  weekendComparison,
  cityWeekendChange,
}: {
  weekendComparison: Array<WeekendItem>
  cityWeekendChange: number
}) {
  const resilient = weekendComparison.slice(0, 3)
  return (
    <>
      <p>
        Subotom grad gubi prosječno{" "}
        <strong className="font-medium text-ink">
          {fmtHR(Math.abs(cityWeekendChange), 1)}%
        </strong>{" "}
        povezanosti. Najviše gube{" "}
        <strong className="font-medium text-ink">
          {weekendComparison
            .slice(-3)
            .map((p) => p.name)
            .join(", ")}
        </strong>{" "}
        ,kvartovi koji ovise o autobusnim linijama s rijetkim vikend voznim
        redom.
      </p>
      <p>
        Najotpornije su{" "}
        <strong className="font-medium text-ink">
          {resilient.map((p) => p.name).join(", ")}
        </strong>{" "}
        ,gusta tramvajska mreža održava povezanost i vikendom.
      </p>
    </>
  )
}
