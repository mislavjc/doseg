"use client"

import { useId, useState } from "react"
import type { RouteStatsRoute as RouteInfo } from "@/lib/generated"
import { fmtHR } from "@/lib/format"

const INITIAL_VISIBLE = 12

export default function RouteAnalysisTables({
  trams,
  buses,
}: {
  trams: RouteInfo[]
  buses: RouteInfo[]
}) {
  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
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

const COLUMNS = ["Linija", "Polasci", "Brzina", "Takt", "Vožnja"] as const
const TH_CLASS = "pb-4 pr-4 font-mono text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400"

function RouteTableHead() {
  return (
    <thead>
      <tr className="border-b-2 border-slate-100 dark:border-white/10">
        {COLUMNS.map((col, i) => (
          <th
            key={col}
            scope="col"
            className={i === COLUMNS.length - 1 ? `${TH_CLASS} text-right !pr-0` : TH_CLASS}
          >
            {col}
          </th>
        ))}
      </tr>
    </thead>
  )
}

function ExpandableRouteTable({ title, routes, mode }: { title: string; routes: RouteInfo[]; mode: "TRAM" | "BUS" }) {
  const [expanded, setExpanded] = useState(false)
  const tableId = useId().replace(/:/g, "")
  const regionId = `route-table-${mode}-${tableId}`
  const needsToggle = routes.length > INITIAL_VISIBLE
  const visible = expanded ? routes : routes.slice(0, INITIAL_VISIBLE)

  return (
    <div className="flex flex-col">
      <h3 className="mb-6 font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
        {title}
      </h3>
      <div className={needsToggle && !expanded ? "relative max-h-[min(28rem,70vh)] overflow-hidden" : "relative"}>
        <div className="overflow-x-auto">
          <table id={regionId} className="w-full text-left" aria-label={title}>
            <RouteTableHead />
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {visible.map((r) => <RouteRow key={`${mode}-${r.name}`} route={r} />)}
            </tbody>
          </table>
        </div>
        {needsToggle && !expanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--color-page-bg,#F6F5F2)] to-transparent dark:from-background" aria-hidden />
        )}
      </div>
      {needsToggle && (
        <button
          type="button"
          className="mt-4 self-start rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-zinc-900/40 dark:text-slate-200 dark:hover:border-white/20 dark:hover:bg-white/5"
          aria-expanded={expanded}
          aria-controls={regionId}
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? "Suzi prikaz" : `Prikaži sve linije (${routes.length} ukupno)`}
        </button>
      )}
    </div>
  )
}

function RouteRow({ route }: { route: RouteInfo }) {
  const isTram = route.mode === "TRAM"
  const colorClass = isTram
    ? "bg-blue-100/50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
    : "bg-amber-100/50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"

  return (
    <tr className="group transition-colors hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
      <td className="py-4 pr-4">
        <span
          className={`inline-flex items-center justify-center rounded px-2.5 py-1 font-mono text-[13px] font-medium tabular-nums ${colorClass}`}
        >
          {route.name}
        </span>
      </td>
      <td className="py-4 pr-4 font-mono text-[14px] text-slate-600 tabular-nums dark:text-slate-400">
        {route.dailyDepartures.toLocaleString("hr-HR")}{" "}
        <span className="text-[12px] text-slate-400 dark:text-slate-500">
          · {fmtHR(route.depPerHour, 1)}/h
        </span>
      </td>
      <td className="py-4 pr-4 font-mono text-[14px] text-slate-700 tabular-nums dark:text-slate-300">
        {fmtHR(route.commercialSpeedKmh, 1)}{" "}
        <span className="text-[12px] text-slate-400 dark:text-slate-500">km/h</span>
      </td>
      <td className="py-4 pr-4 font-mono text-[14px] text-slate-700 tabular-nums dark:text-slate-300">
        {route.avgHeadwayMin != null ? (
          <>
            ~{fmtHR(route.avgHeadwayMin, 1)}{" "}
            <span className="text-[12px] text-slate-400 dark:text-slate-500">min</span>
          </>
        ) : (
          <span className="text-slate-400 dark:text-slate-500">—<span className="sr-only">Nije dostupno</span></span>
        )}
      </td>
      <td className="py-4 text-right font-mono text-[14px] text-slate-600 tabular-nums dark:text-slate-400">
        {route.travelTimeMin}{" "}
        <span className="text-[12px] text-slate-400 dark:text-slate-500">min</span>
      </td>
    </tr>
  )
}
