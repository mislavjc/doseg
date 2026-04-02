import { ZagrebBlockMap } from "@/components/zagreb-block-map"
import type { District as DistrictScore, DistrictScoresOutput as ScoreData } from "@/lib/generated"
import type { computeBaseInsights, computeBajsInsights } from "./stat-data"
import { EditorialStat } from "./stat-shared"
import {
  StatBodyLarge,
  StatDisplayHeading,
  StatEmphasis,
  StatHeroMeta,
  StatHeroMetaText,
  StatModuleLead,
  StatModuleTitle,
  StatOverline,
  StatPageTitle,
  StatProse,
} from "./stat-typography"

type BaseInsights = ReturnType<typeof computeBaseInsights>
type BajsInsights = ReturnType<typeof computeBajsInsights>

export function StatHero({
  best,
  bestPct,
  departureTime,
  maxMinutes,
  ratio,
  worst,
}: {
  best: DistrictScore
  bestPct: string
  departureTime: string
  maxMinutes: number
  ratio: number
  worst: DistrictScore
}) {
  return (
    <section className="mb-24">
      <StatHeroMeta>
        <StatHeroMetaText>jutarnji presjek</StatHeroMetaText>
        <span className="h-1 w-1 rounded-full bg-slate-200 dark:bg-slate-600" />
        <span className="text-[13px] font-medium text-slate-400 dark:text-slate-500">
          {departureTime}
        </span>
      </StatHeroMeta>
      <StatPageTitle className="mb-8">Povezanost četvrti</StatPageTitle>
      <StatBodyLarge>
        U Zagrebu, prosječni stanovnik četvrti{" "}
        <StatEmphasis>{best.name}</StatEmphasis> može doseći
        <StatEmphasis> {bestPct}% grada </StatEmphasis>u {maxMinutes} minuta. S
        druge strane, oni u četvrti <StatEmphasis>{worst.name}</StatEmphasis>{" "}
        imaju{" "}
        <StatEmphasis>
          {ratio === Infinity ? "čak ∞" : `čak ${ratio}x`} slabiji
        </StatEmphasis>{" "}
        doseg.
      </StatBodyLarge>
    </section>
  )
}

export function HeadlineInsights({
  data,
  base,
  bajs,
}: {
  data: ScoreData
  base: BaseInsights
  bajs: BajsInsights
}) {
  return (
    <div className="mt-8 mb-24 sm:mt-12">
      <StatDisplayHeading>Gradski presjek povezanosti</StatDisplayHeading>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
        <EditorialStat
          detail="Gradski prosjek od 100. Populacijski ponderiran prosječni rezultat."
          value={String(base.cityWeightedScore)}
        />
        <EditorialStat
          detail={`Od ${data.districts.length} četvrti ima rezultat iznad 50 bodova (dobra povezanost).`}
          value={String(base.goodDistricts.length)}
        />
        <EditorialStat
          detail="Stanovnika živi u četvrtima s rezultatom manjim od 25 (jaz u dostupnosti)."
          value={`${base.totalPop > 0 ? Math.round((base.poorPop / base.totalPop) * 100) : 0}%`}
        />
        <EditorialStat
          detail={`Grada može se doseći iz najbolje četvrti (${base.best.name}).`}
          value={`${base.bestPct}%`}
        />
        <HzEditorialStat data={data} />
        {bajs.hasBajs && <BajsEditorialStat bajs={bajs} />}
      </div>
    </div>
  )
}

function HzEditorialStat({ data }: { data: ScoreData }) {
  const districtsWithTrains = data.districts.filter(
    (d) => (d.trainLines?.length ?? 0) > 0
  ).length
  if (districtsWithTrains === 0) return null
  return (
    <EditorialStat
      value={String(districtsWithTrains)}
      detail={`Od ${data.districts.length} četvrti imaju vlak, uz 0% doprinosa dosegu zbog rijetkih intervala.`}
    />
  )
}

function BajsEditorialStat({
  bajs,
}: {
  bajs: BajsInsights
}) {
  return (
    <EditorialStat
      value={String(bajs.bajsTotalStations)}
      note="+"
      detail={`Stanica BAJS sustava dodaje prosječno +${bajs.cityBajsBoost}% dosega za cijeli grad.`}
    />
  )
}

export function ChoroplethSection() {
  return (
    <section id="karta" className="mb-24">
      <div className="mb-8">
        <StatOverline className="mb-2 normal-case">Karta područja</StatOverline>
        <ChoroplethLegend />
      </div>
      <div className="w-full rounded-[12px] bg-[#f9f9f9] p-4 sm:p-6 dark:bg-[#1a1a1a]">
        <ZagrebBlockMap />
      </div>
    </section>
  )
}

function ChoroplethLegend() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600 dark:text-slate-400">
      <span className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-[#16a34a]" />
        Bolja povezanost
      </span>
      <span className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-[#9333ea]" />
        Lošija povezanost
      </span>
    </p>
  )
}

export function ScoreMeaningSection({
  data,
  base,
  bajs,
}: {
  data: ScoreData
  base: BaseInsights
  bajs: BajsInsights
}) {
  return (
    <section id="metodika" className="mt-16 mb-24">
      <div className="mb-6">
        <StatModuleTitle>Što znači rezultat</StatModuleTitle>
      </div>
      <StatProse>
        <p>
          Grad je podijeljen u ćelije od ~200m. Rezultat mjeri koliki udio tih
          ćelija ({data.totalGridCells.toLocaleString("hr-HR")} ukupno) možeš
          doseći za <StatEmphasis>{data.maxMinutes} minuta</StatEmphasis>{" "}
          koristeći tramvaj, bus i hodanje. Uzorkovane su samo naseljene točke
          (blizu zgrada).
        </p>
        <ScoreMeaningDetails base={base} bajs={bajs} />
      </StatProse>
    </section>
  )
}

function ScoreMeaningDetails({
  base,
  bajs,
}: {
  base: BaseInsights
  bajs: BajsInsights
}) {
  return (
    <>
      <p>
        <StatEmphasis>{base.best.name}</StatEmphasis> ima rezultat 100 - njeni
        stanovnici prosječno mogu doseći {base.bestPct}% grada.{" "}
        <StatEmphasis>{base.worst.name}</StatEmphasis> ima rezultat{" "}
        {base.worst.score} - samo {base.worstPct}%.
      </p>
      {bajs.hasBajs && (
        <p>
          Dodatno mjerimo utjecaj{" "}
          <StatEmphasis>BAJS bike-sharinga</StatEmphasis> - u idealnom scenariju
          (svaka stanica ima bicikl) prosječni stanovnik grada dobiva{" "}
          <StatEmphasis>+{bajs.cityBajsBoost}%</StatEmphasis> veći doseg.
        </p>
      )}
    </>
  )
}

export function AccessibilityGapSection({
  base,
}: {
  base: BaseInsights
}) {
  const goodPct =
    base.totalPop > 0 ? Math.round((base.goodPop / base.totalPop) * 100) : 0
  const poorPct =
    base.totalPop > 0 ? Math.round((base.poorPop / base.totalPop) * 100) : 0

  return (
    <section
      id="jaz"
      className="flex flex-col border-t border-slate-100 py-16 sm:py-24 dark:border-white/10"
    >
      <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <StatModuleTitle className="text-rose-800 dark:text-rose-400">
            Jaz u dostupnosti
          </StatModuleTitle>
          <StatModuleLead>
            Samo{" "}
            <strong className="font-medium text-rose-900 dark:text-rose-300">
              {goodPct}%
            </strong>{" "}
            Zagrepčana ({base.goodPop.toLocaleString("hr-HR")} stan.) živi u
            četvrtima s rezultatom ≥50. Istovremeno,{" "}
            <strong className="font-medium text-rose-900 dark:text-rose-300">
              {poorPct}%
            </strong>{" "}
            ({base.poorPop.toLocaleString("hr-HR")} stan.) živi u četvrtima gdje
            je rezultat ispod 25 - to uključuje{" "}
            <span className="text-slate-600 dark:text-slate-400">
              {base.poorDistricts.map((d) => d.name).join(", ")}
            </span>
            .
          </StatModuleLead>
        </div>
      </div>
      <div className="mt-2">
        <div className="flex h-6 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="bg-emerald-500" style={{ width: `${goodPct}%` }} />
          <div className="bg-rose-500" style={{ width: `${poorPct}%` }} />
        </div>
        <div className="mt-3 flex justify-between text-[13px] text-slate-500">
          <span>Dobra povezanost (&ge;50): {goodPct}%</span>
          <span>Lo&#353;a povezanost (&lt;25): {poorPct}%</span>
        </div>
      </div>
    </section>
  )
}
