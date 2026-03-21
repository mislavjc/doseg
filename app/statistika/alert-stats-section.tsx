"use client"

import { useState } from "react"
import useSWR from "swr"
import { scaleLinear } from "@visx/scale"

interface LabelCount {
  label: string
  count: number
}

interface AlertStatsData {
  byRoute: LabelCount[]
  byCause: LabelCount[]
  byEffect: LabelCount[]
  total: number
}

type TimeRange = "7d" | "30d" | "90d"

const TIME_RANGE_SECONDS: Record<TimeRange, number> = {
  "7d": 7 * 86400,
  "30d": 30 * 86400,
  "90d": 90 * 86400,
}

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  "7d": "7 dana",
  "30d": "30 dana",
  "90d": "90 dana",
}

const CAUSE_LABELS: Record<string, string> = {
  UNKNOWN_CAUSE: "Nepoznato",
  OTHER_CAUSE: "Ostalo",
  TECHNICAL_PROBLEM: "Tehnički problem",
  STRIKE: "Štrajk",
  DEMONSTRATION: "Demonstracija",
  ACCIDENT: "Nesreća",
  HOLIDAY: "Praznik",
  WEATHER: "Vrijeme",
  MAINTENANCE: "Održavanje",
  CONSTRUCTION: "Gradnja",
  POLICE_ACTIVITY: "Policija",
  MEDICAL_EMERGENCY: "Hitna pomoć",
}

const CAUSE_COLORS = [
  "bg-red-500", "bg-amber-500", "bg-blue-500", "bg-emerald-500",
  "bg-violet-500", "bg-rose-400", "bg-cyan-500", "bg-orange-400",
  "bg-lime-500", "bg-pink-500", "bg-teal-500", "bg-indigo-500",
]


function TopRoutesChart({ byRoute }: { byRoute: AlertStatsData["byRoute"] }) {
  const topRoutes = byRoute.slice(0, 10)
  const maxCount = Math.max(...topRoutes.map((r) => r.count), 1)
  const barScale = scaleLinear<number>({ domain: [0, maxCount], range: [0, 100] })

  if (topRoutes.length === 0) {
    return <p className="py-8 text-center text-[13px] text-slate-400">Nema podataka za odabrano razdoblje</p>
  }

  return (
    <div className="space-y-2">
      {topRoutes.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-right font-mono text-[11px] text-slate-600 tabular-nums dark:text-slate-300">
            {r.label}
          </span>
          <div className="relative h-5 flex-1 rounded bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded bg-rose-500 transition-all duration-500 dark:bg-rose-400"
              style={{ width: `${barScale(r.count)}%` }}
            />
          </div>
          <span className="w-8 text-right font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
            {r.count}
          </span>
        </div>
      ))}
    </div>
  )
}

function CauseStackedBar({ byCause }: { byCause: AlertStatsData["byCause"] }) {
  const total = byCause.reduce((s, c) => s + c.count, 0)
  if (total === 0) return null

  return (
    <div className="mb-4 flex h-6 overflow-hidden rounded-full">
      {byCause.map((c, i) => (
        <div
          key={c.label}
          className={`${CAUSE_COLORS[i % CAUSE_COLORS.length]} transition-all duration-500`}
          style={{ width: `${(c.count / total) * 100}%` }}
          title={`${CAUSE_LABELS[c.label] ?? c.label}: ${c.count}`}
        />
      ))}
    </div>
  )
}

function CauseLegend({ byCause }: { byCause: AlertStatsData["byCause"] }) {
  const total = byCause.reduce((s, c) => s + c.count, 0)

  return (
    <div className="space-y-1.5">
      {byCause.map((c, i) => {
        const pct = total > 0 ? Math.round((c.count / total) * 100) : 0
        return (
          <div key={c.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2.5 w-2.5 rounded-sm ${CAUSE_COLORS[i % CAUSE_COLORS.length]}`} />
              <span className="text-[12px] text-slate-600 dark:text-slate-300">
                {CAUSE_LABELS[c.label] ?? c.label}
              </span>
            </div>
            <span className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
              {c.count} ({pct}%)
            </span>
          </div>
        )
      })}
    </div>
  )
}

function CauseBreakdownPanel({ byCause }: { byCause: AlertStatsData["byCause"] }) {
  if (byCause.length === 0) {
    return <p className="py-8 text-center text-[13px] text-slate-400">Nema podataka za odabrano razdoblje</p>
  }
  return (
    <>
      <CauseStackedBar byCause={byCause} />
      <CauseLegend byCause={byCause} />
    </>
  )
}

function AlertStatsContent({ data }: { data: AlertStatsData }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
        <div className="mb-4 font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
          Najpogođenije linije
        </div>
        <TopRoutesChart byRoute={data.byRoute} />
      </div>
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900/40 dark:ring-white/10">
        <div className="mb-4 font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
          Uzroci upozorenja
        </div>
        <CauseBreakdownPanel byCause={data.byCause} />
      </div>
    </div>
  )
}

function TimeRangeSelector({ range, setRange }: { range: TimeRange; setRange: (r: TimeRange) => void }) {
  return (
    <div className="flex gap-1">
      {(Object.keys(TIME_RANGE_SECONDS) as TimeRange[]).map((r) => (
        <button
          key={r}
          onClick={() => setRange(r)}
          className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
            range === r
              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
          }`}
        >
          {TIME_RANGE_LABELS[r]}
        </button>
      ))}
    </div>
  )
}

export default function AlertStatsSection() {
  const [range, setRange] = useState<TimeRange>("30d")
  const { data, error, isLoading } = useSWR<AlertStatsData>(`rt-alerts:${range}`, () => {
    const now = Math.floor(Date.now() / 1000)
    const from = now - TIME_RANGE_SECONDS[range]
    return fetch(`/api/rt/alert-stats?from=${from}&to=${now}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
  }, { keepPreviousData: true })

  // Hide entire section when there's no alert data
  if (data && data.total === 0) return null
  if (error) return null

  return (
    <section className="mt-24">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-serif text-[24px] text-slate-900 dark:text-slate-100">
          Analiza upozorenja
        </h2>
        <TimeRangeSelector range={range} setRange={setRange} />
      </div>
      <p className="mb-8 max-w-xl text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
        Distribucija GTFS-RT upozorenja po linijama i uzrocima.
        {data ? ` Ukupno ${data.total} upozorenja u odabranom razdoblju.` : ""}
      </p>
      {isLoading && (
        <div className="flex h-40 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-500" />
        </div>
      )}
      {data && <AlertStatsContent data={data} />}
    </section>
  )
}
