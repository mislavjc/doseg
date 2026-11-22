"use client"

import useSWR from "swr"
import { StatModuleTitle, StatProse } from "./stat-typography"
import { plural } from "@/app/linije/copy"

interface FleetRouteDeployment {
  routeId: string
  mode: string
  scheduledTrips: number
  activeTrips: number
  deploymentPct: number
}

interface FleetDeploymentData {
  routes: Array<FleetRouteDeployment>
  totalScheduled: number
  totalActive: number
  totalDeploymentPct: number
}

function pctColor(pct: number): string {
  if (pct >= 90) {
    return "text-zg-blue"
  }
  if (pct >= 50) {
    return "text-ink-muted"
  }
  return "text-ink"
}

function pctBg(pct: number): string {
  if (pct >= 90) {
    return "bg-zg-blue"
  }
  if (pct >= 50) {
    return "bg-ink-ghost"
  }
  return "bg-ink-2"
}

// --- Main component ---

export default function FleetDeploymentSection() {
  const { data, error, isLoading } = useSWR<FleetDeploymentData, Error>(
    "/api/rt/fleet-deployment",
    { refreshInterval: 30_000, keepPreviousData: true }
  )

  return (
    <section className="flex flex-col border-t border-hairline-strong py-16 sm:py-24">
      <StatModuleTitle className="mb-12">
        Pokrivenost flote u stvarnom vremenu
      </StatModuleTitle>
      <div className="flex flex-col gap-12">
        <StatProse className="flex-1 text-body text-ink-2">
          <p>
            Koliko planiranih polazaka trenutačno šalje podatke o poziciji
            vozila? Nizak postotak znači da ZET ne prati sve linije u stvarnom
            vremenu (čest problem s neopremljenim autobusima), a ne nužno da
            vozila ne voze.
          </p>
        </StatProse>
        <div className="w-full">
          {error && !data && (
            <p className="text-body text-ink-muted">Podaci nisu dostupni</p>
          )}
          {isLoading && !data && (
            <div
              className="flex h-40 items-center justify-center"
              role="status"
              aria-label="Učitavanje"
            >
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-hairline-strong border-t-zg-blue" />
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
    <div className="flex flex-col gap-2 border-l-2 border-hairline-strong pl-6">
      <div>
        <span
          className={`font-sans text-head font-bold tabular-nums ${pctColor(data.totalDeploymentPct)}`}
        >
          {Math.round(data.totalDeploymentPct)}%
        </span>
      </div>
      <div className="text-body text-ink-muted">
        ukupno pokriveno ({data.totalActive} / {data.totalScheduled} polazaka)
      </div>
      <div className="mt-2 flex gap-6 text-body text-ink-2">
        <span className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-zg-blue" />
          <strong className="font-medium text-ink">{withSignal}</strong> s RT
          signalom
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-ink-ghost" />
          <strong className="font-medium text-ink">{withoutSignal}</strong> bez
          signala
        </span>
      </div>
    </div>
  )
}

// --- Active routes table ---

function ActiveRoutesTable({
  routes,
}: {
  routes: Array<FleetRouteDeployment>
}) {
  const sorted = routes.toSorted((a, b) => b.deploymentPct - a.deploymentPct)
  return (
    <div className="mt-8 border-t border-hairline pt-6">
      <div className="mb-4 font-mono text-label font-bold text-ink-muted">
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
      <span className="w-10 shrink-0 text-right font-mono text-label text-ink tabular-nums">
        {r.routeId}
      </span>
      <div className="h-1.5 flex-1 bg-track">
        <div
          className={`h-full ${pctBg(r.deploymentPct)}`}
          style={{ width: `${Math.max(r.deploymentPct, 2)}%` }}
        />
      </div>
      <span
        className={`w-12 text-right font-mono text-label tabular-nums ${pctColor(r.deploymentPct)}`}
      >
        {r.activeTrips}/{r.scheduledTrips}
      </span>
    </div>
  )
}

// --- Silent routes ---

function SilentRoutesList({ routes }: { routes: Array<FleetRouteDeployment> }) {
  return (
    <div className="mt-6 border-t border-hairline pt-4">
      <div className="mb-2 font-mono text-label font-bold text-ink-faint">
        Bez RT signala ({routes.length}{" "}
        {plural(routes.length, "linija", "linije", "linija")})
      </div>
      <div className="flex flex-wrap gap-1.5">
        {routes.map((r) => (
          <span
            key={r.routeId}
            className="bg-track px-1.5 py-0.5 font-mono text-label text-ink-faint"
          >
            {r.routeId}
          </span>
        ))}
      </div>
    </div>
  )
}
