import { scaleLinear } from "@visx/scale"
import { Group } from "@visx/group"
import { LinePath } from "@visx/shape"
import { GridRows, GridColumns } from "@visx/grid"
import type { District as DistrictScore } from "@/lib/generated"
import type { computeGiniData } from "./stat-data"
import { fmtHR } from "./stat-data"
import { StatModuleTitle } from "./stat-typography"


type GiniData = ReturnType<typeof computeGiniData>

export function LorenzSection({
  giniData,
}: {
  giniData: GiniData
}) {
  return (
    <section
      id="lorenz"
      className="flex flex-col border-t border-slate-100 py-16 sm:py-24 dark:border-white/10"
    >
      <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <StatModuleTitle>Lorenzova krivulja dostupnosti</StatModuleTitle>
          <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
            Krivulja prikazuje kumulativni udio stanovništva u odnosu na
            kumulativni udio dostupnosti. Što je krivulja bliže dijagonali, to
            je raspodjela pravednija.
          </p>
        </div>
      </div>
      <div className="flex flex-col md:flex-row md:items-start md:gap-16">
          <div className="w-full md:w-[320px] md:shrink-0">
            <LorenzChart lorenzPoints={giniData.lorenzPoints} />
            <p className="mt-6 text-center text-[13px] leading-snug text-slate-500 dark:text-slate-400">
              Što je krivulja dalje od dijagonale, to je nejednakost veća.
            </p>
          </div>
          <div className="mt-12 flex-1 text-[18px] leading-relaxed text-slate-700 md:mt-0 dark:text-slate-300">
            <p>
              Ova krivulja prikazuje kumulativni udio dostupnosti u odnosu na
              kumulativni udio stanovništva.
            </p>
            <p className="mt-6">
              Kada bi svi građani imali jednaku dostupnost, krivulja bi pratila
              ravnu dijagonalu (linija savršene jednakosti). Odstupanje od te
              linije pokazuje koliko su resursi neravnomjerno raspoređeni po
              gradu.
            </p>
            <div className="mt-12">
              <LorenzAccessibilityTable popSorted={giniData.popSorted} />
            </div>
          </div>
        </div>
    </section>
  )
}

function LorenzChart({
  lorenzPoints,
}: {
  lorenzPoints: { x: number; y: number }[]
}) {
  const lm = { top: 10, right: 10, bottom: 30, left: 30 }
  const lw = 280
  const lh = 280
  const liw = lw - lm.left - lm.right
  const lih = lh - lm.top - lm.bottom
  const lxScale = scaleLinear<number>({ domain: [0, 1], range: [0, liw] })
  const lyScale = scaleLinear<number>({ domain: [0, 1], range: [lih, 0] })

  return (
    <div className="relative mx-auto w-full max-w-[320px]">
      <svg
        viewBox={`0 0 ${lw} ${lh}`}
        className="w-full"
        aria-label="Lorenzova krivulja dostupnosti"
      >
        <Group top={lm.top} left={lm.left}>
          <LorenzGridAndCurve
            lorenzPoints={lorenzPoints}
            lxScale={lxScale}
            lyScale={lyScale}
            liw={liw}
            lih={lih}
          />
          <LorenzAxisLabels
            lxScale={lxScale}
            lyScale={lyScale}
            liw={liw}
            lih={lih}
          />
        </Group>
      </svg>
    </div>
  )
}

function LorenzGridAndCurve({
  lorenzPoints,
  lxScale,
  lyScale,
  liw,
  lih,
}: {
  lorenzPoints: { x: number; y: number }[]
  lxScale: ReturnType<typeof scaleLinear<number>>
  lyScale: ReturnType<typeof scaleLinear<number>>
  liw: number
  lih: number
}) {
  return (
    <>
      <GridRows
        scale={lyScale}
        width={liw}
        tickValues={[0.25, 0.5, 0.75]}
        stroke="#94a3b8"
        strokeOpacity={0.15}
        strokeWidth={1}
      />
      <GridColumns
        scale={lxScale}
        height={lih}
        tickValues={[0.25, 0.5, 0.75]}
        stroke="#94a3b8"
        strokeOpacity={0.15}
        strokeWidth={1}
      />
      <polygon
        points={[
          ...lorenzPoints.map((p) => `${lxScale(p.x)},${lyScale(p.x)}`),
          ...[...lorenzPoints]
            .reverse()
            .map((p) => `${lxScale(p.x)},${lyScale(p.y)}`),
        ].join(" ")}
        fill="#6ee7b7"
        fillOpacity={0.3}
      />
      <line
        x1={0}
        y1={lih}
        x2={liw}
        y2={0}
        stroke="#94a3b8"
        strokeWidth={1}
        strokeDasharray="4 3"
      />
      <LinePath<{ x: number; y: number }>
        data={lorenzPoints}
        x={(d) => lxScale(d.x)}
        y={(d) => lyScale(d.y)}
        stroke="#059669"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
    </>
  )
}

function LorenzAxisLabels({
  lxScale,
  lyScale,
  liw,
  lih,
}: {
  lxScale: ReturnType<typeof scaleLinear<number>>
  lyScale: ReturnType<typeof scaleLinear<number>>
  liw: number
  lih: number
}) {
  return (
    <>
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <text
          key={`xt-${v}`}
          x={lxScale(v)}
          y={lih + 16}
          textAnchor="middle"
          className="fill-slate-400 text-[8px] dark:fill-slate-500"
        >
          {Math.round(v * 100)}%
        </text>
      ))}
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <text
          key={`yt-${v}`}
          x={-8}
          y={lyScale(v) + 1}
          textAnchor="end"
          dominantBaseline="middle"
          className="fill-slate-400 text-[8px] dark:fill-slate-500"
        >
          {Math.round(v * 100)}%
        </text>
      ))}
      <text
        x={liw / 2}
        y={lih + 28}
        textAnchor="middle"
        className="fill-slate-500 text-[9px] dark:fill-slate-400"
      >
        Udio stanovništva (%)
      </text>
      <text
        x={-22}
        y={lih / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        transform={`rotate(-90, -22, ${lih / 2})`}
        className="fill-slate-500 text-[9px] dark:fill-slate-400"
      >
        Udio dostupnosti (%)
      </text>
    </>
  )
}

function LorenzAccessibilityTable({
  popSorted,
}: {
  popSorted: DistrictScore[]
}) {
  return (
    <div className="sr-only">
      <table>
        <caption>
          Lorenzova krivulja - podaci po kvartovima sortirani po dostupnosti
        </caption>
        <thead>
          <tr>
            <th scope="col">Kvart</th>
            <th scope="col">Rezultat</th>
            <th scope="col">Populacija</th>
          </tr>
        </thead>
        <tbody>
          {popSorted.map((d) => (
            <tr key={d.osmId}>
              <td>{d.name}</td>
              <td>{d.score}</td>
              <td>{(d.population ?? 0).toLocaleString("hr-HR")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function GiniSection({
  giniData,
}: {
  giniData: GiniData
}) {
  return (
    <section
      id="gini"
      className="flex flex-col border-t border-slate-100 py-16 sm:py-24 dark:border-white/10"
    >
      <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <StatModuleTitle>Gini koeficijent</StatModuleTitle>
          <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
            Gini koeficijent mjeri nejednakost. 0 predstavlja savršenu jednakost
            (svi imaju istu dostupnost), a 1 potpunu nejednakost.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-12 lg:flex-row lg:items-start lg:gap-16">
          <div className="flex shrink-0 items-baseline gap-2">
            <span className="font-sans text-[96px] leading-none tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
              {fmtHR(giniData.gini, 2)}
            </span>
          </div>
          <div className="flex-1">
            <GiniCards giniData={giniData} />
            <div className="mt-12 text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
              <GiniInterpretation giniData={giniData} />
              {/* The previous copy here benchmarked against "most European
                  cities: 0,25 to 0,35" with no source behind it. Removed rather
                  than cited: the number could not be traced, and this page is
                  pitched to fact-checking desks. What is left is definitional. */}
              <p className="mt-6">
                Gini ide od 0 (svi kvartovi imaju jednak doseg) do 1 (sav doseg
                je u jednom kvartu). Ovdje mjeri raspodjelu dosega javnim
                prijevozom, ne prihoda.
              </p>
            </div>
          </div>
        </div>
    </section>
  )
}

function GiniCards({
  giniData,
}: {
  giniData: GiniData
}) {
  return (
    <div className="grid grid-cols-1 gap-8 border-l-2 border-slate-100 pl-6 sm:grid-cols-3 dark:border-white/10">
      <div className="flex flex-col">
        <div className="font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
          Jutro
        </div>
        <div className="mt-2 font-sans text-[32px] leading-none tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
          {fmtHR(giniData.gini, 3)}
        </div>
      </div>
      <div className="flex flex-col">
        <div className="font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
          S BAJS-om
        </div>
        <div
          className={`mt-2 font-sans text-[32px] leading-none tracking-tight tabular-nums ${giniData.bajsGini > giniData.gini ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}
        >
          {fmtHR(giniData.bajsGini, 3)}
        </div>
      </div>
      <div className="flex flex-col">
        <div className="font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
          Večer
        </div>
        <div className="mt-2 font-sans text-[32px] leading-none tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
          {fmtHR(giniData.eveningGini, 3)}
        </div>
      </div>
    </div>
  )
}

function GiniInterpretation({
  giniData,
}: {
  giniData: GiniData
}) {
  return (
    <p>
      BAJS bike-sharing blago{" "}
      {giniData.giniDiff > 0 ? "pogor\u0161ava" : "pobolj\u0161ava"} jednakost
      (Gini {giniData.giniDiff > 0 ? "+" : ""}
      {fmtHR(giniData.giniDiff, 3)}) jer su stanice koncentrirane u već dobro
      povezanim kvartovima. Proširenje mreže prema rubnim kvartovima moglo bi
      smanjiti nejednakost.
    </p>
  )
}
