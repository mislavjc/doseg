"use client"

import useSWR from "swr"
import { StatModuleTitle, StatProse } from "./stat-typography"

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
    { refreshInterval: 30_000, keepPreviousData: true }
  )

  return (
    <section className="flex flex-col border-t border-slate-200 py-16 sm:py-24 dark:border-white/10">
      <StatModuleTitle className="mb-12">
        Pokrivenost flote u stvarnom vremenu
      </StatModuleTitle>
      <div className="flex flex-col gap-12">
        <StatProse className="flex-1 text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
          <p>
            Koliko planiranih polazaka trenutačno šalje podatke o poziciji
            vozila? Nizak postotak znači da ZET ne prati sve linije u stvarnom
            vremenu (čest problem s neopremljenim autobusima), a ne nužno da
            vozila ne voze.
          </p>
        </StatProse>
        <div className="w-full">
          {error && !data && (
            <p className="text-[13px] text-slate-500 dark:text-slate-400">
              Podaci nisu dostupni
            </p>
          )}
          {isLoading && !data && (
            <div
              className="flex h-40 items-center justify-center"
              role="status"
              aria-label="Učitavanje"
            >
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-500" />
              <span className="sr-only">Učitavanje...</span>
            </div>
          )}
          {data && <FleetContent data={data} />}
        </div>
      </div>
    </section>
  )
}

// --- Content ---

function FleetContent({ data }: { data: FleetDeploymentData }) {
  const withSignal = data.routes.filter((r) => r.activeTrips > 0)
  const withoutSignal = data.routes.filter(
    (r) => r.activeTrips === 0 && r.scheduledTrips > 0
  )

  return (
    <div className="flex flex-col">
      <SummaryRow
        data={data}
        withSignal={withSignal.length}
        withoutSignal={withoutSignal.length}
      />
      {withSignal.length > 0 && <ActiveRoutesTable routes={withSignal} />}
      {withoutSignal.length > 0 && <SilentRoutesList routes={withoutSignal} />}
    </div>
  )
}

function SummaryRow({
  data,
  withSignal,
  withoutSignal,
}: {
  data: FleetDeploymentData
  withSignal: number
  withoutSignal: number
}) {
  return (
    <div className="flex flex-col gap-2 border-l-2 border-slate-200 pl-6 dark:border-white/10">
      <div>
        <span
          className={`font-sans text-[48px] leading-none font-medium tracking-tight tabular-nums ${pctColor(data.totalDeploymentPct)}`}
        >
          {Math.round(data.totalDeploymentPct)}%
        </span>
      </div>
      <div className="text-[15px] text-slate-500 dark:text-slate-400">
        ukupno pokriveno ({data.totalActive} / {data.totalScheduled} polazaka)
      </div>
      <div className="mt-2 flex gap-6 text-[13px] text-slate-600 dark:text-slate-400">
        <span className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          <strong className="font-medium text-slate-900 dark:text-slate-100">
            {withSignal}
          </strong>{" "}
          s RT signalom
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />
          <strong className="font-medium text-slate-900 dark:text-slate-100">
            {withoutSignal}
          </strong>{" "}
          bez signala
        </span>
      </div>
    </div>
  )
}

// --- Active routes table ---

function ActiveRoutesTable({ routes }: { routes: FleetRouteDeployment[] }) {
  const sorted = [...routes].sort((a, b) => b.deploymentPct - a.deploymentPct)
  return (
    <div className="mt-8 border-t border-slate-100 pt-6 dark:border-white/5">
      <div className="mb-4 text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
        Linije s RT signalom
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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
      <span className="w-10 shrink-0 text-right font-mono text-[13px] font-medium text-slate-800 tabular-nums dark:text-slate-200">
        {r.routeId}
      </span>
      <div className="h-1.5 flex-1 rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-full rounded-full ${pctBg(r.deploymentPct)}`}
          style={{ width: `${Math.max(r.deploymentPct, 2)}%` }}
        />
      </div>
      <span
        className={`w-12 text-right font-mono text-[11px] font-medium tabular-nums ${pctColor(r.deploymentPct)}`}
      >
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
          <span
            key={r.routeId}
            className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-400 dark:bg-slate-800 dark:text-slate-500"
          >
            {r.routeId}
          </span>
        ))}
      </div>
    </div>
  )
}
