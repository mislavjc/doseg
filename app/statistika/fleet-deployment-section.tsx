"use client"

import useSWR from "swr"

interface FleetRouteDeployment {
  routeId: string
  mode: string
  scheduledTrips: number
  activeTrips: number
  deploymentPct: number
}

interface FleetDeploymentData {
  routes: FleetRouteDeployment[]
  totalScheduled: number
  totalActive: number
  totalDeploymentPct: number
}

function pctColor(pct: number): string {
  if (pct >= 90) return "text-emerald-600 dark:text-emerald-400"
  if (pct >= 50) return "text-amber-600 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}

function pctBg(pct: number): string {
  if (pct >= 90) return "bg-emerald-500"
  if (pct >= 50) return "bg-amber-500"
  return "bg-red-500"
}

// --- Main component ---

export default function FleetDeploymentSection() {
  const { data, error, isLoading } = useSWR<FleetDeploymentData>(
    "/api/rt/fleet-deployment",
    { refreshInterval: 30_000, keepPreviousData: true },
  )

  return (
    <section className="mt-24">
      <h2 className="mb-2 font-serif text-[24px] text-slate-900 dark:text-slate-100">
        GTFS-RT pokrivenost
      </h2>
      <p className="mb-8 max-w-xl text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
        Koliko planiranih polazaka šalje podatke u stvarnom vremenu putem
        GTFS-RT feeda. Nizak postotak znači da ZET ne objavljuje RT podatke
        za sve linije, ne da vozila ne voze.
      </p>
      {error && !data && <p className="text-[13px] text-slate-500 dark:text-slate-400">Podaci nisu dostupni</p>}
      {isLoading && (
        <div className="flex h-40 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-500" />
        </div>
      )}
      {data && !error && <FleetContent data={data} />}
    </section>
  )
}

// --- Content ---

function FleetContent({ data }: { data: FleetDeploymentData }) {
  const withSignal = data.routes.filter((r) => r.activeTrips > 0)
  const withoutSignal = data.routes.filter((r) => r.activeTrips === 0 && r.scheduledTrips > 0)

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8 dark:bg-zinc-900/40 dark:ring-white/10">
      <SummaryRow data={data} withSignal={withSignal.length} withoutSignal={withoutSignal.length} />
      {withSignal.length > 0 && <ActiveRoutesTable routes={withSignal} />}
      {withoutSignal.length > 0 && <SilentRoutesList routes={withoutSignal} />}
    </div>
  )
}

function SummaryRow({ data, withSignal, withoutSignal }: {
  data: FleetDeploymentData
  withSignal: number
  withoutSignal: number
}) {
  return (
    <div className="mb-6 flex flex-wrap items-baseline gap-x-8 gap-y-2">
      <div>
        <span className={`font-serif text-[36px] font-medium tabular-nums ${pctColor(data.totalDeploymentPct)}`}>
          {Math.round(data.totalDeploymentPct)}%
        </span>
        <span className="ml-2 text-[13px] text-slate-500 dark:text-slate-400">
          ukupno ({data.totalActive}/{data.totalScheduled} polazaka)
        </span>
      </div>
      <div className="flex gap-4 text-[12px] text-slate-500 dark:text-slate-400">
        <span><strong className="font-medium text-slate-700 dark:text-slate-300">{withSignal}</strong> linija s RT signalom</span>
        <span><strong className="font-medium text-slate-700 dark:text-slate-300">{withoutSignal}</strong> bez signala</span>
      </div>
    </div>
  )
}

// --- Active routes table ---

function ActiveRoutesTable({ routes }: { routes: FleetRouteDeployment[] }) {
  const sorted = [...routes].sort((a, b) => b.deploymentPct - a.deploymentPct)
  return (
    <div>
      <div className="mb-3 text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
        Linije s RT signalom
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {sorted.map((r) => (
          <ActiveRouteItem key={r.routeId} r={r} />
        ))}
      </div>
    </div>
  )
}

function ActiveRouteItem({ r }: { r: FleetRouteDeployment }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-10 shrink-0 text-right font-mono text-[12px] font-medium text-slate-800 tabular-nums dark:text-slate-200">
        {r.routeId}
      </span>
      <div className="h-1.5 flex-1 rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-full rounded-full ${pctBg(r.deploymentPct)}`}
          style={{ width: `${Math.max(r.deploymentPct, 2)}%` }}
        />
      </div>
      <span className={`w-12 text-right font-mono text-[11px] font-medium tabular-nums ${pctColor(r.deploymentPct)}`}>
        {r.activeTrips}/{r.scheduledTrips}
      </span>
    </div>
  )
}

// --- Silent routes ---

function SilentRoutesList({ routes }: { routes: FleetRouteDeployment[] }) {
  return (
    <div className="mt-6 border-t border-slate-100 pt-4 dark:border-slate-800">
      <div className="mb-2 text-[11px] font-bold tracking-widest text-slate-400 uppercase dark:text-slate-500">
        Bez RT signala ({routes.length} linija)
      </div>
      <div className="flex flex-wrap gap-1.5">
        {routes.map((r) => (
          <span key={r.routeId} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            {r.routeId}
          </span>
        ))}
      </div>
    </div>
  )
}
