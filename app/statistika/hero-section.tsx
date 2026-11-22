import { ZagrebBlockMap } from "@/components/zagreb-block-map"
import type {
  District as DistrictScore,
  DistrictScoresOutput as ScoreData,
} from "@/lib/generated"
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
    <section className="mt-4">
      <StatPageTitle>Povezanost kvartova</StatPageTitle>
      <StatHeroMeta>
        <StatHeroMetaText>jutarnji presjek</StatHeroMetaText>
        <span aria-hidden>·</span>
        <span>{departureTime}</span>
      </StatHeroMeta>
      <StatBodyLarge className="mt-4">
        U Zagrebu, prosječni stanovnik kvarta{" "}
        <StatEmphasis>{best.name}</StatEmphasis> može doseći
        <StatEmphasis> {bestPct}% grada </StatEmphasis>u {maxMinutes} minuta. S
        druge strane, oni u kvartu <StatEmphasis>{worst.name}</StatEmphasis>{" "}
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
    <div className="mt-14 sm:mt-16">
      <StatOverline>
        gradski presjek · {data.districts.length} kvartova
      </StatOverline>
      <StatDisplayHeading>Gradski presjek povezanosti</StatDisplayHeading>
      <div className="grid grid-cols-1 border-b border-hairline-strong sm:grid-cols-3">
        <EditorialStat
          detail="Gradski prosjek od 100. Populacijski ponderiran prosječni rezultat."
          value={String(base.cityWeightedScore)}
        />
        <EditorialStat
          detail={`Od ${data.districts.length} kvartova ima rezultat iznad 50 bodova (dobra povezanost).`}
          value={String(base.goodDistricts.length)}
        />
        <EditorialStat
          detail="Stanovnika živi u kvartovima s rezultatom manjim od 25 (jaz u dostupnosti)."
          value={`${base.totalPop > 0 ? Math.round((base.poorPop / base.totalPop) * 100) : 0}%`}
        />
        <EditorialStat
          detail={`Grada može se doseći iz najboljeg kvarta (${base.best.name}).`}
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
    (d) => d.trainLines.length > 0
  ).length
  if (districtsWithTrains === 0) {
    return null
  }
  return (
    <EditorialStat
      value={String(districtsWithTrains)}
      detail={`Od ${data.districts.length} kvartova imaju vlak, uz 0% doprinosa dosegu zbog rijetkih intervala.`}
    />
  )
}

function BajsEditorialStat({ bajs }: { bajs: BajsInsights }) {
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
    <section
      id="karta"
      className="mt-20 flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-14"
    >
      <div className="sm:w-[280px] sm:shrink-0">
        <StatOverline>Karta područja</StatOverline>
        <ChoroplethLegend />
      </div>
      <div className="w-full">
        <ZagrebBlockMap />
      </div>
    </section>
  )
}

function ChoroplethLegend() {
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-label text-ink-2 lowercase sm:flex-col sm:items-start">
      <span className="flex items-center gap-2">
        <span className="inline-block size-3 bg-navy" />
        Bolja povezanost
      </span>
      <span className="flex items-center gap-2">
        <span className="inline-block size-3 bg-blue-pale" />
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

export function AccessibilityGapSection({ base }: { base: BaseInsights }) {
  const goodPct =
    base.totalPop > 0 ? Math.round((base.goodPop / base.totalPop) * 100) : 0
  const poorPct =
    base.totalPop > 0 ? Math.round((base.poorPop / base.totalPop) * 100) : 0

  return (
    <section
      id="jaz"
      className="flex flex-col border-t border-hairline py-16 sm:py-24"
    >
      <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <StatModuleTitle className="text-ink">
            Jaz u dostupnosti
          </StatModuleTitle>
          <StatModuleLead>
            Samo <strong className="font-medium text-ink">{goodPct}%</strong>{" "}
            Zagrepčana ({base.goodPop.toLocaleString("hr-HR")} stan.) živi u
            kvartovima s rezultatom ≥50. Istovremeno,{" "}
            <strong className="font-medium text-ink">{poorPct}%</strong> (
            {base.poorPop.toLocaleString("hr-HR")} stan.) živi u kvartovima gdje
            je rezultat ispod 25 - to uključuje{" "}
            <span className="text-ink-2">
              {base.poorDistricts.map((d) => d.name).join(", ")}
            </span>
            .
          </StatModuleLead>
        </div>
      </div>
      <div className="mt-2">
        <div className="flex h-6 w-full overflow-hidden bg-track">
          <div className="bg-zg-blue" style={{ width: `${goodPct}%` }} />
          <div className="bg-ink-2" style={{ width: `${poorPct}%` }} />
        </div>
        <div className="mt-3 flex justify-between text-body text-ink-muted">
          <span>Dobra povezanost (&ge;50): {goodPct}%</span>
          <span>Lo&#353;a povezanost (&lt;25): {poorPct}%</span>
        </div>
      </div>
    </section>
  )
}
