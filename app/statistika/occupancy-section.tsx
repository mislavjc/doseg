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
    <section className="flex flex-col border-t border-slate-200 py-16 sm:py-24 dark:border-white/10">
      <h2 className="mb-12 font-serif text-[28px] tracking-tight text-slate-900 sm:text-[32px] dark:text-slate-100">
        Zauzetost vozila
      </h2>
      <div className="flex flex-col gap-12 lg:flex-row lg:items-start lg:gap-16">
        <div className="flex-1 space-y-6 text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
          <p>
            Razina popunjenosti vozila po liniji i satu iz GTFS-RT feeda.
            Prikazano ako ZET šalje podatke o popunjenosti.
          </p>
        </div>
        <div className="w-full lg:w-[600px] lg:shrink-0">
          <div className="flex flex-col">
            <Legend />
            <HeatmapGrid routes={data.routes} />
          </div>
        </div>
      </div>
    </section>
  )
}

function Legend() {
  return (
    <div className="mb-8 flex flex-wrap gap-6 text-[11px] font-medium tracking-widest text-slate-500 uppercase dark:text-slate-400">
      {Object.entries(LEVEL_COLORS).map(([key, val]) => (
        <div key={key} className="flex items-center gap-2">
          <div className="h-3 w-3 rounded" style={{ backgroundColor: val.bg }} />
          <span>{val.label}</span>
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
            <th className="w-14 pb-4 text-right font-medium tracking-widest text-slate-500 uppercase dark:text-slate-400">Linija</th>
            {SERVICE_HOURS.map((h) => (
              <th key={h} className="pb-4 text-center font-medium tracking-wider text-slate-400 dark:text-slate-500" style={{ minWidth: 24 }}>
                {h % 4 === 0 ? h : ""}
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
    <tr className="group">
      <td className="py-1 pr-4 text-right font-mono text-[13px] font-medium text-slate-600 dark:text-slate-300">
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
      <td className="p-[1px]">
        <div className="h-8 w-full rounded bg-slate-100 transition-colors group-hover:opacity-80 dark:bg-white/5" />
      </td>
    )
  }
  return (
    <td className="p-[1px]">
      <div
        className="relative h-8 w-full rounded transition-opacity group-hover:opacity-80"
        title={`${routeId} @ ${hour}:00 — prazno: ${data.empty}, malo mjesta: ${data.fewSeats}, stajaća: ${data.standing}, puno: ${data.full}`}
      >
        <div
          className="absolute inset-0 rounded"
          style={{ backgroundColor: dominantColor(data), opacity: cellOpacity(data) }}
        />
      </div>
    </td>
  )
}
