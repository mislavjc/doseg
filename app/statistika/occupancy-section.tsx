"use client"

import useSWR from "swr"

interface OccupancyRouteHour {
  hour: number
  empty: number
  fewSeats: number
  standing: number
  full: number
  total: number
}

interface OccupancyRoute {
  routeId: string
  mode: string
  hours: OccupancyRouteHour[]
}

interface OccupancyData {
  hasData: boolean
  routes: OccupancyRoute[]
}

const LEVEL_COLORS = {
  empty: { bg: "#22c55e", label: "Prazno" },
  fewSeats: { bg: "#facc15", label: "Malo mjesta" },
  standing: { bg: "#f97316", label: "Stajaća mjesta" },
  full: { bg: "#ef4444", label: "Puno" },
} as const

function dominantColor(h: OccupancyRouteHour): string {
  if (h.total === 0) return "#e2e8f0"
  const max = Math.max(h.empty, h.fewSeats, h.standing, h.full)
  if (max === h.full) return LEVEL_COLORS.full.bg
  if (max === h.standing) return LEVEL_COLORS.standing.bg
  if (max === h.fewSeats) return LEVEL_COLORS.fewSeats.bg
  return LEVEL_COLORS.empty.bg
}

function cellOpacity(h: OccupancyRouteHour): number {
  if (h.total === 0) return 0.15
  return Math.min(0.4 + (h.total / 20) * 0.6, 1)
}

export default function OccupancySection() {
  const { data } = useSWR<OccupancyData>("/api/rt/occupancy")

  // Auto-hide: don't render anything if no data
  if (!data || !data.hasData || data.routes.length === 0) return null

  return (
    <section className="mt-24">
      <h2 className="mb-2 font-serif text-[24px] text-slate-900 dark:text-slate-100">
        Zauzetost vozila
      </h2>
      <p className="mb-8 max-w-xl text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
        Razina popunjenosti vozila po liniji i satu iz GTFS-RT feeda.
        Prikazano ako ZET šalje podatke o popunjenosti.
      </p>

      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8 dark:bg-zinc-900/40 dark:ring-white/10">
        <Legend />
        <HeatmapGrid routes={data.routes} />
      </div>
    </section>
  )
}

function Legend() {
  return (
    <div className="mb-6 flex flex-wrap gap-4">
      {Object.entries(LEVEL_COLORS).map(([key, val]) => (
        <div key={key} className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded" style={{ backgroundColor: val.bg }} />
          <span className="text-[11px] text-slate-500 dark:text-slate-400">{val.label}</span>
        </div>
      ))}
    </div>
  )
}

const SERVICE_HOURS = Array.from({ length: 19 }, (_, i) => i + 5)

function HeatmapGrid({ routes }: { routes: OccupancyRoute[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr>
            <th className="w-14 pb-2 text-right font-medium text-slate-500 dark:text-slate-400">Linija</th>
            {SERVICE_HOURS.map((h) => (
              <th key={h} className="pb-2 text-center font-normal text-slate-400 dark:text-slate-500" style={{ minWidth: 24 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {routes.map((route) => (
            <HeatmapRow key={route.routeId} route={route} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HeatmapRow({ route }: { route: OccupancyRoute }) {
  const hourMap = new Map(route.hours.map((h) => [h.hour, h]))
  return (
    <tr>
      <td className="py-0.5 pr-2 text-right font-mono font-medium text-slate-700 dark:text-slate-300">
        {route.routeId}
      </td>
      {SERVICE_HOURS.map((h) => (
        <HeatmapCell key={h} routeId={route.routeId} hour={h} data={hourMap.get(h)} />
      ))}
    </tr>
  )
}

function HeatmapCell({ routeId, hour, data }: { routeId: string; hour: number; data?: OccupancyRouteHour }) {
  if (!data || data.total === 0) {
    return (
      <td className="p-0.5">
        <div className="mx-auto h-4 w-4 rounded-sm bg-slate-100 dark:bg-slate-800" />
      </td>
    )
  }
  return (
    <td className="p-0.5">
      <div
        className="mx-auto h-4 w-4 rounded-sm"
        style={{ backgroundColor: dominantColor(data), opacity: cellOpacity(data) }}
        title={`${routeId} @ ${hour}:00 — prazno: ${data.empty}, malo mjesta: ${data.fewSeats}, stajaća: ${data.standing}, puno: ${data.full}`}
      />
    </td>
  )
}
