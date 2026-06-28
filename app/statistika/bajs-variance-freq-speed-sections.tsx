import type { District as DistrictScore, DistrictScoresOutput as ScoreData } from "@/lib/generated"
import type { computeBajsInsights, computeVarianceInsights, computeFrequencyInsights, computeLineSpeedInsights } from "./stat-data"
import { fmtHR, TRAM_SPEED_KMH, BUS_SPEED_KMH, TRAIN_SPEED_KMH } from "./stat-data"
import { ZagrebBajsBlockMap } from "@/components/zagreb-block-map"
import { RankingList } from "./stat-shared"
import { StatModuleTitle } from "./stat-typography"
import { CollapsibleContent } from "./stat-expandable"

type BajsInsights = ReturnType<typeof computeBajsInsights>
type VarianceInsightsData = ReturnType<typeof computeVarianceInsights>
type FreqInsights = ReturnType<typeof computeFrequencyInsights>
type LineSpeedInsights = ReturnType<typeof computeLineSpeedInsights>

export function BajsImpactSection({
  data,
  bajs,
}: {
  data: ScoreData
  bajs: BajsInsights
}) {
  if (!bajs.hasBajs) return null
  return (
    <section
      id="bajs"
      className="flex flex-col border-t border-slate-100 py-16 sm:py-24 dark:border-white/10"
    >
      <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <BajsHeader />
      </div>
      <BajsMapSection districts={data.districts} />
      <div className="mt-12 flex flex-col gap-12">
        <div className="w-full">
          <BajsRanking bajs={bajs} />
        </div>
        <div className="w-full">
          <BajsAnalysis data={data} bajs={bajs} />
        </div>
      </div>
      <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <BajsCoverageCard bajs={bajs} />
        <BajsDensityCard bajs={bajs} />
      </div>
    </section>
  )
}

function BajsHeader() {
  return (
    <div>
      <StatModuleTitle>Utjecaj BAJS bicikala</StatModuleTitle>
      <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
        Koliko se dostupnost svakog kvarta poboljšava kada se uz javni prijevoz
        koriste i BAJS bicikli. Mjereno u idealnom scenariju gdje je svaka
        stanica operativna s barem jednim biciklom.
      </p>
    </div>
  )
}

function BajsMapSection({
  districts,
}: {
  districts: ScoreData["districts"]
}) {
  return (
    <div className="mt-12">
      <div className="mb-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[15px] text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-[#d97706]" />
          Tamnije = veći dobitak
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-[#94a3b8]" />
          Sivo = bez utjecaja
        </span>
      </div>
      <div className="mx-auto w-full max-w-3xl rounded-[12px] bg-[#f9f9f9] p-4 sm:p-8 dark:bg-[#1a1a1a]">
        <ZagrebBajsBlockMap districts={districts} />
      </div>
    </div>
  )
}

function BajsRanking({
  bajs,
}: {
  bajs: BajsInsights
}) {
  return (
    <div>
      <h3 className="mb-6 font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
        Tko najviše profitira
      </h3>
      <RankingList
        items={bajs.bajsRankedByBoost}
        value={(d) => d.bajsBoostPct ?? 0}
        label={(d) => `+${d.bajsBoostPct}%`}
        trailing={(d) => `${d.bajsStations} st.`}
        color={{
          text: "text-amber-700 dark:text-amber-400",
          bg: "bg-amber-100 dark:bg-amber-900/30",
          bar: "bg-amber-500",
        }}
      />
    </div>
  )
}

function BajsAnalysis({
  data,
  bajs,
}: {
  data: ScoreData
  bajs: BajsInsights
}) {
  return (
    <div className="flex flex-col gap-6">
      <BajsEquityCard data={data} />
      <BajsTotalImpactCard bajs={bajs} />
    </div>
  )
}

function BajsEquityCard({ data }: { data: ScoreData }) {
  return (
    <div className="flex flex-col rounded-xl bg-amber-50/60 p-6 ring-1 ring-amber-200/40 dark:bg-amber-950/15 dark:ring-amber-800/20">
      <h3 className="mb-4 font-sans text-[13px] font-bold tracking-widest text-amber-700 uppercase">
        Smanjuje li BAJS jaz?
      </h3>
      <div className="space-y-4 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
        <p>
          <BajsEquityText data={data} />
        </p>
      </div>
    </div>
  )
}

function BajsEquityText({ data }: { data: ScoreData }) {
  const topHalf = data.districts.slice(0, Math.floor(data.districts.length / 2))
  const bottomHalf = data.districts.slice(Math.floor(data.districts.length / 2))
  const topBoost =
    topHalf.reduce((s, d) => s + (d.bajsBoostPct ?? 0), 0) / topHalf.length
  const bottomBoost =
    bottomHalf.reduce((s, d) => s + (d.bajsBoostPct ?? 0), 0) /
    bottomHalf.length
  const narrows = bottomBoost > topBoost
  if (narrows) {
    return (
      <>
        Da. Slabije povezani kvartovi prosječno dobivaju{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">
          +{Math.round(bottomBoost)}%
        </strong>{" "}
        poboljšanja, dok bolje povezani dobivaju{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">
          +{Math.round(topBoost)}%
        </strong>
        . BAJS bicikli sužavaju jaz u dostupnosti.
      </>
    )
  }
  return (
    <>
      Ne u dovoljnoj mjeri. Bolje povezani kvartovi dobivaju{" "}
      <strong className="font-medium text-slate-900 dark:text-slate-100">
        +{Math.round(topBoost)}%
      </strong>{" "}
      poboljšanja, dok slabije povezani dobivaju{" "}
      <strong className="font-medium text-slate-900 dark:text-slate-100">
        +{Math.round(bottomBoost)}%
      </strong>
      . BAJS stanice su koncentrirane u centru - proširenje mreže prema rubnim
      kvartovima moglo bi smanjiti nejednakost. Kvartovi bez vlastitih stanica
      mogu ipak imati mali dobitak jer stanovnici na rubu mogu doseći stanice u
      susjednom kvartu.
    </>
  )
}

function BajsTotalImpactCard({
  bajs,
}: {
  bajs: BajsInsights
}) {
  return (
    <div className="mt-6 flex flex-col border-t-2 border-amber-400 pt-6 dark:border-amber-600">
      <h3 className="mb-4 font-sans text-[13px] font-bold tracking-widest text-amber-700 uppercase">
        Ukupni utjecaj
      </h3>
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
        <div className="flex flex-col">
          <div className="font-sans text-[36px] leading-none tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
            +{bajs.cityBajsBoost}%
          </div>
          <div className="mt-2 text-[15px] text-slate-500 dark:text-slate-400">
            prosječni dobitak
          </div>
        </div>
        <div className="flex flex-col">
          <div className="font-sans text-[36px] leading-none tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
            {bajs.bajsTotalStations}
          </div>
          <div className="mt-2 text-[15px] text-slate-500 dark:text-slate-400">
            stanica u gradu
          </div>
        </div>
        <div className="flex flex-col">
          <div className="font-sans text-[36px] leading-none tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
            {bajs.topBajsBeneficiary
              ? `+${bajs.topBajsBeneficiary.bajsBoostPct}%`
              : "-"}
          </div>
          <div className="mt-2 text-[15px] text-slate-500 dark:text-slate-400">
            max. dobitak
            <br />({bajs.topBajsBeneficiary?.name ?? "-"})
          </div>
        </div>
      </div>
    </div>
  )
}

function BajsCoverageStats({
  bajs,
}: {
  bajs: BajsInsights
}) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-8 sm:grid-cols-3">
      <div className="flex flex-col">
        <div className="font-sans text-[36px] leading-none tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
          {bajs.coveragePct}%
        </div>
        <div className="mt-2 text-[15px] text-slate-500 dark:text-slate-400">
          stanica pokriveno
        </div>
      </div>
      <div className="flex flex-col">
        <div className="font-sans text-[36px] leading-none tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
          {bajs.coveredStops}
        </div>
        <div className="mt-2 text-[15px] text-slate-500 dark:text-slate-400">
          od {bajs.totalStops} stanica
        </div>
      </div>
      <div className="flex flex-col">
        <div className="font-sans text-[36px] leading-none tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
          350m
        </div>
        <div className="mt-2 text-[15px] text-slate-500 dark:text-slate-400">
          pješački doseg
        </div>
      </div>
    </div>
  )
}

function BajsCoverageCard({
  bajs,
}: {
  bajs: BajsInsights
}) {
  return (
    <div className="flex flex-col rounded-lg border border-amber-200/60 bg-gradient-to-br from-amber-50/40 to-transparent p-6 dark:border-amber-800/25 dark:from-amber-950/10">
      <h3 className="mb-4 font-sans text-[13px] font-bold tracking-widest text-amber-700 uppercase">
        Pokrivenost posljednje milje
      </h3>
      <BajsCoverageStats bajs={bajs} />
      <div className="space-y-4 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
        <p>
          Bike-sharing kao &ldquo;posljednja milja&rdquo; funkcionira samo ako
          postoji BAJS stanica blizu tramvajske ili autobusne stanice. Od{" "}
          <strong className="font-medium text-slate-900 dark:text-slate-100">
            {bajs.totalStops}
          </strong>{" "}
          stanica javnog prijevoza u Zagrebu, samo{" "}
          <strong className="font-medium text-slate-900 dark:text-slate-100">
            {bajs.coveredStops} ({bajs.coveragePct}%)
          </strong>{" "}
          ima BAJS stanicu unutar 350 metara hoda.
        </p>
        <p>
          {bajs.zeroBajsDistricts.length > 0 ? (
            <>
              <strong className="font-medium text-slate-900 dark:text-slate-100">
                {bajs.zeroBajsDistricts.length}{" "}
                {bajs.zeroBajsDistricts.length === 1
                  ? "kvart nema"
                  : bajs.zeroBajsDistricts.length < 5
                    ? "kvarta nemaju"
                    : "kvartova nema"}
              </strong>{" "}
              nijednu BAJS stanicu:{" "}
              {bajs.zeroBajsDistricts.map((d) => d.name).join(", ")}. Za
              stanovnike tih kvartova, kombinacija bicikla i javnog prijevoza
              jednostavno ne postoji.
            </>
          ) : (
            <>
              Svaki kvart ima barem jednu BAJS stanicu, ali gustoća varira
              drastično.
            </>
          )}
        </p>
      </div>
    </div>
  )
}

function BajsDensityCard({
  bajs,
}: {
  bajs: BajsInsights
}) {
  const lastDistrict = bajs.densityRanked[bajs.densityRanked.length - 1]
  return (
    <div className="flex flex-col rounded-lg bg-white/60 p-6 shadow-sm shadow-amber-900/5 ring-1 ring-slate-200/60 dark:bg-white/[0.03] dark:shadow-none dark:ring-white/10">
      <h3 className="mb-2 font-sans text-[13px] font-bold tracking-widest text-amber-700 uppercase">
        Gustoća BAJS stanica
      </h3>
      <p className="mb-6 text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
        Stanica po km² - koliko je infrastruktura ravnomjerno raspoređena
      </p>
      <RankingList
        items={bajs.densityRanked}
        value={(d) => d.bajsDensityPerKm2 ?? 0}
        label={(d) => `${fmtHR(d.bajsDensityPerKm2 ?? 0, 2)} st./km²`}
        trailing={(d) => `${fmtHR(d.bajsPer10k ?? 0, 1)}/10k st.`}
        color={{
          text: "text-amber-600 dark:text-amber-400",
          bg: "bg-amber-100 dark:bg-amber-900/30",
          bar: "bg-amber-500",
        }}
      />
      {bajs.topDensity && lastDistrict && (
        <div className="mt-6 rounded-md bg-amber-50/50 px-4 py-3 dark:bg-amber-950/10">
          <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
            <strong className="font-medium text-slate-900 dark:text-slate-100">
              {bajs.topDensity.name}
            </strong>{" "}
            ima {fmtHR(bajs.topDensity.bajsDensityPerKm2 ?? 0, 2)} stanica/km²,
            dok {lastDistrict.name} ima samo{" "}
            {fmtHR(lastDistrict.bajsDensityPerKm2 ?? 0, 2)}. Razlika u gustoći
            od{" "}
            <strong className="font-medium text-slate-900 dark:text-slate-100">
              {Math.round(
                (bajs.topDensity.bajsDensityPerKm2 ?? 1) /
                  (lastDistrict.bajsDensityPerKm2 || 0.01)
              )}
              ×
            </strong>{" "}
            znači da kvaliteta bike-sharing usluge ovisi prije svega o tome gdje
            živite.
          </p>
        </div>
      )}
    </div>
  )
}

export function VarianceSection({
  data,
  variance,
}: {
  data: ScoreData
  variance: VarianceInsightsData
}) {
  if (!variance.hasVarianceData || variance.varianceRanked.length === 0)
    return null
  return (
    <section
      id="varijacija"
      className="mt-16 flex flex-col border-t border-slate-100 py-16 sm:mt-20 sm:py-24 dark:border-white/10"
    >
      <VarianceHeader />
      <CollapsibleContent expandLabel="Prikaži varijacije" collapseLabel="Suzi prikaz">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_280px]">
          <VarianceRanking data={data} variance={variance} />
          <VarianceInterpretation variance={variance} />
        </div>
      </CollapsibleContent>
    </section>
  )
}

function VarianceHeader() {
  return (
    <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <StatModuleTitle>Nejednakost unutar kvarta</StatModuleTitle>
        <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
          Neki kvartovi imaju odlične dijelove i prometne pustinje unutar istog
          područja. Standardna devijacija mjeri koliko se rezultati razlikuju
          unutar jednog kvarta.
        </p>
      </div>
    </div>
  )
}

function VarianceRanking({
  data,
  variance,
}: {
  data: ScoreData
  variance: VarianceInsightsData
}) {
  return (
    <div className="min-w-0 flex flex-col">
      <div className="mb-6 font-sans text-[13px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
        Najveća varijacija u dostupnosti
      </div>
      <div className="space-y-3 overflow-hidden">
        {variance.varianceRanked.slice(0, 8).map((d, i) => (
          <VarianceRow
            key={d.osmId}
            d={d}
            i={i}
            totalGridCells={data.totalGridCells}
          />
        ))}
      </div>
    </div>
  )
}

function VarianceRow({
  d,
  i,
  totalGridCells,
}: {
  d: DistrictScore
  i: number
  totalGridCells: number
}) {
  const minPct = ((d.minReachableCells ?? 0) / totalGridCells) * 100
  const maxPct = ((d.maxReachableCells ?? 0) / totalGridCells) * 100
  return (
    <div className="flex flex-col border-b border-slate-100 py-3 last:border-0 dark:border-white/5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] font-bold text-slate-400 dark:text-slate-500">
            {(i + 1).toString().padStart(2, "0")}
          </span>
          <span className="text-[15px] font-medium text-slate-700 dark:text-slate-300">
            {d.name}
          </span>
        </div>
        <span className="shrink-0 font-sans text-[15px] font-medium tracking-tight text-sky-600 tabular-nums dark:text-sky-400">
          σ {Math.round(d.stddevReachableCells ?? 0)}
        </span>
      </div>
      <div className="ml-7">
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
          <div
            className="absolute inset-y-0 rounded-full bg-sky-500"
            style={{
              left: `${minPct}%`,
              width: `${Math.max(maxPct - minPct, 1)}%`,
            }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[13px] text-slate-500 tabular-nums dark:text-slate-400">
          <span>Min: {Math.round(d.minReachableCells ?? 0)}</span>
          <span>Max: {Math.round(d.maxReachableCells ?? 0)}</span>
        </div>
      </div>
    </div>
  )
}

function VarianceInterpretation({
  variance,
}: {
  variance: VarianceInsightsData
}) {
  const mostUnequal = variance.varianceRanked[0]
  const mostEqual = variance.varianceRanked[variance.varianceRanked.length - 1]

  if (!mostUnequal || !mostEqual) return null

  return (
    <div className="flex flex-col gap-6">
      <VarianceStatCards variance={variance} />
      <div className="mt-4 flex flex-col border-l-2 border-sky-500 py-2 pl-6">
        <h3 className="mb-4 font-sans text-[13px] font-bold tracking-widest text-sky-700 uppercase">
          Grad ekstrema ({mostUnequal.name})
        </h3>
        <div className="space-y-4 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
          <p>
            Najnejednakiji kvart je{" "}
            <strong className="font-medium text-slate-900 dark:text-slate-100">
              {mostUnequal.name}
            </strong>{" "}
            - neki stanovnici imaju odličnu povezanost javnim prijevozom, dok
            susjedi 500 metara uzbrdo nemaju gotovo ništa.
          </p>
          <p>
            Ovakav nesrazmjer obično znači da jedan dio kvarta ima odličan
            pristup tramvajskoj ili željezničkoj pruzi, dok drugi dio ovisi o
            rijetkim autobusnim linijama ili je izoliran.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col border-l-2 border-slate-300 py-2 pl-6">
        <h3 className="mb-4 font-sans text-[13px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
          Ujednačena dostupnost ({mostEqual.name})
        </h3>
        <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
          Nasuprot tome, <strong>{mostEqual.name}</strong> ima najmanju
          varijaciju (σ {Math.round(mostEqual.stddevReachableCells ?? 0)}).
          Rezultati se kreću u uskom rasponu od{" "}
          {Math.round(mostEqual.minReachableCells ?? 0)} do{" "}
          {Math.round(mostEqual.maxReachableCells ?? 0)}. Ovo ukazuje na
          ravnomjernu raspodjelu infrastrukture kroz cijeli kvart, gdje god se
          nalazili.
        </p>
      </div>
    </div>
  )
}

function VarianceStatCards({
  variance,
}: {
  variance: VarianceInsightsData
}) {
  const d = variance.varianceRanked[0]
  const rangeVal = d
    ? (d.maxReachableCells ?? 0) - (d.minReachableCells ?? 0)
    : 0
  return (
    <div className="mb-4 grid grid-cols-1 gap-8 sm:grid-cols-2">
      <div className="flex flex-col">
        <div className="font-sans text-[36px] leading-none tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
          σ {Math.round(variance.varianceRanked[0]?.stddevReachableCells ?? 0)}
        </div>
        <div className="mt-2 text-[15px] text-slate-500 dark:text-slate-400">
          najveća std. devijacija
          <br />({variance.varianceRanked[0]?.name})
        </div>
      </div>
      <div className="flex flex-col">
        <div className="font-sans text-[36px] leading-none tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
          {d ? rangeVal.toLocaleString("hr-HR") : "-"}
        </div>
        <div className="mt-2 text-[15px] text-slate-500 dark:text-slate-400">
          max raspon ćelija
          <br />
          (min → max unutar kvarta)
        </div>
      </div>
    </div>
  )
}

export function FrequencySection({
  freq,
}: {
  freq: FreqInsights
}) {
  if (freq.freqRanked.length === 0) return null
  return (
    <section
      id="frekvencija"
      className="mt-16 flex flex-col border-t border-slate-100 py-16 sm:mt-20 sm:py-24 dark:border-white/10"
    >
      <FrequencyHeader freq={freq} />
      <CollapsibleContent expandLabel="Prikaži frekvenciju" collapseLabel="Suzi prikaz">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_340px]">
          <FrequencyChart freq={freq} />
          <FrequencyInterpretation freq={freq} />
        </div>
      </CollapsibleContent>
    </section>
  )
}

function FrequencyHeader({ freq }: { freq: FreqInsights }) {
  const minHw = Math.round(freq.freqRanked[0]?.medianHeadwayMin ?? 0)
  const maxHw = Math.round(freq.maxHeadway)
  return (
    <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <StatModuleTitle>Frekvencija prijevoza</StatModuleTitle>
        <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
          Medijan intervala dolaska vozila po kvartu, radnim danom. Raspon ide od
          ~{minHw} min u najpovezanijim kvartovima do ~{maxHw} min u rubnima koji
          ovise o rjeđim autobusnim linijama.
        </p>
      </div>
    </div>
  )
}

function FrequencyChart({
  freq,
}: {
  freq: FreqInsights
}) {
  return (
    <div className="min-w-0 flex flex-col">
      <div className="mb-6 font-sans text-[13px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
        Interval po kvartu (minuta)
      </div>
      <div className="space-y-2 overflow-hidden">
        {freq.freqRanked.map((d, i) => (
          <FrequencyBar
            key={d.osmId}
            d={d}
            i={i}
            maxHeadway={freq.maxHeadway}
          />
        ))}
      </div>
    </div>
  )
}

function FrequencyBar({
  d,
  i,
  maxHeadway,
}: {
  d: DistrictScore
  i: number
  maxHeadway: number
}) {
  const headway = d.medianHeadwayMin
  const barPct = maxHeadway > 0 ? (headway / maxHeadway) * 100 : 0
  const barColor =
    headway <= 10
      ? "bg-emerald-500"
      : headway <= 15
        ? "bg-cyan-500"
        : headway <= 25
          ? "bg-blue-500"
          : "bg-indigo-500"
  return (
    <div className="flex flex-col border-b border-slate-100 py-3 last:border-0 dark:border-white/5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] font-bold text-slate-400 dark:text-slate-500">
            {(i + 1).toString().padStart(2, "0")}
          </span>
          <span className="text-[15px] font-medium text-slate-700 dark:text-slate-300">
            {d.name}
          </span>
        </div>
        <span className="shrink-0 font-sans text-[15px] font-medium tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
          ~{fmtHR(headway, 1)} min
        </span>
      </div>
      <div className="ml-7">
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
          <div
            className={`absolute inset-y-0 left-0 rounded-full ${barColor}`}
            style={{ width: `${barPct}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function FrequencyInterpretation({
  freq,
}: {
  freq: FreqInsights
}) {
  return (
    <div className="min-w-0 flex flex-col gap-6">
      <FrequencyStatCards freq={freq} />
      <div className="mt-4 flex flex-col border-l-2 border-blue-500 py-2 pl-6">
        <h3 className="mb-4 font-sans text-[13px] font-bold tracking-widest text-blue-700 uppercase">
          Jaz u frekvenciji
        </h3>
        <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
          Najpovezaniji kvart ima medijan razmaka od{" "}
          <strong className="font-medium text-slate-900 dark:text-slate-100">
            ~{Math.round(freq.freqRanked[0]?.medianHeadwayMin ?? 0)} min
          </strong>
          , a najrjeđi ~{Math.round(freq.maxHeadway)} min. Rubni kvartovi ovise o
          rijetkim autobusnim linijama — to čekanje značajno umanjuje praktičnu
          dostupnost.
        </p>
      </div>
      <div className="mt-4 border-l-2 border-slate-300 py-2 pl-6">
        <p className="text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
          Noćne tramvajske linije (31-34) održavaju promet do ~05:30, dajući
          kvartovima s tramvajem praktično 24-satnu pokrivenost.
        </p>
      </div>
    </div>
  )
}

function FrequencyStatCards({
  freq,
}: {
  freq: FreqInsights
}) {
  return (
    <div className="mb-4 grid grid-cols-1 gap-8 sm:grid-cols-2">
      <div className="flex flex-col">
        <div className="font-sans text-[28px] leading-none tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
          {freq.totalLines}
        </div>
        <div className="mt-2 text-[15px] text-slate-500 dark:text-slate-400">
          linija opslužuje Zagreb
        </div>
      </div>
      <div className="min-w-0 flex flex-col">
        <div className="font-sans text-[28px] leading-none tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
          {freq.allTramLines.size} tram + {freq.allBusLines.size} bus
        </div>
        <div className="mt-2 text-[15px] text-slate-500 dark:text-slate-400">
          tramvajskih i autobusnih
        </div>
      </div>
    </div>
  )
}

export function LineSpeedSection({
  lineSpeed,
}: {
  lineSpeed: LineSpeedInsights
}) {
  return (
    <section
      id="brzina"
      className="flex flex-col border-t border-slate-100 py-16 sm:py-24 dark:border-white/10"
    >
      <LineSpeedHeader />
      <div className="flex flex-col items-start gap-12 lg:flex-row lg:gap-16">
        <div className="w-full shrink-0 lg:w-[360px]">
          <LineSpeedCards lineSpeed={lineSpeed} />
        </div>
        <div className="flex-1">
          <LineSpeedInterpretation />
        </div>
      </div>
    </section>
  )
}

function LineSpeedHeader() {
  return (
    <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <StatModuleTitle>Brzina linija</StatModuleTitle>
        <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
          Komercijalna brzina prometnih sredstava - koliko brzo se vozilo kreće
          uključujući zaustavljanja na stanicama. Brži mod znači veći doseg u
          istih 30 minuta.
        </p>
      </div>
    </div>
  )
}

function LineSpeedCards({
  lineSpeed,
}: {
  lineSpeed: LineSpeedInsights
}) {
  return (
    <div>
      <h3 className="mb-6 font-sans text-[13px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
        Komercijalna brzina po modu
      </h3>
      <div className="flex flex-col gap-4">
        <SpeedModeRow
          icon="tram"
          label="Tramvaj"
          speed={TRAM_SPEED_KMH}
          color="rose"
          note={`${lineSpeed.tramLineCount} linija, prosj. ${lineSpeed.avgTramCoverage} ${lineSpeed.avgTramCoverage === 1 ? "kvart" : lineSpeed.avgTramCoverage < 5 ? "kvarta" : "kvartova"} po liniji`}
          pct={(TRAM_SPEED_KMH / TRAIN_SPEED_KMH) * 100}
        />
        <SpeedModeRow
          icon="bus"
          label="Autobus"
          speed={BUS_SPEED_KMH}
          color="blue"
          note={`${lineSpeed.busLineCount} linija, prosj. ${lineSpeed.avgBusCoverage} ${lineSpeed.avgBusCoverage === 1 ? "kvart" : lineSpeed.avgBusCoverage < 5 ? "kvarta" : "kvartova"} po liniji`}
          pct={(BUS_SPEED_KMH / TRAIN_SPEED_KMH) * 100}
        />
        {lineSpeed.trainLineCount > 0 && (
          <SpeedModeRow
            icon="train"
            label="HŽ vlak"
            speed={TRAIN_SPEED_KMH}
            color="teal"
            note={`${lineSpeed.trainLineCount} linija - ali doprinos dosegu 0% zbog rijetkog intervala`}
            pct={100}
          />
        )}
        <SpeedWalkBajs />
      </div>
    </div>
  )
}

const speedModeIconPaths: Record<string, React.ReactNode> = {
  tram: (
    <>
      <rect x="4" y="3" width="16" height="14" rx="2" />
      <path d="M12 3v14" />
      <path d="M4 10h16" />
      <path d="M7 21l2-4" />
      <path d="M17 21l-2-4" />
    </>
  ),
  bus: (
    <>
      <path d="M8 6v6" />
      <path d="M15 6v6" />
      <path d="M2 12h19.6" />
      <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3" />
      <circle cx="7" cy="18" r="2" />
      <path d="M9 18h5" />
      <circle cx="16" cy="18" r="2" />
    </>
  ),
  train: (
    <>
      <rect x="4" y="3" width="16" height="14" rx="2" />
      <path d="M4 11h16" />
      <path d="M12 3v8" />
      <circle cx="8" cy="20" r="1" />
      <circle cx="16" cy="20" r="1" />
    </>
  ),
}

const speedModeColorMap: Record<
  string,
  { icon: string; text: string; bg: string; bar: string }
> = {
  rose: {
    icon: "text-rose-600 dark:text-rose-400",
    text: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-900/20",
    bar: "bg-rose-100 dark:bg-rose-900/30",
  },
  blue: {
    icon: "text-blue-600 dark:text-blue-400",
    text: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20",
    bar: "bg-blue-100 dark:bg-blue-900/30",
  },
  teal: {
    icon: "text-teal-600 dark:text-teal-400",
    text: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-50 dark:bg-teal-900/20",
    bar: "bg-teal-100 dark:bg-teal-900/30",
  },
}

const speedModeBarColor: Record<string, string> = {
  rose: "bg-rose-500",
  blue: "bg-blue-500",
  teal: "bg-teal-500",
}

function SpeedModeIcon({ icon, className }: { icon: string; className: string }) {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {speedModeIconPaths[icon]}
    </svg>
  )
}

function SpeedModeRow({
  icon,
  label,
  speed,
  color,
  note,
  pct: barPct,
}: {
  icon: string
  label: string
  speed: number
  color: string
  note: string
  pct: number
}) {
  const c = speedModeColorMap[color]!
  const barColorFull = speedModeBarColor[color] ?? "bg-teal-500"
  return (
    <div className="flex items-center gap-4">
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${c.bg}`}
      >
        <SpeedModeIcon icon={icon} className={c.icon} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[15px] font-medium text-slate-900 dark:text-slate-100">
            {label}
          </span>
          <span
            className={`font-sans text-[18px] font-medium tracking-tight tabular-nums ${c.text}`}
          >
            {speed} km/h
          </span>
        </div>
        <div
          className={`relative h-2.5 w-full overflow-hidden rounded-full ${c.bar}`}
        >
          <div
            className={`absolute inset-y-0 left-0 rounded-full ${barColorFull}`}
            style={{ width: `${barPct}%` }}
          />
        </div>
        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          {note}
        </div>
      </div>
    </div>
  )
}

function SpeedWalkBajs() {
  return (
    <div className="mt-2 border-t border-black/5 pt-4 dark:border-white/5">
      <div className="flex items-center justify-between text-[13px] text-slate-500 dark:text-slate-400">
        <span>Hodanje</span>
        <span className="font-sans tracking-tight tabular-nums">5 km/h</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-[13px] text-slate-500 dark:text-slate-400">
        <span>BAJS bicikl</span>
        <span className="font-sans tracking-tight tabular-nums">14 km/h</span>
      </div>
    </div>
  )
}

function LineSpeedInterpretation() {
  return (
    <div>
      <h3 className="font-sans text-[22px] tracking-tight text-orange-800 dark:text-orange-400">
        Brzina vs. frekvencija
      </h3>
      <div className="my-8 flex flex-col gap-8 border-y border-slate-100 py-6 sm:flex-row sm:gap-12 dark:border-white/10">
        <div className="flex flex-col border-l-2 border-orange-500 py-1 pl-4">
          <div className="font-sans text-[28px] leading-none tracking-tight text-orange-700 tabular-nums sm:text-[32px] dark:text-orange-400">
            {TRAM_SPEED_KMH}
          </div>
          <div className="mt-2 text-[15px] leading-snug text-slate-500 dark:text-slate-400">
            km/h tramvaj
            <br className="hidden sm:block" />
            (komercijalna brzina)
          </div>
        </div>
        <div className="flex flex-col border-l-2 border-slate-300 py-1 pl-4 dark:border-slate-700">
          <div className="font-sans text-[28px] leading-none tracking-tight text-slate-900 tabular-nums sm:text-[32px] dark:text-slate-100">
            {Math.round(TRAM_SPEED_KMH * 0.5)} km
          </div>
          <div className="mt-2 text-[15px] leading-snug text-slate-500 dark:text-slate-400">
            doseg tramvajem
            <br className="hidden sm:block" /> u 30 min
          </div>
        </div>
      </div>
      <LineSpeedInterpretationText />
    </div>
  )
}

function LineSpeedInterpretationText() {
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
      <p>
        Autobus je prosječno{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">
          {Math.round(
            ((BUS_SPEED_KMH - TRAM_SPEED_KMH) / TRAM_SPEED_KMH) * 100
          )}
          % brži
        </strong>{" "}
        od tramvaja (uključuje predgradske linije), ali tramvaj dominira u
        dosegu zahvaljujući{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">
          frekvenciji
        </strong>
        . Tramvajska linija dolazi svakih 7-10 minuta, a na koridorima s više
        linija u istom smjeru i češće. Autobus često vozi svakih 15-30 minuta.
      </p>
      <p>
        U 30-minutnom budžetu, putnik autobusom prosječno čeka{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">
          7-15 minuta
        </strong>{" "}
        na polazak - to je polovica budžeta izgubljena prije nego što se uopće
        počne kretati. Tramvajski putnik na frekventnoj stanici koristi 27-28 od
        30 minuta na stvarno putovanje.
      </p>
      <p>
        HŽ vlak je nominalno najbrži ({TRAIN_SPEED_KMH} km/h), ali s intervalom
        od 30-60 minuta{" "}
        <strong className="font-medium text-slate-900 dark:text-slate-100">
          cijeli budžet odlazi na čekanje
        </strong>
        . Brzina bez frekvencije ne donosi ništa.
      </p>
    </div>
  )
}
