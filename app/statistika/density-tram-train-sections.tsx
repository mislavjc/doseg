import { scaleLinear, scaleSqrt } from "@visx/scale"
import { Group } from "@visx/group"
import { GridRows } from "@visx/grid"
import type {
  District as DistrictScore,
  DistrictScoresOutput as ScoreData,
} from "@/lib/generated"
import type {
  computeScatterData,
  computeFrequencyInsights,
  DensityDatum,
} from "./stat-data"
import { fmtHR } from "@/lib/format"
import { SectionIcon } from "./stat-shared"
import { CollapsibleContent } from "./stat-expandable"
import { StatModuleTitle } from "./stat-typography"
import { plural } from "@/app/linije/copy"

type ScatterData = ReturnType<typeof computeScatterData>
type FreqInsights = ReturnType<typeof computeFrequencyInsights>

export function DensityScatterSection({ scatter }: { scatter: ScatterData }) {
  const scatterMargin = { top: 20, right: 16, bottom: 50, left: 40 }
  const scatterW = 400
  const scatterH = 320
  const scatterInnerW = scatterW - scatterMargin.left - scatterMargin.right
  const scatterInnerH = scatterH - scatterMargin.top - scatterMargin.bottom
  const scatterCeilDensity =
    Math.ceil(scatter.maxDensity / 100) * 100 || scatter.maxDensity + 10
  const scatterXScale = scaleLinear<number>({
    domain: [0, scatterCeilDensity],
    range: [0, scatterInnerW],
  })
  const scatterYScale = scaleLinear<number>({
    domain: [0, 100],
    range: [scatterInnerH, 0],
  })
  const scatterMaxPop = Math.max(
    ...scatter.densityData.map((d) => d.population)
  )
  const scatterRScale = scaleSqrt<number>({
    domain: [0, scatterMaxPop],
    range: [4, 18],
  })

  return (
    <section
      id="gustoca"
      className="flex flex-col border-t border-hairline py-16 sm:py-24"
    >
      <DensitySectionHeader />
      <CollapsibleContent
        expandLabel="Prikaži gustoću i povezanost"
        collapseLabel="Suzi prikaz"
      >
        <div className="mt-12 flex flex-col items-start gap-12 lg:flex-row lg:gap-16">
          <div className="w-full shrink-0 lg:w-[400px]">
            <ScatterPlot
              scatter={scatter}
              scatterMargin={scatterMargin}
              scatterW={scatterW}
              scatterH={scatterH}
              scatterInnerW={scatterInnerW}
              scatterInnerH={scatterInnerH}
              scatterCeilDensity={scatterCeilDensity}
              scatterXScale={scatterXScale}
              scatterYScale={scatterYScale}
              scatterRScale={scatterRScale}
            />
            <ScatterLegend />
            <ScatterAccessibilityTable densityData={scatter.densityData} />
          </div>
          <div className="flex-1">
            <DensityInterpretation scatter={scatter} />
          </div>
        </div>
      </CollapsibleContent>
    </section>
  )
}

function DensitySectionHeader() {
  return (
    <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <StatModuleTitle>Gustoća vs. povezanost</StatModuleTitle>
        <p className="mt-4 max-w-xl text-body text-ink-2">
          Svaka točka je jedan gradski kvart. Idealno bi gušće naseljeni
          kvartovi trebali imati bolji javni prijevoz - ali to u Zagrebu često
          nije slučaj.
        </p>
      </div>
    </div>
  )
}

function ScatterPlot({
  scatter,
  scatterMargin,
  scatterW,
  scatterH,
  scatterInnerW,
  scatterInnerH,
  scatterCeilDensity,
  scatterXScale,
  scatterYScale,
  scatterRScale,
}: {
  scatter: ScatterData
  scatterMargin: { top: number; right: number; bottom: number; left: number }
  scatterW: number
  scatterH: number
  scatterInnerW: number
  scatterInnerH: number
  scatterCeilDensity: number
  scatterXScale: ReturnType<typeof scaleLinear<number>>
  scatterYScale: ReturnType<typeof scaleLinear<number>>
  scatterRScale: ReturnType<typeof scaleSqrt<number>>
}) {
  return (
    <svg
      viewBox={`0 0 ${scatterW} ${scatterH}`}
      className="w-full"
      role="img"
      aria-label="Raspršeni dijagram gustoće stanovništva i rezultata povezanosti po kvartovima"
    >
      <Group top={scatterMargin.top} left={scatterMargin.left}>
        <ScatterGrid
          scatterYScale={scatterYScale}
          scatterInnerW={scatterInnerW}
          scatterInnerH={scatterInnerH}
        />
        <ScatterAxes
          scatterXScale={scatterXScale}
          scatterYScale={scatterYScale}
          scatterInnerW={scatterInnerW}
          scatterInnerH={scatterInnerH}
          scatterCeilDensity={scatterCeilDensity}
        />
        <ScatterPoints
          densityData={scatter.densityData}
          scatterXScale={scatterXScale}
          scatterYScale={scatterYScale}
          scatterRScale={scatterRScale}
        />
        <ScatterLabels
          scatter={scatter}
          scatterXScale={scatterXScale}
          scatterYScale={scatterYScale}
          scatterRScale={scatterRScale}
        />
      </Group>
    </svg>
  )
}

function ScatterGrid({
  scatterYScale,
  scatterInnerW,
  scatterInnerH,
}: {
  scatterYScale: ReturnType<typeof scaleLinear<number>>
  scatterInnerW: number
  scatterInnerH: number
}) {
  return (
    <>
      <GridRows
        scale={scatterYScale}
        width={scatterInnerW}
        tickValues={[25, 50, 75]}
        stroke="var(--ink-faint)"
        strokeOpacity={0.15}
        strokeWidth={1}
        strokeDasharray="3,3"
      />
      {[0, 25, 50, 75, 100].map((v) => (
        <text
          key={v}
          x={-6}
          y={scatterYScale(v) + 1}
          textAnchor="end"
          dominantBaseline="middle"
          className="fill-ink-muted font-mono text-label"
        >
          {v}
        </text>
      ))}
      <line
        x1={0}
        y1={0}
        x2={0}
        y2={scatterInnerH}
        stroke="var(--ink-ghost)"
        strokeWidth={0.5}
      />
      <line
        x1={0}
        y1={scatterInnerH}
        x2={scatterInnerW}
        y2={scatterInnerH}
        stroke="var(--ink-ghost)"
        strokeWidth={0.5}
      />
    </>
  )
}

function ScatterAxes({
  scatterXScale,
  scatterInnerW,
  scatterInnerH,
  scatterCeilDensity,
}: {
  scatterXScale: ReturnType<typeof scaleLinear<number>>
  scatterYScale: ReturnType<typeof scaleLinear<number>>
  scatterInnerW: number
  scatterInnerH: number
  scatterCeilDensity: number
}) {
  return (
    <>
      {[0, Math.round(scatterCeilDensity / 2), scatterCeilDensity].map((v) => (
        <text
          key={v}
          x={scatterXScale(v)}
          y={scatterInnerH + 16}
          textAnchor="middle"
          className="fill-ink-muted font-mono text-label"
        >
          {v}
        </text>
      ))}
      <text
        x={scatterInnerW / 2}
        y={scatterInnerH + 32}
        textAnchor="middle"
        className="fill-ink-muted font-mono text-label"
      >
        Gustoća (stan. / uzorak)
      </text>
      <text
        x={-28}
        y={scatterInnerH / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        transform={`rotate(-90, -28, ${scatterInnerH / 2})`}
        className="fill-ink-muted font-mono text-label"
      >
        Rezultat
      </text>
    </>
  )
}

function ScatterPoints({
  densityData,
  scatterXScale,
  scatterYScale,
  scatterRScale,
}: {
  densityData: Array<DensityDatum>
  scatterXScale: ReturnType<typeof scaleLinear<number>>
  scatterYScale: ReturnType<typeof scaleLinear<number>>
  scatterRScale: ReturnType<typeof scaleSqrt<number>>
}) {
  return (
    <>
      {densityData.map((d) => {
        const cx = scatterXScale(d.density)
        const cy = scatterYScale(d.score)
        const r = scatterRScale(d.population)
        const title = `${d.name}: rezultat ${d.score}, gustoća ${Math.round(d.density)}, ${d.population} stan.`
        if (d.hasTram) {
          return (
            <circle
              key={d.name}
              cx={cx}
              cy={cy}
              r={r}
              fill="var(--zg-blue)"
              fillOpacity={0.6}
              stroke="var(--navy)"
              strokeWidth={0.5}
            >
              <title>{title}</title>
            </circle>
          )
        }
        const s = r * 1.2
        return (
          <polygon
            key={d.name}
            points={`${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`}
            fill="var(--ink-2)"
            fillOpacity={0.6}
            stroke="var(--ink-2)"
            strokeWidth={0.5}
          >
            <title>{title}</title>
          </polygon>
        )
      })}
    </>
  )
}

function ScatterLabels({
  scatter,
  scatterXScale,
  scatterYScale,
  scatterRScale,
}: {
  scatter: ScatterData
  scatterXScale: ReturnType<typeof scaleLinear<number>>
  scatterYScale: ReturnType<typeof scaleLinear<number>>
  scatterRScale: ReturnType<typeof scaleSqrt<number>>
}) {
  return (
    <>
      {scatter.scatterDonjiGrad && (
        <text
          x={
            scatterXScale(scatter.scatterDonjiGrad.density) -
            scatterRScale(scatter.scatterDonjiGrad.population) -
            3
          }
          y={scatterYScale(scatter.scatterDonjiGrad.score) + 1}
          textAnchor="end"
          dominantBaseline="middle"
          className="fill-ink font-mono text-label"
        >
          Donji grad
        </text>
      )}
      {scatter.scatterSesvete && (
        <text
          x={
            scatterXScale(scatter.scatterSesvete.density) +
            scatterRScale(scatter.scatterSesvete.population) +
            3
          }
          y={scatterYScale(scatter.scatterSesvete.score) + 1}
          textAnchor="start"
          dominantBaseline="middle"
          className="fill-ink font-mono text-label"
        >
          Sesvete
        </text>
      )}
      {scatter.scatterNovizg && (
        <text
          x={
            scatterXScale(scatter.scatterNovizg.density) +
            scatterRScale(scatter.scatterNovizg.population) +
            3
          }
          y={scatterYScale(scatter.scatterNovizg.score) + 1}
          textAnchor="start"
          dominantBaseline="middle"
          className="fill-ink font-mono text-label"
        >
          {scatter.scatterNovizg.name}
        </text>
      )}
    </>
  )
}

function ScatterLegend() {
  return (
    <div className="mt-3 flex items-center justify-center gap-6 text-body text-ink-muted">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-zg-blue opacity-70" />
        Ima tramvaj (krug)
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <polygon
            points="5,0 10,5 5,10 0,5"
            fill="var(--ink-2)"
            fillOpacity="0.7"
          />
        </svg>
        Bez tramvaja (romb)
      </span>
    </div>
  )
}

function ScatterAccessibilityTable({
  densityData,
}: {
  densityData: Array<DensityDatum>
}) {
  return (
    <div className="sr-only">
      <table>
        <caption>Gustoća vs. povezanost - podaci po kvartovima</caption>
        <thead>
          <tr>
            <th scope="col">Kvart</th>
            <th scope="col">Rezultat</th>
            <th scope="col">Gustoća (stan./uzorak)</th>
            <th scope="col">Populacija</th>
            <th scope="col">Tramvaj</th>
          </tr>
        </thead>
        <tbody>
          {densityData.map((d) => (
            <tr key={d.name}>
              <td>{d.name}</td>
              <td>{d.score}</td>
              <td>{Math.round(d.density)}</td>
              <td>{d.population.toLocaleString("hr-HR")}</td>
              <td>{d.hasTram ? "Da" : "Ne"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DensityInterpretation({ scatter }: { scatter: ScatterData }) {
  return (
    <div className="flex flex-col bg-surface p-6">
      <SectionIcon icon="venn" title="Što graf otkriva?" />
      <div className="space-y-4 text-body text-ink-2">
        <p>
          Kvartovi s tramvajem (plavi) grupiraju se iznad rezultata 30, dok
          kvartovi bez tramvaja (tamni) konzistentno zaostaju.
        </p>
        <DensitySesveteInsight scatter={scatter} />
        <DensityDonjiGradInsight scatter={scatter} />
      </div>
    </div>
  )
}

function DensitySesveteInsight({ scatter }: { scatter: ScatterData }) {
  return (
    <p>
      <strong className="font-medium text-ink">Sesvete</strong> s{" "}
      <strong className="font-medium text-ink">
        {(
          scatter.densityData.find((d) => d.name === "Sesvete")?.population ?? 0
        ).toLocaleString("hr-HR")}
      </strong>{" "}
      stanovnika i rezultatom{" "}
      {scatter.densityData.find((d) => d.name === "Sesvete")?.score ?? 15} je
      najveći primjer lošeg omjera gustoće i povezanosti u gradu.
    </p>
  )
}

function DensityDonjiGradInsight({ scatter }: { scatter: ScatterData }) {
  return (
    <p>
      <strong className="font-medium text-ink">Donji grad</strong> (rezultat
      100) ima samo{" "}
      <strong className="font-medium text-ink">
        {(scatter.scatterDonjiGrad?.population ?? 0).toLocaleString("hr-HR")}
      </strong>{" "}
      stanovnika ali najgušću mrežu -{" "}
      <strong className="font-medium text-ink">
        {scatter.scatterDonjiGrad?.tramLineCount ?? 0}
      </strong>{" "}
      tramvajskih linija na samo{" "}
      <strong className="font-medium text-ink">
        {fmtHR((scatter.scatterDonjiGrad?.sampleCount ?? 0) * 0.04, 1)}
      </strong>{" "}
      km².
    </p>
  )
}

export function TramSection({ freq }: { freq: FreqInsights }) {
  if (freq.tramlessDistricts.length === 0) {
    return null
  }
  return (
    <section
      id="tramvaj"
      className="flex flex-col border-t border-hairline py-16 sm:py-24"
    >
      <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <StatModuleTitle>Tramvaj je kralj</StatModuleTitle>
          <p className="mt-4 max-w-xl text-body text-ink-2">
            Nijedan kvart bez tramvaja ne prelazi rezultat{" "}
            <strong className="font-medium text-ink">
              {freq.bestTramless}
            </strong>
            . Broj tramvajskih linija je najjači prediktor rezultata - kvartovi
            s više od 10 linija prosječno imaju rezultat{" "}
            <strong className="font-medium text-ink">
              {freq.avgScoreWithManyTramLines}
            </strong>
            .
          </p>
        </div>
      </div>
      <div>
        <div className="mb-6 font-mono text-label font-bold text-ink-muted">
          {freq.tramlessDistricts.length}{" "}
          {plural(freq.tramlessDistricts.length, "kvart", "kvarta", "kvartova")}{" "}
          bez tramvaja
        </div>
        <TramlessScores districts={freq.tramlessDistricts} />
      </div>
    </section>
  )
}

function TramlessScores({ districts }: { districts: Array<DistrictScore> }) {
  return (
    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-body text-ink-2">
      {districts
        .toSorted((a, b) => b.score - a.score)
        .map((d) => (
          <span key={d.name}>
            {d.name}:{" "}
            <strong className="font-medium text-ink">{d.score}</strong>
          </span>
        ))}
    </div>
  )
}

export function HzTrainSection({ data }: { data: ScoreData }) {
  const withTrains = data.districts.filter((d) => d.trainLines.length > 0)
  const anyTrainBoost = withTrains.some((d) => d.trainBoostPct > 0)
  if (withTrains.length === 0 || anyTrainBoost) {
    return null
  }
  return (
    <section
      id="vlak"
      className="flex flex-col border-t border-hairline py-16 sm:py-24"
    >
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <StatModuleTitle>HŽ vlak - neiskorišten potencijal</StatModuleTitle>
          <p className="mt-4 max-w-xl text-body text-ink-2">
            HŽ ima stanice u{" "}
            <strong className="font-medium text-ink">
              {withTrains.length}
            </strong>{" "}
            od {data.districts.length} kvartova. Međutim, doprinos vlaka u
            prosječnom 30-minutnom putovanju je zanemariv.
          </p>
        </div>
      </div>
      <HzTrainStatStrip
        withTrains={withTrains}
        totalDistricts={data.districts.length}
      />
      <div className="mt-12 flex flex-col md:flex-row md:items-start md:gap-12">
        <div className="md:w-1/2">
          <HzTrainBody
            withTrains={withTrains}
            totalDistricts={data.districts.length}
          />
        </div>
        <div className="mt-8 md:mt-0 md:w-1/2">
          <div className="mb-6 font-mono text-label font-bold text-ink-muted">
            Kvartovi uz željeznicu
          </div>
          <HzTrainDistrictList withTrains={withTrains} />
        </div>
      </div>
    </section>
  )
}

function HzTrainStatStrip({
  withTrains,
  totalDistricts,
}: {
  withTrains: Array<DistrictScore>
  totalDistricts: number
}) {
  return (
    <div className="my-8 flex flex-col gap-8 border-y border-hairline py-6 sm:flex-row sm:gap-12">
      <div className="flex flex-col border-l-2 border-zg-blue py-1 pl-4">
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          0%
        </div>
        <div className="mt-2 text-body text-ink-muted">
          doprinos vlaka u
          <br className="hidden sm:block" /> 30-minutnom dosegu
        </div>
      </div>
      <div className="flex flex-col border-l-2 border-zg-blue py-1 pl-4">
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          {withTrains.length}/{totalDistricts}
        </div>
        <div className="mt-2 text-body text-ink-muted">
          kvartova s pristupom
          <br className="hidden sm:block" /> željezničkoj mreži
        </div>
      </div>
      <div className="flex flex-col border-l-2 border-hairline-strong py-1 pl-4">
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          30-60 min
        </div>
        <div className="mt-2 text-body text-ink-muted">
          interval HŽ
          <br className="hidden sm:block" /> regionalnih vlakova
        </div>
      </div>
    </div>
  )
}

function HzTrainBody({
  withTrains,
  totalDistricts,
}: {
  withTrains: Array<DistrictScore>
  totalDistricts: number
}) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-body text-ink-2">
        <strong className="font-medium text-ink">
          {withTrains.length} od {totalDistricts} kvartova
        </strong>{" "}
        ima pristup željezničkoj mreži - ali vlak ne poboljšava 30-minutnu
        dostupnost ni u jednoj od njih.
      </p>
      <p className="text-body text-ink-2">
        Razlog je frekvencija. HŽ regionalni vlakovi voze svakih 30-60 minuta.
        Uz prosječno čekanje od 15-30 minuta, putnik potroši većinu svog
        30-minutnog budžeta samo čekajući na peronu. Kad vlak napokon stigne,
        preostalo vrijeme nije dovoljno da bi značajno proširilo doseg u
        usporedbi s tramvajem ili autobusom koji su već krenuli.
      </p>
      <div className="border border-hairline-strong bg-surface p-5">
        <div className="mb-2 font-mono text-label font-bold text-ink-muted">
          Tramvaj vs. vlak
        </div>
        <p className="text-body text-ink-2">
          Tramvaj u vršnom satu dolazi svakih 7-10 minuta po liniji - a na
          koridorima s više linija u istom smjeru i češće. Kad bi HŽ vozio
          svakih 15 minuta, čekanje bi palo na ~7 min i vlak bi značajno
          proširio doseg perifernih kvartova poput Sesveta i Velike Gorice.
        </p>
      </div>
    </div>
  )
}

function HzTrainDistrictList({
  withTrains,
}: {
  withTrains: Array<DistrictScore>
}) {
  const sorted = withTrains.toSorted((a, b) => b.score - a.score)
  const maxScore = sorted.length > 0 ? sorted[0].score : 1
  return (
    <div className="space-y-3">
      {sorted.map((d, i) => (
        <div key={d.name} className="flex items-center gap-3">
          <span className="w-5 shrink-0 text-right font-mono text-label text-ink-faint tabular-nums">
            {i + 1}.
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1.5 truncate text-body text-ink">
                <span className="inline-block size-2 shrink-0 rounded-full bg-zg-blue" />
                {d.name}
              </span>
              <span className="shrink-0 font-sans text-body text-zg-blue tabular-nums">
                {d.score} bod.
              </span>
            </div>
            <div className="relative h-1.5 w-full overflow-hidden bg-chip-blue">
              <div
                className="absolute inset-y-0 left-0 bg-zg-blue"
                style={{ width: `${(d.score / maxScore) * 100}%` }}
              />
            </div>
          </div>
          <span className="shrink-0 font-mono text-label text-ink-faint tabular-nums">
            {d.trainLines.length} lin · boost 0%
          </span>
        </div>
      ))}
    </div>
  )
}
