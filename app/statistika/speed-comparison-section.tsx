"use client"

import useSWR from "swr"
import { fmtHR } from "@/lib/format"

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
    <section className="mt-24">
      <SectionHeader />
      <SpeedContent data={data} error={error} />
    </section>
  )
}

function SpeedContent({ data, error }: { data?: SpeedComparisonData; error?: Error }) {
  if (!data && !error) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-sky-500" />
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
      <p className="text-[13px] text-slate-500 dark:text-slate-400">
        GTFS-RT feed ne sadrži podatke o brzini vozila. Usporedba će biti dostupna
        kada ZET počne slati brzine u VehiclePosition feedu.
      </p>
    )
  }

  const withActual = data.routes.filter((r) => r.actualSpeedKmh !== null)
  const avgScheduled = withActual.reduce((s, r) => s + r.scheduledSpeedKmh, 0) / Math.max(withActual.length, 1)
  const avgActual = withActual.reduce((s, r) => s + (r.actualSpeedKmh ?? 0), 0) / Math.max(withActual.length, 1)
  const overallRatio = avgScheduled > 0 ? avgActual / avgScheduled : null

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8 dark:bg-zinc-900/40 dark:ring-white/10">
      <SummaryRow avgScheduled={avgScheduled} avgActual={avgActual} ratio={overallRatio} routeCount={withActual.length} />
      {withActual.length > 0 && <SpeedTable routes={data.routes} />}
    </div>
  )
}

function SectionHeader() {
  return (
    <>
      <h2 className="mb-2 font-serif text-[24px] text-slate-900 dark:text-slate-100">
        Stvarna vs planirana brzina
      </h2>
      <p className="mb-8 max-w-xl text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
        Usporedba trenutne brzine vozila iz GTFS-RT feeda s planiranom komercijalnom
        brzinom iz voznog reda. Stvarna brzina uključuje stajanje na stanicama.
      </p>
    </>
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
    <div className="mb-6 flex flex-wrap items-baseline gap-x-8 gap-y-2">
      <div>
        <span className={`font-serif text-[36px] font-medium tabular-nums ${ratioColor(ratio)}`}>
          {fmtHR(avgActual, 1)} km/h
        </span>
        <span className="ml-2 text-[13px] text-slate-500 dark:text-slate-400">
          stvarna (planirana: {fmtHR(avgScheduled, 1)} km/h)
        </span>
      </div>
      <div className="flex gap-4 text-[12px] text-slate-500 dark:text-slate-400">
        {ratio !== null && (
          <span>
            <strong className={`font-medium ${ratioColor(ratio)}`}>
              {Math.round(ratio * 100)}%
            </strong>{" "}
            planirane brzine
          </span>
        )}
        <span>
          <strong className="font-medium text-slate-700 dark:text-slate-300">{routeCount}</strong>{" "}
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
    <div>
      <div className="mb-3 text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
        Po linijama
      </div>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((r) => (
          <SpeedRow key={r.routeId} r={r} />
        ))}
      </div>
    </div>
  )
}

function SpeedRow({ r }: { r: SpeedRouteComparison }) {
  const barPct = r.speedRatio !== null ? Math.min(r.speedRatio * 100, 150) : 0

  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="w-10 shrink-0 text-right font-mono text-[12px] font-medium text-slate-800 tabular-nums dark:text-slate-200">
        {r.routeId}
      </span>
      <div className="relative h-1.5 flex-1 rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="absolute top-0 left-[66.7%] h-full w-px bg-slate-300 dark:bg-slate-600" />
        <div
          className={`h-full rounded-full ${ratioBg(r.speedRatio)}`}
          style={{ width: `${Math.max(barPct / 1.5, 2)}%` }}
        />
      </div>
      <span className="w-28 text-right font-mono text-[11px] tabular-nums text-slate-600 dark:text-slate-400">
        {r.actualSpeedKmh !== null
          ? `${r.actualSpeedKmh.toFixed(1)}/${r.scheduledSpeedKmh.toFixed(1)}`
          : `—/${r.scheduledSpeedKmh.toFixed(1)}`}
      </span>
      <span className={`w-10 text-right font-mono text-[11px] font-medium tabular-nums ${ratioColor(r.speedRatio)}`}>
        {r.speedRatio !== null ? `${Math.round(r.speedRatio * 100)}%` : "—"}
      </span>
    </div>
  )
}
