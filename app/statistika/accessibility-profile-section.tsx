import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { getDataDir } from "@/lib/data-dir"
import { scaleLinear } from "@visx/scale"
import { Group } from "@visx/group"
import { LinePath } from "@visx/shape"
import { GridRows, GridColumns } from "@visx/grid"
import { fmtHR } from "@/lib/format"
import { StatEyebrow, StatModuleLead, StatModuleTitle } from "./stat-typography"
import type {
  AccessibilityProfileOutput,
  DistrictHourlyProfile,
} from "@/lib/generated"

function loadAccessibilityProfile(): AccessibilityProfileOutput | null {
  const profilePath = join(getDataDir(), "accessibility-profile.json")
  if (!existsSync(profilePath)) return null
  try {
    return JSON.parse(readFileSync(profilePath, "utf-8"))
  } catch {
    return null
  }
}

const DISTRICT_COLORS: Record<string, string> = {
  "Donji grad": "#059669",
  "Gornji grad-Medveščak": "#0891b2",
  Trnje: "#2563eb",
  "Trešnjevka - sjever": "#7c3aed",
  "Trešnjevka - jug": "#c026d3",
  Maksimir: "#ea580c",
  Črnomerec: "#65a30d",
  "Peščenica-Žitnjak": "#0d9488",
  "Novi Zagreb - istok": "#6366f1",
  "Novi Zagreb - zapad": "#8b5cf6",
  Stenjevec: "#d97706",
  "Podsused-Vrapče": "#dc2626",
  "Gornja Dubrava": "#0284c7",
  "Donja Dubrava": "#4f46e5",
  Podsljeme: "#9333ea",
  Sesvete: "#b91c1c",
  Brezovica: "#78716c",
}

function getColor(name: string, idx: number): string {
  return DISTRICT_COLORS[name] ?? `hsl(${(idx * 40) % 360}, 60%, 50%)`
}

interface ProfileInsights {
  sorted: DistrictHourlyProfile[]
  top3: DistrictHourlyProfile[]
  bottom3: DistrictHourlyProfile[]
  cityAvgByHour: number[]
  cityPeakHour: number
  cityPeakCells: number
  cityTroughHour: number
  cityTroughCells: number
  cityDropPct: number
  biggestDrop: DistrictHourlyProfile
  smallestDrop: DistrictHourlyProfile
  hours: number[]
}

type HourDatum = { hour: number; cells: number }

interface ChartLine {
  id: string
  data: HourDatum[]
  color: string
  width: number
  dash?: string
}

function computeInsights(data: AccessibilityProfileOutput): ProfileInsights {
  const districts = data.districts
  const hours = districts[0]?.hours ?? []

  const sorted = [...districts].sort((a, b) => b.peakCells - a.peakCells)
  const top3 = sorted.slice(0, 3)
  const bottom3 = sorted.slice(-3).reverse()

  const cityAvgByHour = hours.map((_, hi) => {
    const sum = districts.reduce((s, d) => s + d.reachableCells[hi], 0)
    return sum / districts.length
  })

  let cityPeakIdx = 0
  let cityTroughIdx = 0
  for (let i = 0; i < cityAvgByHour.length; i++) {
    if (cityAvgByHour[i] > cityAvgByHour[cityPeakIdx]) cityPeakIdx = i
    if (cityAvgByHour[i] < cityAvgByHour[cityTroughIdx]) cityTroughIdx = i
  }
  const cityPeakCells = cityAvgByHour[cityPeakIdx]
  const cityTroughCells = cityAvgByHour[cityTroughIdx]
  const cityDropPct =
    cityPeakCells > 0
      ? Math.round(((cityPeakCells - cityTroughCells) / cityPeakCells) * 1000) /
        10
      : 0

  const dropSorted = [...districts].sort(
    (a, b) => b.serviceDropPct - a.serviceDropPct
  )

  return {
    sorted,
    top3,
    bottom3,
    cityAvgByHour,
    cityPeakHour: hours[cityPeakIdx],
    cityPeakCells,
    cityTroughHour: hours[cityTroughIdx],
    cityTroughCells,
    cityDropPct,
    biggestDrop: dropSorted[0],
    smallestDrop: dropSorted[dropSorted.length - 1],
    hours,
  }
}

function buildChartLines(
  data: AccessibilityProfileOutput,
  insights: ProfileInsights
): ChartLine[] {
  const makeLine = (cells: number[]): HourDatum[] =>
    insights.hours.map((h, i) => ({ hour: h, cells: cells[i] }))

  const lines: ChartLine[] = []
  for (const d of insights.bottom3) {
    const idx = data.districts.findIndex((dd) => dd.name === d.name)
    lines.push({
      id: d.name,
      data: makeLine(d.reachableCells),
      color: getColor(d.name, idx),
      width: 1.5,
      dash: "4 2",
    })
  }
  for (const d of insights.top3) {
    const idx = data.districts.findIndex((dd) => dd.name === d.name)
    lines.push({
      id: d.name,
      data: makeLine(d.reachableCells),
      color: getColor(d.name, idx),
      width: 2.5,
    })
  }
  lines.push({
    id: "Prosjek grada",
    data: makeLine(insights.cityAvgByHour),
    color: "#475569",
    width: 2,
    dash: "6 3",
  })
  return lines
}

// ---------------------------------------------------------------------------

export default function AccessibilityProfileSection() {
  const data = loadAccessibilityProfile()
  if (!data || data.districts.length === 0) return null

  const insights = computeInsights(data)

  return (
    <section
      id="24h-profil"
      className="mt-16 flex flex-col border-t border-slate-200 py-16 sm:py-24 dark:border-white/10"
    >
      <ProfileHeader />
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_320px]">
        <ProfileChartCard data={data} insights={insights} />
        <ProfileInterpretation insights={insights} />
      </div>
      <ProfileTable data={data} insights={insights} />
    </section>
  )
}

function ProfileHeader() {
  return (
    <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <StatModuleTitle>24-satni profil dostupnosti</StatModuleTitle>
        <StatModuleLead>
          Kada se tvoja četvrt &ldquo;budi&rdquo;, a kada &ldquo;zaspi&rdquo;?
          Svaki sat od 5 do 23h mjeri koliko je grada dostupno autobusom i
          tramvajem u 30 minuta.
        </StatModuleLead>
      </div>
    </div>
  )
}

function ProfileChartCard({
  data,
  insights,
}: {
  data: AccessibilityProfileOutput
  insights: ProfileInsights
}) {
  return (
    <div className="flex flex-col">
      <StatEyebrow className="mb-6 text-[13px] font-bold">
        Dostupnost kroz dan
      </StatEyebrow>
      <p className="mb-8 text-[14px] leading-relaxed text-slate-600 dark:text-slate-400">
        Broj dosežnih ćelija po satu za odabrane četvrti i gradski prosjek.
      </p>
      <ProfileChart data={data} insights={insights} />
      <ProfileLegend insights={insights} data={data} />
    </div>
  )
}

function ProfileChart({
  data,
  insights,
}: {
  data: AccessibilityProfileOutput
  insights: ProfileInsights
}) {
  const margin = { top: 16, right: 12, bottom: 36, left: 44 }
  const w = 520
  const h = 300
  const innerW = w - margin.left - margin.right
  const innerH = h - margin.top - margin.bottom

  const allCells = [
    ...insights.top3.flatMap((d) => d.reachableCells),
    ...insights.bottom3.flatMap((d) => d.reachableCells),
    ...insights.cityAvgByHour,
  ]
  const maxCells = Math.max(...allCells)
  const yMax = Math.ceil(maxCells / 100) * 100 || maxCells + 50

  const xScale = scaleLinear<number>({
    domain: [insights.hours[0], insights.hours[insights.hours.length - 1]],
    range: [0, innerW],
  })
  const yScale = scaleLinear<number>({ domain: [0, yMax], range: [innerH, 0] })
  const yTicks = Array.from(
    { length: Math.min(6, Math.ceil(yMax / 100) + 1) },
    (_, i) => Math.round((yMax / 5) * i)
  )
  const lines = buildChartLines(data, insights)

  return (
    <div className="relative mx-auto w-full">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        role="img"
        aria-label="24-satni profil dostupnosti - linijski grafikon"
      >
        <Group top={margin.top} left={margin.left}>
          <ChartGrid
            xScale={xScale}
            yScale={yScale}
            innerW={innerW}
            innerH={innerH}
            yTicks={yTicks}
            hours={insights.hours}
          />
          <ChartAxes
            xScale={xScale}
            yScale={yScale}
            innerW={innerW}
            innerH={innerH}
            yTicks={yTicks}
            hours={insights.hours}
          />
          <ChartLines lines={lines} xScale={xScale} yScale={yScale} />
          <ChartMarkers insights={insights} xScale={xScale} yScale={yScale} />
        </Group>
      </svg>
    </div>
  )
}

type LinearScale = ReturnType<typeof scaleLinear<number>>

function ChartGrid({
  xScale,
  yScale,
  innerW,
  innerH,
  yTicks,
  hours,
}: {
  xScale: LinearScale
  yScale: LinearScale
  innerW: number
  innerH: number
  yTicks: number[]
  hours: number[]
}) {
  return (
    <>
      <GridRows
        scale={yScale}
        width={innerW}
        tickValues={yTicks}
        stroke="#94a3b8"
        strokeOpacity={0.15}
        strokeWidth={1}
      />
      <GridColumns
        scale={xScale}
        height={innerH}
        tickValues={hours.filter((h) => h % 3 === 0)}
        stroke="#94a3b8"
        strokeOpacity={0.1}
        strokeWidth={1}
      />
      <line
        x1={0}
        y1={0}
        x2={0}
        y2={innerH}
        stroke="#cbd5e1"
        strokeWidth={0.5}
      />
      <line
        x1={0}
        y1={innerH}
        x2={innerW}
        y2={innerH}
        stroke="#cbd5e1"
        strokeWidth={0.5}
      />
    </>
  )
}

function ChartAxes({
  xScale,
  yScale,
  innerW,
  innerH,
  yTicks,
  hours,
}: {
  xScale: LinearScale
  yScale: LinearScale
  innerW: number
  innerH: number
  yTicks: number[]
  hours: number[]
}) {
  return (
    <>
      {yTicks.map((v) => (
        <text
          key={v}
          x={-8}
          y={yScale(v) + 1}
          textAnchor="end"
          dominantBaseline="middle"
          className="fill-slate-400 font-mono text-[9px] dark:fill-slate-500"
        >
          {v}
        </text>
      ))}
      {hours
        .filter((h) => h % 2 === 1 || h === 5 || h === 23)
        .map((h) => (
          <text
            key={h}
            x={xScale(h)}
            y={innerH + 16}
            textAnchor="middle"
            className="fill-slate-400 font-mono text-[9px] dark:fill-slate-500"
          >
            {h}:00
          </text>
        ))}
      <text
        x={innerW / 2}
        y={innerH + 30}
        textAnchor="middle"
        className="fill-slate-400 text-[10px] font-bold tracking-widest uppercase dark:fill-slate-500"
      >
        Sat
      </text>
      <text
        x={-30}
        y={-6}
        textAnchor="start"
        className="fill-slate-400 text-[10px] font-bold tracking-widest uppercase dark:fill-slate-500"
      >
        Ćelije
      </text>
    </>
  )
}

function ChartLines({
  lines,
  xScale,
  yScale,
}: {
  lines: ChartLine[]
  xScale: LinearScale
  yScale: LinearScale
}) {
  return (
    <>
      {lines.map((line) => (
        <LinePath<HourDatum>
          key={line.id}
          data={line.data}
          x={(d) => xScale(d.hour)}
          y={(d) => yScale(d.cells)}
          stroke={line.color}
          strokeWidth={line.width}
          strokeDasharray={line.dash}
          strokeLinecap="round"
        />
      ))}
    </>
  )
}

function ChartMarkers({
  insights,
  xScale,
  yScale,
}: {
  insights: ProfileInsights
  xScale: LinearScale
  yScale: LinearScale
}) {
  return (
    <>
      <circle
        cx={xScale(insights.cityPeakHour)}
        cy={yScale(insights.cityPeakCells)}
        r={4}
        fill="#475569"
        stroke="white"
        strokeWidth={1.5}
      />
      <circle
        cx={xScale(insights.cityTroughHour)}
        cy={yScale(insights.cityTroughCells)}
        r={4}
        fill="#475569"
        stroke="white"
        strokeWidth={1.5}
      />
      <text
        x={xScale(insights.cityPeakHour) + 6}
        y={yScale(insights.cityPeakCells) - 6}
        className="fill-slate-600 text-[8px] font-medium dark:fill-slate-300"
      >
        vrh
      </text>
      <text
        x={xScale(insights.cityTroughHour) + 6}
        y={yScale(insights.cityTroughCells) + 12}
        className="fill-slate-600 text-[8px] font-medium dark:fill-slate-300"
      >
        dno
      </text>
    </>
  )
}

function ProfileLegend({
  insights,
  data,
}: {
  insights: ProfileInsights
  data: AccessibilityProfileOutput
}) {
  const items = [
    ...insights.top3.map((d) => ({
      name: d.name,
      color: getColor(
        d.name,
        data.districts.findIndex((dd) => dd.name === d.name)
      ),
      dash: false,
    })),
    ...insights.bottom3.map((d) => ({
      name: d.name,
      color: getColor(
        d.name,
        data.districts.findIndex((dd) => dd.name === d.name)
      ),
      dash: true,
    })),
    { name: "Prosjek grada", color: "#475569", dash: true },
  ]

  return (
    <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1">
      {items.map((item) => (
        <div key={item.name} className="flex items-center gap-1.5">
          <span
            className="inline-block h-[2px] w-4"
            style={{
              backgroundColor: item.color,
              ...(item.dash
                ? {
                    backgroundImage: `repeating-linear-gradient(90deg, ${item.color} 0 4px, transparent 4px 6px)`,
                    backgroundColor: "transparent",
                  }
                : {}),
            }}
          />
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {item.name}
          </span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Interpretation panel
// ---------------------------------------------------------------------------

function ProfileInterpretation({ insights }: { insights: ProfileInsights }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="mt-4 flex flex-col border-l-2 border-teal-500 py-2 pl-6">
        <h3 className="mb-2 font-sans text-[13px] font-bold tracking-widest text-teal-700 uppercase">
          Kada grad diše?
        </h3>
        <InterpretationStats insights={insights} />
        <InterpretationText insights={insights} />
      </div>
    </div>
  )
}

function InterpretationStats({ insights }: { insights: ProfileInsights }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-4">
      <div>
        <div className="font-sans text-[28px] leading-none tracking-tight text-teal-600 tabular-nums dark:text-teal-400">
          {insights.cityPeakHour}:00
        </div>
        <div className="mt-2 text-[12px] text-slate-600 dark:text-slate-400">
          vršni sat
          <br />({Math.round(insights.cityPeakCells)} ćelija prosjek)
        </div>
      </div>
      <div>
        <div className="font-sans text-[28px] leading-none tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
          {insights.cityTroughHour}:00
        </div>
        <div className="mt-2 text-[12px] text-slate-600 dark:text-slate-400">
          najslabiji sat
          <br />
          (-{fmtHR(insights.cityDropPct, 1)}% pad)
        </div>
      </div>
    </div>
  )
}

function InterpretationText({ insights }: { insights: ProfileInsights }) {
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
      <p>
        Vršna dostupnost je u{" "}
        <span className="font-medium text-slate-900 dark:text-slate-100">
          {insights.cityPeakHour}:00
        </span>{" "}
        sa prosječno{" "}
        <span className="font-medium text-slate-900 dark:text-slate-100">
          {Math.round(insights.cityPeakCells)}
        </span>{" "}
        dosežnih ćelija. Najslabiji sat je{" "}
        <span className="font-medium text-slate-900 dark:text-slate-100">
          {insights.cityTroughHour}:00
        </span>{" "}
        s padom od{" "}
        <span className="font-medium text-slate-900 dark:text-slate-100">
          {fmtHR(insights.cityDropPct, 1)}%
        </span>
        .
      </p>
      <p>
        Najveći pad tijekom dana ima{" "}
        <span className="font-medium text-slate-900 dark:text-slate-100">
          {insights.biggestDrop.name}
        </span>{" "}
        (-{fmtHR(insights.biggestDrop.serviceDropPct, 1)}%), dok{" "}
        <span className="font-medium text-slate-900 dark:text-slate-100">
          {insights.smallestDrop.name}
        </span>{" "}
        ({fmtHR(insights.smallestDrop.serviceDropPct, 1)}%) ima najstabilniju
        uslugu kroz dan.
      </p>
      <p>
        Rubne četvrti s rijetkim autobusima pokazuju oštre padove u kasnim
        satima, dok centar s gustom tramvajskom mrežom zadržava relativno
        stabilnu razinu dostupnosti.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

function ProfileTable({
  data,
  insights,
}: {
  data: AccessibilityProfileOutput
  insights: ProfileInsights
}) {
  const sorted = [...data.districts].sort(
    (a, b) => b.serviceDropPct - a.serviceDropPct
  )

  return (
    <div className="mt-12 flex flex-col">
      <ProfileTableHeader cityDropPct={insights.cityDropPct} />
      <DesktopTable sorted={sorted} />
      <MobileCards sorted={sorted} />
    </div>
  )
}

function ProfileTableHeader({ cityDropPct }: { cityDropPct: number }) {
  return (
    <div className="mb-6 flex flex-col gap-2 border-l-2 border-slate-200 pl-4 dark:border-white/10">
      <div className="flex items-baseline justify-between">
        <h3 className="font-sans text-[13px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
          Dnevna stabilnost po četvrtima
        </h3>
        <span className="font-sans text-[14px] tracking-tight text-slate-500 dark:text-slate-400">
          prosječni pad -{fmtHR(cityDropPct, 1)}%
        </span>
      </div>
      <p className="text-[14px] leading-relaxed text-slate-600 dark:text-slate-400">
        Poredano po padu usluge - četvrti s najvećim raskorakom između najboljeg
        i najgoreg sata.
      </p>
    </div>
  )
}

function DesktopTable({ sorted }: { sorted: DistrictHourlyProfile[] }) {
  return (
    <div className="hidden overflow-x-auto sm:block">
      <table className="w-full text-[14px]">
        <thead>
          <tr className="border-b-2 border-slate-200 text-left text-[12px] font-bold tracking-widest text-slate-500 uppercase dark:border-white/10 dark:text-slate-400">
            <th className="w-8 pr-4 pb-3">#</th>
            <th className="pr-4 pb-3">Četvrt</th>
            <th className="pr-4 pb-3 text-right">Vrh</th>
            <th className="pr-4 pb-3 text-right">Dno</th>
            <th className="pr-4 pb-3 text-right">Pad</th>
            <th className="pb-3 text-right">Mini-profil</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((d, i) => (
            <ProfileTableRow key={d.key} d={d} rank={i + 1} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MobileCards({ sorted }: { sorted: DistrictHourlyProfile[] }) {
  return (
    <div className="flex flex-col gap-4 sm:hidden">
      {sorted.map((d, i) => (
        <ProfileMobileCard key={d.key} d={d} rank={i + 1} />
      ))}
    </div>
  )
}

function dropColorClass(pct: number): string {
  if (pct >= 50) return "text-rose-600 dark:text-rose-400"
  if (pct >= 30) return "text-orange-600 dark:text-orange-400"
  return "text-teal-600 dark:text-teal-400"
}

function ProfileTableRow({
  d,
  rank,
}: {
  d: DistrictHourlyProfile
  rank: number
}) {
  return (
    <tr className="border-b border-slate-100 last:border-0 dark:border-white/5">
      <td className="py-3 pr-4 font-mono text-[11px] text-slate-400 dark:text-slate-500">
        {rank.toString().padStart(2, "0")}
      </td>
      <td className="py-3 pr-4 font-medium text-slate-800 dark:text-slate-200">
        {d.name}
      </td>
      <td className="py-3 pr-4 text-right text-slate-600 tabular-nums dark:text-slate-400">
        {d.peakHour}:00{" "}
        <span className="ml-1 text-[12px] text-slate-400 dark:text-slate-500">
          ({Math.round(d.peakCells)})
        </span>
      </td>
      <td className="py-3 pr-4 text-right text-slate-600 tabular-nums dark:text-slate-400">
        {d.troughHour}:00{" "}
        <span className="ml-1 text-[12px] text-slate-400 dark:text-slate-500">
          ({Math.round(d.troughCells)})
        </span>
      </td>
      <td className="py-3 pr-4 text-right font-medium tabular-nums">
        <span className={dropColorClass(d.serviceDropPct)}>
          -{fmtHR(d.serviceDropPct, 1)}%
        </span>
      </td>
      <td className="py-3 text-right">
        <Sparkline cells={d.reachableCells} />
      </td>
    </tr>
  )
}

function Sparkline({ cells }: { cells: number[] }) {
  const sparkW = 80
  const sparkH = 20
  const maxC = Math.max(...cells, 1)
  const minC = Math.min(...cells)
  const range = maxC - minC || 1
  const denom = Math.max(cells.length - 1, 1)
  return (
    <svg width={sparkW} height={sparkH} className="ml-auto" aria-hidden="true">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-slate-400 dark:text-slate-500"
        points={cells
          .map(
            (c, i) =>
              `${(i / denom) * sparkW},${sparkH - ((c - minC) / range) * (sparkH - 2) - 1}`
          )
          .join(" ")}
      />
    </svg>
  )
}

function ProfileMobileCard({
  d,
  rank,
}: {
  d: DistrictHourlyProfile
  rank: number
}) {
  return (
    <div className="flex flex-col border-b border-slate-100 pb-4 last:border-0 dark:border-white/5">
      <div className="mb-1 flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[11px] font-bold text-slate-400 dark:text-slate-500">
            {rank.toString().padStart(2, "0")}
          </span>
          <span className="font-medium text-slate-800 dark:text-slate-200">
            {d.name}
          </span>
        </div>
        <span
          className={`font-medium tabular-nums ${dropColorClass(d.serviceDropPct)}`}
        >
          -{fmtHR(d.serviceDropPct, 1)}%
        </span>
      </div>
      <div className="ml-5 text-[12px] text-slate-500 dark:text-slate-400">
        Vrh {d.peakHour}:00 ({Math.round(d.peakCells)} ćelija) · Dno{" "}
        {d.troughHour}:00 ({Math.round(d.troughCells)} ćelija)
      </div>
    </div>
  )
}
