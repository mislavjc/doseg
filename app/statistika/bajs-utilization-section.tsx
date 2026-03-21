"use client"

import useSWR from "swr"
import dynamic from "next/dynamic"
import { fmtHR } from "@/lib/format"
import BajsUsageChart from "./bajs-usage-chart"

const BajsStationMap = dynamic(() => import("./bajs-station-map"), { ssr: false })

interface BajsStationBrief {
  name: string
  stationId: string
  capacity: number
}

interface BajsUtilizationData {
  totalStations: number
  activeStations: number
  totalCapacity: number
  totalBikesAvailable: number
  totalDocksAvailable: number
  bikesInUse: number
  utilizationPct: number
  knownFleet: number
  emptyStations: BajsStationBrief[]
  fullStations: BajsStationBrief[]
}

function pctColor(pct: number): string {
  if (pct >= 60) return "text-emerald-600 dark:text-emerald-400"
  if (pct >= 30) return "text-amber-600 dark:text-amber-400"
  return "text-slate-500 dark:text-slate-400"
}

export default function BajsUtilizationSection() {
  const { data, error, isLoading } = useSWR<BajsUtilizationData>(
    "/api/rt/bajs-utilization",
    { refreshInterval: 60_000, keepPreviousData: true },
  )

  return (
    <section className="mt-24">
      <h2 className="mb-2 font-serif text-[24px] text-slate-900 dark:text-slate-100">
        BAJS iskorištenost
      </h2>
      <p className="mb-8 max-w-xl text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
        Trenutna iskorištenost BAJS sustava dijeljenih bicikala — koliko
        je bicikala u uporabi, te prazne i pune stanice.
      </p>

      {error && <p className="text-[13px] text-slate-500 dark:text-slate-400">{error.message}</p>}
      {isLoading && (
        <div className="flex h-40 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-lime-500" />
        </div>
      )}
      {data && <UtilizationContent data={data} />}
    </section>
  )
}

function UtilizationContent({ data }: { data: BajsUtilizationData }) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8 dark:bg-zinc-900/40 dark:ring-white/10">
        <MetricsRow data={data} />
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {data.emptyStations.length > 0 && (
            <StationList
              title="Prazne stanice"
              subtitle="0 bicikala"
              stations={data.emptyStations}
              color="text-red-600 dark:text-red-400"
              bgColor="bg-red-50 dark:bg-red-950/20"
            />
          )}
          {data.fullStations.length > 0 && (
            <StationList
              title="Pune stanice"
              subtitle="0 slobodnih mjesta"
              stations={data.fullStations}
              color="text-amber-600 dark:text-amber-400"
              bgColor="bg-amber-50 dark:bg-amber-950/20"
            />
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BajsStationMap />
        <BajsUsageChart />
      </div>
    </div>
  )
}

function MetricsRow({ data }: { data: BajsUtilizationData }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
      <div>
        <span className={`font-serif text-[36px] font-medium tabular-nums ${pctColor(data.utilizationPct)}`}>
          {fmtHR(data.utilizationPct, 1)}%
        </span>
        <span className="ml-2 text-[13px] text-slate-500 dark:text-slate-400">
          iskorištenost
        </span>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-slate-500 dark:text-slate-400">
        <Metric value={data.bikesInUse} label="u uporabi" />
        <Metric value={data.totalBikesAvailable} label="na stanicama" />
        <Metric value={data.activeStations} label="aktivnih stanica" />
        <Metric value={data.knownFleet ?? data.totalCapacity} label="ukupni bicikli" />
      </div>
    </div>
  )
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <span>
      <strong className="font-medium text-slate-700 dark:text-slate-300">
        {value.toLocaleString("hr-HR")}
      </strong>{" "}
      {label}
    </span>
  )
}

function StationList({
  title,
  subtitle,
  stations,
  color,
  bgColor,
}: {
  title: string
  subtitle: string
  stations: BajsStationBrief[]
  color: string
  bgColor: string
}) {
  return (
    <div className={`rounded-xl p-4 ${bgColor}`}>
      <div className="mb-1 text-[11px] font-bold tracking-widest uppercase text-slate-500 dark:text-slate-400">
        {title} ({stations.length})
      </div>
      <div className="mb-3 text-[11px] text-slate-400 dark:text-slate-500">{subtitle}</div>
      <div className="flex flex-wrap gap-1.5">
        {stations.map((s) => (
          <span
            key={s.stationId}
            className={`rounded bg-white/60 px-1.5 py-0.5 text-[10px] font-medium dark:bg-black/20 ${color}`}
          >
            {s.name}
          </span>
        ))}
      </div>
    </div>
  )
}
