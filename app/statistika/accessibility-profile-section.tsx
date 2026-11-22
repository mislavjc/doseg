import { join } from "node:path"
import { getDataDir } from "@/lib/data-dir"
import { readJsonCached } from "@/lib/page-data"
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

const TOP_COLORS = ["var(--navy)", "var(--zg-blue)", "var(--blue-pale)"]
const BOTTOM_COLORS = ["var(--ink)", "var(--ink-muted)", "var(--ink-ghost)"]

interface ProfileInsights {
  sorted: Array<DistrictHourlyProfile>
  top3: Array<DistrictHourlyProfile>
  bottom3: Array<DistrictHourlyProfile>
  cityAvgByHour: Array<number>
  cityPeakHour: number
  cityPeakCells: number
  cityTroughHour: number
  cityTroughCells: number
  cityDropPct: number
  biggestDrop: DistrictHourlyProfile
  smallestDrop: DistrictHourlyProfile
  hours: Array<number>
}

type HourDatum = { hour: number; cells: number }

interface ChartLine {
  id: string
  data: Array<HourDatum>
  color: string
  width: number
  dash?: string
}

function computeInsights(data: AccessibilityProfileOutput): ProfileInsights {
  const districts = data.districts
  const hours = districts[0]?.hours ?? []

  const sorted = districts.toSorted((a, b) => b.peakCells - a.peakCells)
  const top3 = sorted.slice(0, 3)
  const bottom3 = sorted.slice(-3).toReversed()

  const cityAvgByHour = hours.map((_, hi) => {
    const sum = districts.reduce((s, d) => s + d.reachableCells[hi], 0)
    return sum / districts.length
  })

  let cityPeakIdx = 0
  let cityTroughIdx = 0
  for (let i = 0; i < cityAvgByHour.length; i++) {
    if (cityAvgByHour[i] > cityAvgByHour[cityPeakIdx]) {
      cityPeakIdx = i
    }
    if (cityAvgByHour[i] < cityAvgByHour[cityTroughIdx]) {
      cityTroughIdx = i
    }
  }
  const cityPeakCells = cityAvgByHour[cityPeakIdx]
  const cityTroughCells = cityAvgByHour[cityTroughIdx]
  const cityDropPct =
    cityPeakCells > 0
      ? Math.round(((cityPeakCells - cityTroughCells) / cityPeakCells) * 1000) /
        10
      : 0

  const dropSorted = districts.toSorted(
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

function buildChartLines(insights: ProfileInsights): Array<ChartLine> {
  const makeLine = (cells: Array<number>): Array<HourDatum> =>
    insights.hours.map((h, i) => ({ hour: h, cells: cells[i] }))

  const lines: Array<ChartLine> = []
  for (const [idx, d] of insights.bottom3.entries()) {
    lines.push({
      id: d.name,
      data: makeLine(d.reachableCells),
      color: BOTTOM_COLORS[idx],
      width: 1.5,
      dash: "4 2",
    })
  }
  for (const [idx, d] of insights.top3.entries()) {
    lines.push({
      id: d.name,
      data: makeLine(d.reachableCells),
      color: TOP_COLORS[idx],
      width: 2.5,
    })
  }
  lines.push({
    id: "Prosjek grada",
    data: makeLine(insights.cityAvgByHour),
    color: "var(--ink-muted)",
    width: 2,
    dash: "6 3",
  })
  return lines
}

// ---------------------------------------------------------------------------

export default function AccessibilityProfileSection() {
  const data = readJsonCached<AccessibilityProfileOutput>(
    join(getDataDir(), "accessibility-profile.json")
  )
  if (!data || data.districts.length === 0) {
    return null
  }

  const insights = computeInsights(data)

  return (
    <section
      id="24h-profil"
      className="mt-16 flex flex-col border-t border-hairline-strong py-16 sm:py-24"
    >
      <ProfileHeader />
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_320px]">
        <ProfileChartCard insights={insights} />
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
          Kada se tvoj kvart &ldquo;budi&rdquo;, a kada &ldquo;zaspi&rdquo;?
          Svaki sat od 5 do 23h mjeri koliko je grada dostupno autobusom i
          tramvajem u 30 minuta.
        </StatModuleLead>
      </div>
    </div>
  )
}

function ProfileChartCard({ insights }: { insights: ProfileInsights }) {
  return (
    <div className="flex flex-col">
      <StatEyebrow className="mb-6">Dostupnost kroz dan</StatEyebrow>
      <p className="mb-8 text-body text-ink-2">
        Broj dosežnih ćelija po satu za odabrane kvartove i gradski prosjek.
      </p>
      <ProfileChart insights={insights} />
      <ProfileLegend insights={insights} />
    </div>
  )
}

function ProfileChart({ insights }: { insights: ProfileInsights }) {
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
  const lines = buildChartLines(insights)

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
  yTicks: Array<number>
  hours: Array<number>
}) {
  return (
    <>
      <GridRows
        scale={yScale}
        width={innerW}
        tickValues={yTicks}
        stroke="var(--ink-faint)"
        strokeOpacity={0.15}
        strokeWidth={1}
      />
      <GridColumns
        scale={xScale}
        height={innerH}
        tickValues={hours.filter((h) => h % 3 === 0)}
        stroke="var(--ink-faint)"
        strokeOpacity={0.1}
        strokeWidth={1}
      />
      <line
        x1={0}
        y1={0}
        x2={0}
        y2={innerH}
        stroke="var(--ink-ghost)"
        strokeWidth={0.5}
      />
      <line
        x1={0}
        y1={innerH}
        x2={innerW}
        y2={innerH}
        stroke="var(--ink-ghost)"
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
  yTicks: Array<number>
  hours: Array<number>
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
          className="fill-ink-muted font-mono text-label"
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
            className="fill-ink-muted font-mono text-label"
          >
            {h}:00
          </text>
        ))}
      <text
        x={innerW / 2}
        y={innerH + 30}
        textAnchor="middle"
        className="fill-ink-muted font-mono text-label font-bold"
      >
        Sat
      </text>
      <text
        x={-30}
        y={-6}
        textAnchor="start"
        className="fill-ink-muted font-mono text-label font-bold"
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
  lines: Array<ChartLine>
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
        fill="var(--ink-muted)"
        stroke="white"
        strokeWidth={1.5}
      />
      <circle
        cx={xScale(insights.cityTroughHour)}
        cy={yScale(insights.cityTroughCells)}
        r={4}
        fill="var(--ink-muted)"
        stroke="white"
        strokeWidth={1.5}
      />
      <text
        x={xScale(insights.cityPeakHour) + 6}
        y={yScale(insights.cityPeakCells) - 6}
        className="fill-ink-muted font-mono text-label"
      >
        vrh
      </text>
      <text
        x={xScale(insights.cityTroughHour) + 6}
        y={yScale(insights.cityTroughCells) + 12}
        className="fill-ink-muted font-mono text-label"
      >
        dno
      </text>
    </>
  )
}

function ProfileLegend({ insights }: { insights: ProfileInsights }) {
  const items = [
    ...insights.top3.map((d, idx) => ({
      name: d.name,
      color: TOP_COLORS[idx],
      dash: false,
    })),
    ...insights.bottom3.map((d, idx) => ({
      name: d.name,
      color: BOTTOM_COLORS[idx],
      dash: true,
    })),
    { name: "Prosjek grada", color: "var(--ink-muted)", dash: true },
  ]

  return (
    <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1">
      {items.map((item) => {
        const swatchStyle: React.CSSProperties = {
          backgroundColor: item.color,
        }
        if (item.dash) {
          swatchStyle.backgroundImage = `repeating-linear-gradient(90deg, ${item.color} 0 4px, transparent 4px 6px)`
          swatchStyle.backgroundColor = "transparent"
        }
        return (
          <div key={item.name} className="flex items-center gap-1.5">
            <span className="inline-block h-[2px] w-4" style={swatchStyle} />
            <span className="font-mono text-label text-ink-muted">
              {item.name}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Interpretation panel
// ---------------------------------------------------------------------------

function ProfileInterpretation({ insights }: { insights: ProfileInsights }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="mt-4 flex flex-col border-l-2 border-zg-blue py-2 pl-6">
        <h3 className="mb-2 font-mono text-label font-bold text-zg-blue">
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
        <div className="font-sans text-head font-bold text-zg-blue tabular-nums">
          {insights.cityPeakHour}:00
        </div>
        <div className="mt-2 text-body text-ink-2">
          vršni sat
          <br />({Math.round(insights.cityPeakCells)} ćelija prosjek)
        </div>
      </div>
      <div>
        <div className="font-sans text-head font-bold text-ink tabular-nums">
          {insights.cityTroughHour}:00
        </div>
        <div className="mt-2 text-body text-ink-2">
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
    <div className="space-y-4 text-body text-ink-2">
      <p>
        Vršna dostupnost je u{" "}
        <span className="font-medium text-ink">{insights.cityPeakHour}:00</span>{" "}
        sa prosječno{" "}
        <span className="font-medium text-ink">
          {Math.round(insights.cityPeakCells)}
        </span>{" "}
        dosežnih ćelija. Najslabiji sat je{" "}
        <span className="font-medium text-ink">
          {insights.cityTroughHour}:00
        </span>{" "}
        s padom od{" "}
        <span className="font-medium text-ink">
          {fmtHR(insights.cityDropPct, 1)}%
        </span>
        .
      </p>
      <p>
        Najveći pad tijekom dana ima{" "}
        <span className="font-medium text-ink">
          {insights.biggestDrop.name}
        </span>{" "}
        (-{fmtHR(insights.biggestDrop.serviceDropPct, 1)}%), dok{" "}
        <span className="font-medium text-ink">
          {insights.smallestDrop.name}
        </span>{" "}
        ({fmtHR(insights.smallestDrop.serviceDropPct, 1)}%) ima najstabilniju
        uslugu kroz dan.
      </p>
      <p>
        Rubni kvartovi s rijetkim autobusima pokazuju oštre padove u kasnim
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
  const sorted = data.districts.toSorted(
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
    <div className="mb-6 flex flex-col gap-2 border-l-2 border-hairline-strong pl-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-mono text-label font-bold text-ink-muted">
          Dnevna stabilnost po kvartovima
        </h3>
        <span className="font-sans text-body text-ink-muted">
          prosječni pad -{fmtHR(cityDropPct, 1)}%
        </span>
      </div>
      <p className="text-body text-ink-2">
        Poredano po padu usluge - kvartovi s najvećim raskorakom između
        najboljeg i najgoreg sata.
      </p>
    </div>
  )
}

function DesktopTable({ sorted }: { sorted: Array<DistrictHourlyProfile> }) {
  return (
    <div className="hidden overflow-x-auto sm:block">
      <table className="w-full text-body">
        <thead>
          <tr className="border-b-2 border-hairline-strong text-left font-mono text-label font-bold text-ink-muted">
            <th className="w-8 pr-4 pb-3">#</th>
            <th className="pr-4 pb-3">Kvart</th>
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

function MobileCards({ sorted }: { sorted: Array<DistrictHourlyProfile> }) {
  return (
    <div className="flex flex-col gap-4 sm:hidden">
      {sorted.map((d, i) => (
        <ProfileMobileCard key={d.key} d={d} rank={i + 1} />
      ))}
    </div>
  )
}

function dropColorClass(pct: number): string {
  if (pct >= 50) {
    return "text-ink"
  }
  if (pct >= 30) {
    return "text-ink-muted"
  }
  return "text-zg-blue"
}

function ProfileTableRow({
  d,
  rank,
}: {
  d: DistrictHourlyProfile
  rank: number
}) {
  return (
    <tr className="border-b border-hairline last:border-0">
      <td className="py-3 pr-4 font-mono text-label text-ink-faint">
        {rank.toString().padStart(2, "0")}
      </td>
      <td className="py-3 pr-4 font-medium text-ink">{d.name}</td>
      <td className="py-3 pr-4 text-right text-ink-2 tabular-nums">
        {d.peakHour}:00{" "}
        <span className="ml-1 text-body text-ink-faint">
          ({Math.round(d.peakCells)})
        </span>
      </td>
      <td className="py-3 pr-4 text-right text-ink-2 tabular-nums">
        {d.troughHour}:00{" "}
        <span className="ml-1 text-body text-ink-faint">
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

function Sparkline({ cells }: { cells: Array<number> }) {
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
        className="text-ink-faint"
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
    <div className="flex flex-col border-b border-hairline pb-4 last:border-0">
      <div className="mb-1 flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-label font-bold text-ink-faint">
            {rank.toString().padStart(2, "0")}
          </span>
          <span className="font-medium text-ink">{d.name}</span>
        </div>
        <span
          className={`font-medium tabular-nums ${dropColorClass(d.serviceDropPct)}`}
        >
          -{fmtHR(d.serviceDropPct, 1)}%
        </span>
      </div>
      <div className="ml-5 text-body text-ink-muted">
        Vrh {d.peakHour}:00 ({Math.round(d.peakCells)} ćelija) · Dno{" "}
        {d.troughHour}:00 ({Math.round(d.troughCells)} ćelija)
      </div>
    </div>
  )
}
