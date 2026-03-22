"use client"

import useSWR from "swr"
import { fmtHR } from "@/lib/format"

const MAX_RATIO_SCALE = 1.5

interface SpeedRouteComparison {
  routeId: string
  mode: string
  scheduledSpeedKmh: number
  actualSpeedKmh: number | null
  speedRatio: number | null
  sampleCount: number
}

interface SpeedComparisonData {
  routes: SpeedRouteComparison[]
  hasData: boolean
}

function ratioColor(ratio: number | null): string {
  if (ratio === null) return "text-slate-400 dark:text-slate-500"
  if (ratio >= 0.9) return "text-emerald-600 dark:text-emerald-400"
  if (ratio >= 0.7) return "text-amber-600 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}

function ratioBg(ratio: number | null): string {
  if (ratio === null) return "bg-slate-200 dark:bg-slate-700"
  if (ratio >= 0.9) return "bg-emerald-500"
  if (ratio >= 0.7) return "bg-amber-500"
  return "bg-red-500"
}

export default function SpeedComparisonSection() {
  const { data, error } = useSWR<SpeedComparisonData>(
    "/api/rt/speed-comparison",
    { refreshInterval: 30_000, keepPreviousData: true },
  )

  return (
    <section className="flex flex-col border-t border-slate-200 py-16 sm:py-24 dark:border-white/10">
      <SectionHeader />
      <SpeedContent data={data} error={error} />
    </section>
  )
}

function SpeedContent({ data, error }: { data?: SpeedComparisonData; error?: Error }) {
  if (!data && !error) {
    return (
      <div className="flex h-40 items-center justify-center" role="status" aria-label="Učitavanje">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-sky-500" />
        <span className="sr-only">Učitavanje...</span>
      </div>
    )
  }

  if (error || !data) {
    return (
      <p className="text-[13px] text-slate-500 dark:text-slate-400">
        {error?.message ?? "Podaci nisu dostupni"}
      </p>
    )
  }

  if (!data.hasData) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/50 p-12 text-center dark:border-white/10 dark:bg-white/5">
        <p className="text-[14px] text-slate-500 dark:text-slate-400">
          ZET-ov sustav praćenja trenutno ne šalje podatke o brzini vozila.
          Usporedba stvarne i planirane brzine bit će dostupna kada ti podaci postanu dostupni.
        </p>
      </div>
    )
  }

  const withActual = data.routes.filter((r) => r.actualSpeedKmh !== null)
  const avgScheduled = withActual.reduce((s, r) => s + r.scheduledSpeedKmh, 0) / Math.max(withActual.length, 1)
  const avgActual = withActual.reduce((s, r) => s + (r.actualSpeedKmh ?? 0), 0) / Math.max(withActual.length, 1)
  const overallRatio = avgScheduled > 0 ? avgActual / avgScheduled : null

  return (
    <div className="flex flex-col">
      <SummaryRow avgScheduled={avgScheduled} avgActual={avgActual} ratio={overallRatio} routeCount={withActual.length} />
      {withActual.length > 0 && <SpeedTable routes={data.routes} />}
    </div>
  )
}

function SectionHeader() {
  return (
    <div className="mb-12">
      <h2 className="font-serif text-[28px] tracking-tight text-slate-900 sm:text-[32px] dark:text-slate-100">
        Stvarna vs planirana brzina
      </h2>
      <p className="mt-4 max-w-2xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
        Usporedba stvarne brzine vozila s planiranom brzinom iz voznog reda.
        Stvarna brzina uključuje stajanje na stanicama.
      </p>
    </div>
  )
}

function SummaryRow({
  avgScheduled,
  avgActual,
  ratio,
  routeCount,
}: {
  avgScheduled: number
  avgActual: number
  ratio: number | null
  routeCount: number
}) {
  return (
    <div className="flex flex-col gap-2 border-l-2 border-slate-200 pl-6 dark:border-white/10">
      <div>
        <span className={`font-serif text-[48px] font-medium leading-none tabular-nums ${ratioColor(ratio)}`}>
          {fmtHR(avgActual, 1)} km/h
        </span>
      </div>
      <div className="text-[14px] text-slate-500 dark:text-slate-400">
        stvarna (planirana: {fmtHR(avgScheduled, 1)} km/h)
      </div>
      <div className="mt-2 flex gap-6 text-[13px] text-slate-600 dark:text-slate-400">
        {ratio !== null && (
          <span className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />
            <strong className={`font-medium ${ratioColor(ratio)}`}>
              {Math.round(ratio * 100)}%
            </strong>{" "}
            planirane brzine
          </span>
        )}
        <span className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          <strong className="font-medium text-slate-900 dark:text-slate-100">{routeCount}</strong>{" "}
          linija s podacima
        </span>
      </div>
    </div>
  )
}

function SpeedTable({ routes }: { routes: SpeedRouteComparison[] }) {
  const sorted = [...routes].filter((r) => r.actualSpeedKmh !== null)
    .sort((a, b) => (a.speedRatio ?? 0) - (b.speedRatio ?? 0))

  return (
    <div className="mt-12">
      <div className="mb-6 font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
        Po linijama
      </div>
      <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((r) => (
          <SpeedRow key={r.routeId} r={r} />
        ))}
      </div>
    </div>
  )
}

function SpeedRow({ r }: { r: SpeedRouteComparison }) {
  const barPct = r.speedRatio !== null ? Math.min(r.speedRatio * 100, MAX_RATIO_SCALE * 100) : 0

  return (
    <div className="flex items-center gap-3 border-b border-slate-100 py-2 dark:border-white/5">
      <span className="w-10 shrink-0 font-mono text-[14px] font-medium text-slate-800 tabular-nums dark:text-slate-200">
        {r.routeId}
      </span>
      <div className="relative h-2 flex-1 rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="absolute top-0 h-full w-[2px] bg-slate-300 dark:bg-slate-600" style={{ left: `${100 / MAX_RATIO_SCALE}%` }} />
        <span className="absolute text-[9px] text-slate-400 dark:text-slate-500" style={{ left: `${100 / MAX_RATIO_SCALE}%`, top: -14 }}>100%</span>
        <div
          className={`h-full rounded-full ${ratioBg(r.speedRatio)}`}
          style={{ width: `${Math.max(barPct / MAX_RATIO_SCALE, 2)}%` }}
        />
      </div>
      <span className="w-24 text-right font-mono text-[13px] tabular-nums text-slate-600 dark:text-slate-400">
        {r.actualSpeedKmh !== null
          ? `${r.actualSpeedKmh.toFixed(1)} / ${r.scheduledSpeedKmh.toFixed(1)}`
          : `— / ${r.scheduledSpeedKmh.toFixed(1)}`}
      </span>
      <span className={`w-12 text-right font-mono text-[13px] font-medium tabular-nums ${ratioColor(r.speedRatio)}`}>
        {r.speedRatio !== null ? `${Math.round(r.speedRatio * 100)}%` : "—"}
      </span>
    </div>
  )
}
