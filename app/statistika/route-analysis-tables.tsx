"use client"

import { useId, useState } from "react"
import type { RouteStatsRoute as RouteInfo } from "@/lib/generated"
import { fmtHR } from "@/lib/format"

const INITIAL_VISIBLE = 5

export default function RouteAnalysisTables({
  trams,
  buses,
}: {
  trams: RouteInfo[]
  buses: RouteInfo[]
}) {
  return (
    <div className="flex flex-col gap-16">
      <ExpandableRouteTable
        title="Tramvajske linije"
        routes={trams}
        mode="TRAM"
      />
      <ExpandableRouteTable
        title="Autobusne linije"
        routes={buses}
        mode="BUS"
      />
    </div>
  )
}

function RouteTableHead() {
  return (
    <thead>
      <tr>
        <th scope="col" className="pb-4 pr-8 text-left text-[13px] font-medium text-slate-400 dark:text-slate-500">
          Linija
        </th>
        <th scope="col" className="pb-4 pr-8 text-left text-[13px] font-medium text-slate-400 dark:text-slate-500">
          Stanica
        </th>
        <th scope="col" className="pb-4 pr-8 text-left text-[13px] font-medium text-slate-400 dark:text-slate-500">
          Udaljenost
        </th>
        <th scope="col" className="pb-4 pr-8 text-left text-[13px] font-medium text-slate-400 dark:text-slate-500">
          Polasci
        </th>
        <th scope="col" className="pb-4 pr-8 text-left text-[13px] font-medium text-slate-400 dark:text-slate-500">
          Brzina
        </th>
        <th scope="col" className="pb-4 pr-8 text-left text-[13px] font-medium text-slate-400 dark:text-slate-500">
          Vožnja
        </th>
        <th scope="col" className="pb-4 text-left text-[13px] font-medium text-slate-400 dark:text-slate-500">
          Interval
        </th>
      </tr>
    </thead>
  )
}

function ExpandableRouteTable({
  title,
  routes,
  mode,
}: {
  title: string
  routes: RouteInfo[]
  mode: "TRAM" | "BUS"
}) {
  const [expanded, setExpanded] = useState(false)
  const tableId = useId().replace(/:/g, "")
  const regionId = `route-table-${mode}-${tableId}`
  const needsToggle = routes.length > INITIAL_VISIBLE
  const visible = expanded ? routes : routes.slice(0, INITIAL_VISIBLE)

  return (
    <div className="flex flex-col">
      <div className="mb-8 flex items-baseline gap-3">
        <h3 className="font-sans text-[13px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
          {title}
        </h3>
        <span className="font-sans text-[13px] tabular-nums text-slate-400 dark:text-slate-500">
          {routes.length} linija
        </span>
      </div>
      <div className="overflow-x-auto">
        <table id={regionId} className="w-full min-w-[600px]" aria-label={title}>
          <RouteTableHead />
          <tbody>
            {visible.map((r) => (
              <RouteRow key={`${mode}-${r.name}`} route={r} />
            ))}
          </tbody>
        </table>
      </div>
      {needsToggle && (
        <button
          type="button"
          className="mt-6 self-start rounded-full border border-slate-200 bg-white px-5 py-2.5 text-[13px] font-medium text-slate-600 transition-[transform,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-slate-300 hover:text-slate-900 active:scale-[0.98] dark:border-white/10 dark:bg-zinc-900/40 dark:text-slate-300 dark:hover:border-white/20"
          aria-expanded={expanded}
          aria-controls={regionId}
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded
            ? "Suzi prikaz"
            : `Prikaži sve linije (${routes.length} ukupno)`}
        </button>
      )}
    </div>
  )
}

function headwayStatus(headway: number | null): {
  dot: string
  text: string
  color: string
} {
  if (headway == null) return { dot: "", text: "—", color: "text-slate-300 dark:text-slate-600" }
  if (headway <= 8)
    return {
      dot: "bg-emerald-500",
      text: `~${Math.round(headway)} min`,
      color: "text-emerald-600 dark:text-emerald-400",
    }
  if (headway <= 15)
    return {
      dot: "bg-emerald-500",
      text: `~${Math.round(headway)} min`,
      color: "text-slate-700 dark:text-slate-300",
    }
  if (headway <= 30)
    return {
      dot: "bg-amber-400",
      text: `~${Math.round(headway)} min`,
      color: "text-amber-600 dark:text-amber-400",
    }
  return {
    dot: "bg-red-500",
    text: `~${Math.round(headway)} min`,
    color: "text-red-600 dark:text-red-400",
  }
}

function RouteRow({ route }: { route: RouteInfo }) {
  const isTram = route.mode === "TRAM"
  const hw = headwayStatus(route.avgHeadwayMin)

  return (
    <tr className="even:bg-slate-50/70 dark:even:bg-white/[0.02]">
      {/* Line name */}
      <td className="py-3 pr-8">
        <span
          className={`inline-flex min-w-[2.5rem] items-center justify-center rounded-md px-2.5 py-1 text-[15px] font-semibold tabular-nums ${
            isTram
              ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
              : "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
          }`}
        >
          {route.name}
        </span>
      </td>
      {/* Stops */}
      <td className="py-3 pr-8 text-[15px] tabular-nums text-slate-700 dark:text-slate-300">
        {route.stops}
      </td>
      {/* Distance */}
      <td className="py-3 pr-8 text-[15px] text-slate-700 dark:text-slate-300">
        {fmtHR(route.distanceKm, 1)}
        <span className="ml-1.5 inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-slate-500 uppercase dark:bg-white/5 dark:text-slate-400">
          km
        </span>
      </td>
      {/* Daily departures */}
      <td className="py-3 pr-8 text-[15px] tabular-nums text-slate-700 dark:text-slate-300">
        {route.dailyDepartures.toLocaleString("hr-HR")}
        <span className="ml-1.5 text-[13px] text-slate-400 dark:text-slate-500">
          {fmtHR(route.depPerHour, 1)}/h
        </span>
      </td>
      {/* Speed */}
      <td className="py-3 pr-8 text-[15px] tabular-nums text-slate-700 dark:text-slate-300">
        {fmtHR(route.commercialSpeedKmh, 1)}
        <span className="ml-1.5 text-[13px] text-slate-400 dark:text-slate-500">
          km/h
        </span>
      </td>
      {/* Travel time */}
      <td className="py-3 pr-8 text-[15px] tabular-nums text-slate-600 dark:text-slate-400">
        {route.travelTimeMin}
        <span className="ml-1.5 text-[13px] text-slate-400 dark:text-slate-500">
          min
        </span>
      </td>
      {/* Headway — status style */}
      <td className={`py-3 text-[15px] font-medium ${hw.color}`}>
        {hw.dot ? (
          <span className="inline-flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 shrink-0 rounded-full ${hw.dot}`}
              aria-hidden
            />
            {hw.text}
          </span>
        ) : (
          <span>{hw.text}</span>
        )}
      </td>
    </tr>
  )
}
