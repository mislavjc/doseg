import type {
  District as DistrictScore,
  DistrictScoresOutput as ScoreData,
} from "@/lib/generated"
import type {
  computeBajsInsights,
  computeVarianceInsights,
  computeFrequencyInsights,
  computeLineSpeedInsights,
} from "./stat-data"
import { fmtHR } from "@/lib/format"
import { TRAM_SPEED_KMH, BUS_SPEED_KMH, TRAIN_SPEED_KMH } from "./stat-data"
import { ZagrebBajsBlockMap } from "@/components/zagreb-block-map"
import { RankingList } from "./stat-shared"
import { StatModuleTitle } from "./stat-typography"
import { CollapsibleContent } from "./stat-expandable"
import { plural } from "@/app/linije/copy"

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
  if (!bajs.hasBajs) {
    return null
  }
  return (
    <section
      id="bajs"
      className="flex flex-col border-t border-hairline py-16 sm:py-24"
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
      <p className="mt-4 max-w-xl text-body text-ink-2">
        Koliko se dostupnost svakog kvarta poboljšava kada se uz javni prijevoz
        koriste i BAJS bicikli. Mjereno u idealnom scenariju gdje je svaka
        stanica operativna s barem jednim biciklom.
      </p>
    </div>
  )
}

function BajsMapSection({ districts }: { districts: ScoreData["districts"] }) {
  return (
    <div className="mt-12">
      <div className="mb-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-body text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-ink-faint" />
          Tamnije = veći dobitak
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-ink-faint" />
          Sivo = bez utjecaja
        </span>
      </div>
      <div className="mx-auto w-full max-w-3xl bg-surface p-4 sm:p-8">
        <ZagrebBajsBlockMap districts={districts} />
      </div>
    </div>
  )
}

function BajsRanking({ bajs }: { bajs: BajsInsights }) {
  return (
    <div>
      <h3 className="mb-6 font-mono text-label font-bold text-ink-muted">
        Tko najviše profitira
      </h3>
      <RankingList
        items={bajs.bajsRankedByBoost}
        value={(d) => d.bajsBoostPct}
        label={(d) => `+${d.bajsBoostPct}%`}
        trailing={(d) => `${d.bajsStations} st.`}
        color={{
          text: "text-ink-muted",
          bg: "bg-surface",
          bar: "bg-ink-ghost",
        }}
      />
    </div>
  )
}

function BajsAnalysis({ data, bajs }: { data: ScoreData; bajs: BajsInsights }) {
  return (
    <div className="flex flex-col gap-6">
      <BajsEquityCard data={data} />
      <BajsTotalImpactCard bajs={bajs} />
    </div>
  )
}

function BajsEquityCard({ data }: { data: ScoreData }) {
  return (
    <div className="flex flex-col bg-surface p-6 ring-1 ring-hairline-strong">
      <h3 className="mb-4 font-mono text-label font-bold text-ink-muted">
        Smanjuje li BAJS jaz?
      </h3>
      <div className="space-y-4 text-body text-ink-2">
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
    topHalf.reduce((s, d) => s + d.bajsBoostPct, 0) / topHalf.length
  const bottomBoost =
    bottomHalf.reduce((s, d) => s + d.bajsBoostPct, 0) / bottomHalf.length
  const narrows = bottomBoost > topBoost
  if (narrows) {
    return (
      <>
        Da. Slabije povezani kvartovi prosječno dobivaju{" "}
        <strong className="font-medium text-ink">
          +{Math.round(bottomBoost)}%
        </strong>{" "}
        poboljšanja, dok bolje povezani dobivaju{" "}
        <strong className="font-medium text-ink">
          +{Math.round(topBoost)}%
        </strong>
        . BAJS bicikli sužavaju jaz u dostupnosti.
      </>
    )
  }
  return (
    <>
      Ne u dovoljnoj mjeri. Bolje povezani kvartovi dobivaju{" "}
      <strong className="font-medium text-ink">+{Math.round(topBoost)}%</strong>{" "}
      poboljšanja, dok slabije povezani dobivaju{" "}
      <strong className="font-medium text-ink">
        +{Math.round(bottomBoost)}%
      </strong>
      . BAJS stanice su koncentrirane u centru - proširenje mreže prema rubnim
      kvartovima moglo bi smanjiti nejednakost. Kvartovi bez vlastitih stanica
      mogu ipak imati mali dobitak jer stanovnici na rubu mogu doseći stanice u
      susjednom kvartu.
    </>
  )
}

function BajsTotalImpactCard({ bajs }: { bajs: BajsInsights }) {
  return (
    <div className="mt-6 flex flex-col border-t-2 border-ink-ghost pt-6">
      <h3 className="mb-4 font-mono text-label font-bold text-ink-muted">
        Ukupni utjecaj
      </h3>
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
        <div className="flex flex-col">
          <div className="font-sans text-head font-bold text-ink tabular-nums">
            +{bajs.cityBajsBoost}%
          </div>
          <div className="mt-2 text-body text-ink-muted">prosječni dobitak</div>
        </div>
        <div className="flex flex-col">
          <div className="font-sans text-head font-bold text-ink tabular-nums">
            {bajs.bajsTotalStations}
          </div>
          <div className="mt-2 text-body text-ink-muted">stanica u gradu</div>
        </div>
        <div className="flex flex-col">
          <div className="font-sans text-head font-bold text-ink tabular-nums">
            {bajs.topBajsBeneficiary === undefined
              ? "-"
              : `+${bajs.topBajsBeneficiary.bajsBoostPct}%`}
          </div>
          <div className="mt-2 text-body text-ink-muted">
            max. dobitak
            <br />({bajs.topBajsBeneficiary?.name ?? "-"})
          </div>
        </div>
      </div>
    </div>
  )
}

function BajsCoverageStats({ bajs }: { bajs: BajsInsights }) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-8 sm:grid-cols-3">
      <div className="flex flex-col">
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          {bajs.coveragePct}%
        </div>
        <div className="mt-2 text-body text-ink-muted">stanica pokriveno</div>
      </div>
      <div className="flex flex-col">
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          {bajs.coveredStops}
        </div>
        <div className="mt-2 text-body text-ink-muted">
          od {bajs.totalStops} stanica
        </div>
      </div>
      <div className="flex flex-col">
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          350m
        </div>
        <div className="mt-2 text-body text-ink-muted">pješački doseg</div>
      </div>
    </div>
  )
}

function BajsCoverageCard({ bajs }: { bajs: BajsInsights }) {
  return (
    <div className="flex flex-col border border-hairline-strong p-6">
      <h3 className="mb-4 font-mono text-label font-bold text-ink-muted">
        Pokrivenost posljednje milje
      </h3>
      <BajsCoverageStats bajs={bajs} />
      <div className="space-y-4 text-body text-ink-2">
        <p>
          Bike-sharing kao &ldquo;posljednja milja&rdquo; funkcionira samo ako
          postoji BAJS stanica blizu tramvajske ili autobusne stanice. Od{" "}
          <strong className="font-medium text-ink">{bajs.totalStops}</strong>{" "}
          stanica javnog prijevoza u Zagrebu, samo{" "}
          <strong className="font-medium text-ink">
            {bajs.coveredStops} ({bajs.coveragePct}%)
          </strong>{" "}
          ima BAJS stanicu unutar 350 metara hoda.
        </p>
        <p>
          {bajs.zeroBajsDistricts.length > 0 ? (
            <>
              <strong className="font-medium text-ink">
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

function BajsDensityCard({ bajs }: { bajs: BajsInsights }) {
  const lastDistrict = bajs.densityRanked.at(-1)
  return (
    <div className="flex flex-col bg-surface p-6 ring-1 ring-hairline-strong">
      <h3 className="mb-2 font-mono text-label font-bold text-ink-muted">
        Gustoća BAJS stanica
      </h3>
      <p className="mb-6 text-body text-ink-muted">
        Stanica po km² - koliko je infrastruktura ravnomjerno raspoređena
      </p>
      <RankingList
        items={bajs.densityRanked}
        value={(d) => d.bajsDensityPerKm2}
        label={(d) => `${fmtHR(d.bajsDensityPerKm2, 2)} st./km²`}
        trailing={(d) => `${fmtHR(d.bajsPer10k, 1)}/10k st.`}
        color={{
          text: "text-ink-muted",
          bg: "bg-surface",
          bar: "bg-ink-ghost",
        }}
      />
      {bajs.topDensity !== undefined && lastDistrict && (
        <div className="mt-6 bg-surface px-4 py-3">
          <p className="text-body text-ink-2">
            <strong className="font-medium text-ink">
              {bajs.topDensity.name}
            </strong>{" "}
            ima {fmtHR(bajs.topDensity.bajsDensityPerKm2, 2)} stanica/km², dok{" "}
            {lastDistrict.name} ima samo{" "}
            {fmtHR(lastDistrict.bajsDensityPerKm2, 2)}. Razlika u gustoći od{" "}
            <strong className="font-medium text-ink">
              {Math.round(
                bajs.topDensity.bajsDensityPerKm2 /
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
  if (variance.varianceRanked.length === 0) {
    return null
  }
  return (
    <section
      id="varijacija"
      className="mt-16 flex flex-col border-t border-hairline py-16 sm:mt-20 sm:py-24"
    >
      <VarianceHeader />
      <CollapsibleContent
        expandLabel="Prikaži varijacije"
        collapseLabel="Suzi prikaz"
      >
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
        <p className="mt-4 max-w-xl text-body text-ink-2">
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
    <div className="flex min-w-0 flex-col">
      <div className="mb-6 font-mono text-label font-bold text-ink-muted">
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

function DistrictRow({
  i,
  name,
  value,
  children,
}: {
  i: number
  name: string
  value: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col border-b border-hairline py-3 last:border-0">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-label font-bold text-ink-faint">
            {(i + 1).toString().padStart(2, "0")}
          </span>
          <span className="text-body text-ink-2">{name}</span>
        </div>
        {value}
      </div>
      <div className="ml-7">{children}</div>
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
  const minPct = (d.minReachableCells / totalGridCells) * 100
  const maxPct = (d.maxReachableCells / totalGridCells) * 100
  return (
    <DistrictRow
      i={i}
      name={d.name}
      value={
        <span className="shrink-0 font-sans text-body text-zg-blue tabular-nums">
          σ {Math.round(d.stddevReachableCells)}
        </span>
      }
    >
      <div className="relative h-1.5 w-full overflow-hidden bg-track">
        <div
          className="absolute inset-y-0 bg-blue-pale"
          style={{
            left: `${minPct}%`,
            width: `${Math.max(maxPct - minPct, 1)}%`,
          }}
        />
      </div>
      <div className="mt-2 flex justify-between font-mono text-label text-ink-muted tabular-nums">
        <span>Min: {Math.round(d.minReachableCells)}</span>
        <span>Max: {Math.round(d.maxReachableCells)}</span>
      </div>
    </DistrictRow>
  )
}

function VarianceInterpretation({
  variance,
}: {
  variance: VarianceInsightsData
}) {
  const mostUnequal = variance.varianceRanked[0]
  const mostEqual = variance.varianceRanked.at(-1)

  if (mostUnequal === undefined || mostEqual === undefined) {
    return null
  }

  return (
    <div className="flex flex-col gap-6">
      <VarianceStatCards variance={variance} />
      <div className="mt-4 flex flex-col border-l-2 border-blue-pale py-2 pl-6">
        <h3 className="mb-4 font-mono text-label font-bold text-zg-blue">
          Grad ekstrema ({mostUnequal.name})
        </h3>
        <div className="space-y-4 text-body text-ink-2">
          <p>
            Najnejednakiji kvart je{" "}
            <strong className="font-medium text-ink">{mostUnequal.name}</strong>{" "}
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

      <div className="mt-6 flex flex-col border-l-2 border-hairline-strong py-2 pl-6">
        <h3 className="mb-4 font-mono text-label font-bold text-ink-muted">
          Ujednačena dostupnost ({mostEqual.name})
        </h3>
        <p className="text-body text-ink-2">
          Nasuprot tome, <strong>{mostEqual.name}</strong> ima najmanju
          varijaciju (σ {Math.round(mostEqual.stddevReachableCells)}). Rezultati
          se kreću u uskom rasponu od {Math.round(mostEqual.minReachableCells)}{" "}
          do {Math.round(mostEqual.maxReachableCells)}. Ovo ukazuje na
          ravnomjernu raspodjelu infrastrukture kroz cijeli kvart, gdje god se
          nalazili.
        </p>
      </div>
    </div>
  )
}

function VarianceStatCards({ variance }: { variance: VarianceInsightsData }) {
  const d = variance.varianceRanked[0]
  const rangeVal =
    d === undefined ? 0 : d.maxReachableCells - d.minReachableCells
  return (
    <div className="mb-4 grid grid-cols-1 gap-8 sm:grid-cols-2">
      <div className="flex flex-col">
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          σ {Math.round(variance.varianceRanked[0]?.stddevReachableCells ?? 0)}
        </div>
        <div className="mt-2 text-body text-ink-muted">
          najveća std. devijacija
          <br />({variance.varianceRanked[0]?.name})
        </div>
      </div>
      <div className="flex flex-col">
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          {d === undefined ? "-" : rangeVal.toLocaleString("hr-HR")}
        </div>
        <div className="mt-2 text-body text-ink-muted">
          max raspon ćelija
          <br />
          (min → max unutar kvarta)
        </div>
      </div>
    </div>
  )
}

export function FrequencySection({ freq }: { freq: FreqInsights }) {
  if (freq.freqRanked.length === 0) {
    return null
  }
  return (
    <section
      id="frekvencija"
      className="mt-16 flex flex-col border-t border-hairline py-16 sm:mt-20 sm:py-24"
    >
      <FrequencyHeader freq={freq} />
      <CollapsibleContent
        expandLabel="Prikaži frekvenciju"
        collapseLabel="Suzi prikaz"
      >
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
        <p className="mt-4 max-w-xl text-body text-ink-2">
          Medijan intervala dolaska vozila po kvartu, radnim danom. Raspon ide
          od ~{minHw} min u najpovezanijim kvartovima do ~{maxHw} min u rubnima
          koji ovise o rjeđim autobusnim linijama.
        </p>
      </div>
    </div>
  )
}

function FrequencyChart({ freq }: { freq: FreqInsights }) {
  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-6 font-mono text-label font-bold text-ink-muted">
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
      ? "bg-zg-blue"
      : headway <= 15
        ? "bg-blue-pale"
        : headway <= 25
          ? "bg-zg-blue"
          : "bg-zg-blue"
  return (
    <DistrictRow
      i={i}
      name={d.name}
      value={
        <span className="shrink-0 font-sans text-body text-ink tabular-nums">
          ~{fmtHR(headway, 1)} min
        </span>
      }
    >
      <div className="relative h-1.5 w-full overflow-hidden bg-track">
        <div
          className={`absolute inset-y-0 left-0 ${barColor}`}
          style={{ width: `${barPct}%` }}
        />
      </div>
    </DistrictRow>
  )
}

function FrequencyInterpretation({ freq }: { freq: FreqInsights }) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <FrequencyStatCards freq={freq} />
      <div className="mt-4 flex flex-col border-l-2 border-zg-blue py-2 pl-6">
        <h3 className="mb-4 font-mono text-label font-bold text-zg-blue">
          Jaz u frekvenciji
        </h3>
        <p className="text-body text-ink-2">
          Najpovezaniji kvart ima medijan razmaka od{" "}
          <strong className="font-medium text-ink">
            ~{Math.round(freq.freqRanked[0]?.medianHeadwayMin ?? 0)} min
          </strong>
          , a najrjeđi ~{Math.round(freq.maxHeadway)} min. Rubni kvartovi ovise
          o rijetkim autobusnim linijama - to čekanje značajno umanjuje
          praktičnu dostupnost.
        </p>
      </div>
      <div className="mt-4 border-l-2 border-hairline-strong py-2 pl-6">
        <p className="text-body text-ink-muted">
          Noćne tramvajske linije (31-34) održavaju promet do ~05:30, dajući
          kvartovima s tramvajem praktično 24-satnu pokrivenost.
        </p>
      </div>
    </div>
  )
}

function FrequencyStatCards({ freq }: { freq: FreqInsights }) {
  return (
    <div className="mb-4 grid grid-cols-1 gap-8 sm:grid-cols-2">
      <div className="flex flex-col">
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          {freq.totalLines}
        </div>
        <div className="mt-2 text-body text-ink-muted">
          linija opslužuje Zagreb
        </div>
      </div>
      <div className="flex min-w-0 flex-col">
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          {freq.allTramLines.size} tram + {freq.allBusLines.size} bus
        </div>
        <div className="mt-2 text-body text-ink-muted">
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
      className="flex flex-col border-t border-hairline py-16 sm:py-24"
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
        <p className="mt-4 max-w-xl text-body text-ink-2">
          Komercijalna brzina prometnih sredstava - koliko brzo se vozilo kreće
          uključujući zaustavljanja na stanicama. Brži mod znači veći doseg u
          istih 30 minuta.
        </p>
      </div>
    </div>
  )
}

function LineSpeedCards({ lineSpeed }: { lineSpeed: LineSpeedInsights }) {
  return (
    <div>
      <h3 className="mb-6 font-mono text-label font-bold text-ink-muted">
        Komercijalna brzina po modu
      </h3>
      <div className="flex flex-col gap-4">
        <SpeedModeRow
          icon="tram"
          label="Tramvaj"
          speed={TRAM_SPEED_KMH}
          color="rose"
          note={`${lineSpeed.tramLineCount} ${plural(lineSpeed.tramLineCount, "linija", "linije", "linija")}, prosj. ${lineSpeed.avgTramCoverage} ${plural(lineSpeed.avgTramCoverage, "kvart", "kvarta", "kvartova")} po liniji`}
          pct={(TRAM_SPEED_KMH / TRAIN_SPEED_KMH) * 100}
        />
        <SpeedModeRow
          icon="bus"
          label="Autobus"
          speed={BUS_SPEED_KMH}
          color="blue"
          note={`${lineSpeed.busLineCount} ${plural(lineSpeed.busLineCount, "linija", "linije", "linija")}, prosj. ${lineSpeed.avgBusCoverage} ${plural(lineSpeed.avgBusCoverage, "kvart", "kvarta", "kvartova")} po liniji`}
          pct={(BUS_SPEED_KMH / TRAIN_SPEED_KMH) * 100}
        />
        {lineSpeed.trainLineCount > 0 && (
          <SpeedModeRow
            icon="train"
            label="HŽ vlak"
            speed={TRAIN_SPEED_KMH}
            color="teal"
            note={`${lineSpeed.trainLineCount} ${plural(lineSpeed.trainLineCount, "linija", "linije", "linija")} - ali doprinos dosegu 0% zbog rijetkog intervala`}
            pct={100}
          />
        )}
        <SpeedWalkBajs />
      </div>
    </div>
  )
}

const speedModeIconPaths = {
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

const speedModeColorMap = {
  rose: {
    icon: "text-ink",
    text: "text-ink",
    bg: "bg-surface",
    bar: "bg-surface",
  },
  blue: {
    icon: "text-zg-blue",
    text: "text-zg-blue",
    bg: "bg-blue-wash",
    bar: "bg-chip-blue",
  },
  teal: {
    icon: "text-zg-blue",
    text: "text-zg-blue",
    bg: "bg-blue-wash",
    bar: "bg-blue-wash",
  },
}

const speedModeBarColor = {
  rose: "bg-ink-2",
  blue: "bg-zg-blue",
  teal: "bg-blue-pale",
}

function SpeedModeIcon({
  icon,
  className,
}: {
  icon: keyof typeof speedModeIconPaths
  className: string
}) {
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
  icon: keyof typeof speedModeIconPaths
  label: string
  speed: number
  color: keyof typeof speedModeColorMap
  note: string
  pct: number
}) {
  const c = speedModeColorMap[color]
  const barColorFull = speedModeBarColor[color]
  return (
    <div className="flex items-center gap-4">
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center ${c.bg}`}
      >
        <SpeedModeIcon icon={icon} className={c.icon} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-body text-ink">{label}</span>
          <span
            className={`font-sans text-head font-bold tabular-nums ${c.text}`}
          >
            {speed} km/h
          </span>
        </div>
        <div className={`relative h-2.5 w-full overflow-hidden ${c.bar}`}>
          <div
            className={`absolute inset-y-0 left-0 ${barColorFull}`}
            style={{ width: `${barPct}%` }}
          />
        </div>
        <div className="mt-1 font-mono text-label text-ink-muted">{note}</div>
      </div>
    </div>
  )
}

function SpeedWalkBajs() {
  return (
    <div className="mt-2 border-t border-black/5 pt-4">
      <div className="flex items-center justify-between text-body text-ink-muted">
        <span>Hodanje</span>
        <span className="font-sans tracking-tight tabular-nums">5 km/h</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-body text-ink-muted">
        <span>BAJS bicikl</span>
        <span className="font-sans tracking-tight tabular-nums">14 km/h</span>
      </div>
    </div>
  )
}

function LineSpeedInterpretation() {
  return (
    <div>
      <h3 className="font-sans text-head font-bold text-ink-2">
        Brzina vs. frekvencija
      </h3>
      <div className="my-8 flex flex-col gap-8 border-y border-hairline py-6 sm:flex-row sm:gap-12">
        <div className="flex flex-col border-l-2 border-ink-faint py-1 pl-4">
          <div className="font-sans text-head font-bold text-ink-2 tabular-nums">
            {TRAM_SPEED_KMH}
          </div>
          <div className="mt-2 text-body text-ink-muted">
            km/h tramvaj
            <br className="hidden sm:block" />
            (komercijalna brzina)
          </div>
        </div>
        <div className="flex flex-col border-l-2 border-hairline-strong py-1 pl-4">
          <div className="font-sans text-head font-bold text-ink tabular-nums">
            {Math.round(TRAM_SPEED_KMH * 0.5)} km
          </div>
          <div className="mt-2 text-body text-ink-muted">
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
    <div className="space-y-4 text-body text-ink-2">
      <p>
        Autobus je prosječno{" "}
        <strong className="font-medium text-ink">
          {Math.round(
            ((BUS_SPEED_KMH - TRAM_SPEED_KMH) / TRAM_SPEED_KMH) * 100
          )}
          % brži
        </strong>{" "}
        od tramvaja (uključuje predgradske linije), ali tramvaj dominira u
        dosegu zahvaljujući{" "}
        <strong className="font-medium text-ink">frekvenciji</strong>.
        Tramvajska linija dolazi svakih 7-10 minuta, a na koridorima s više
        linija u istom smjeru i češće. Autobus često vozi svakih 15-30 minuta.
      </p>
      <p>
        U 30-minutnom budžetu, putnik autobusom prosječno čeka{" "}
        <strong className="font-medium text-ink">7-15 minuta</strong> na polazak
        - to je polovica budžeta izgubljena prije nego što se uopće počne
        kretati. Tramvajski putnik na frekventnoj stanici koristi 27-28 od 30
        minuta na stvarno putovanje.
      </p>
      <p>
        HŽ vlak je nominalno najbrži ({TRAIN_SPEED_KMH} km/h), ali s intervalom
        od 30-60 minuta{" "}
        <strong className="font-medium text-ink">
          cijeli budžet odlazi na čekanje
        </strong>
        . Brzina bez frekvencije ne donosi ništa.
      </p>
    </div>
  )
}
