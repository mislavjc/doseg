"use client"

import { useId, useState } from "react"
import type { RouteStatsRoute as RouteInfo } from "@/lib/generated"
import { fmtHR } from "@/lib/format"
import { plural } from "@/app/linije/copy"

const INITIAL_VISIBLE = 5

export default function RouteAnalysisTables({
  trams,
  buses,
}: {
  trams: Array<RouteInfo>
  buses: Array<RouteInfo>
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
        <th
          scope="col"
          className="pr-8 pb-4 text-left text-body text-ink-faint"
        >
          Linija
        </th>
        <th
          scope="col"
          className="pr-8 pb-4 text-left text-body text-ink-faint"
        >
          Stanica
        </th>
        <th
          scope="col"
          className="pr-8 pb-4 text-left text-body text-ink-faint"
        >
          Udaljenost
        </th>
        <th
          scope="col"
          className="pr-8 pb-4 text-left text-body text-ink-faint"
        >
          Polasci
        </th>
        <th
          scope="col"
          className="pr-8 pb-4 text-left text-body text-ink-faint"
        >
          Brzina
        </th>
        <th
          scope="col"
          className="pr-8 pb-4 text-left text-body text-ink-faint"
        >
          Vožnja
        </th>
        <th scope="col" className="pb-4 text-left text-body text-ink-faint">
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
  routes: Array<RouteInfo>
  mode: "TRAM" | "BUS"
}) {
  const [expanded, setExpanded] = useState(false)
  const tableId = useId().replaceAll(":", "")
  const regionId = `route-table-${mode}-${tableId}`
  const needsToggle = routes.length > INITIAL_VISIBLE
  const visible = expanded ? routes : routes.slice(0, INITIAL_VISIBLE)

  return (
    <div className="flex flex-col">
      <div className="mb-8 flex items-baseline gap-3">
        <h3 className="font-mono text-label font-bold text-ink-muted">
          {title}
        </h3>
        <span className="font-mono text-label text-ink-faint tabular-nums">
          {routes.length} {plural(routes.length, "linija", "linije", "linija")}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table
          id={regionId}
          className="w-full min-w-[600px]"
          aria-label={title}
        >
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
          className="mt-6 self-start border border-hairline-strong bg-white px-5 py-2.5 text-body text-ink-2 transition-[transform,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-hairline-strong hover:text-ink active:scale-[0.98]"
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

function headwayStatus(headway: number | null) {
  if (headway === null) {
    return { dot: "", text: "-", color: "text-ink-faint" }
  }
  if (headway <= 8) {
    return {
      dot: "bg-zg-blue",
      text: `~${Math.round(headway)} min`,
      color: "text-zg-blue",
    }
  }
  if (headway <= 15) {
    return {
      dot: "bg-zg-blue",
      text: `~${Math.round(headway)} min`,
      color: "text-ink-2",
    }
  }
  if (headway <= 30) {
    return {
      dot: "bg-ink-ghost",
      text: `~${Math.round(headway)} min`,
      color: "text-ink-muted",
    }
  }
  return {
    dot: "bg-ink-2",
    text: `~${Math.round(headway)} min`,
    color: "text-ink",
  }
}

function RouteRow({ route }: { route: RouteInfo }) {
  const isTram = route.mode === "TRAM"
  const hw = headwayStatus(route.avgHeadwayMin)

  return (
    <tr className="even:bg-surface">
      <td className="py-3 pr-8">
        <span
          className={`inline-flex min-w-[2.5rem] items-center justify-center px-2.5 py-1 text-head font-bold tabular-nums ${
            isTram ? "bg-blue-wash text-zg-blue" : "bg-surface text-ink-muted"
          }`}
        >
          {route.name}
        </span>
      </td>
      <td className="py-3 pr-8 text-body text-ink-2 tabular-nums">
        {route.stops}
      </td>
      <td className="py-3 pr-8 text-body text-ink-2">
        {fmtHR(route.distanceKm, 1)}
        <span className="ml-1.5 inline-flex bg-track px-1.5 py-0.5 font-mono text-label text-ink-muted">
          km
        </span>
      </td>
      <td className="py-3 pr-8 text-body text-ink-2 tabular-nums">
        {route.dailyDepartures.toLocaleString("hr-HR")}
        <span className="ml-1.5 text-body text-ink-faint">
          {fmtHR(route.depPerHour, 1)}/h
        </span>
      </td>
      <td className="py-3 pr-8 text-body text-ink-2 tabular-nums">
        {fmtHR(route.commercialSpeedKmh, 1)}
        <span className="ml-1.5 text-body text-ink-faint">km/h</span>
      </td>
      <td className="py-3 pr-8 text-body text-ink-2 tabular-nums">
        {route.travelTimeMin}
        <span className="ml-1.5 text-body text-ink-faint">min</span>
      </td>
      <td className={`py-3 text-body ${hw.color}`}>
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
