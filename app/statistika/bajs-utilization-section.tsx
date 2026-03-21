"use client"

import useSWR from "swr"
import dynamic from "next/dynamic"
import { fmtHR } from "@/lib/format"
import BajsUsageChart from "./bajs-usage-chart"

const BajsStationMap = dynamic(() => import("./bajs-station-map"), { ssr: false })

interface BajsUtilizationData {
  totalStations: number
  activeStations: number
  totalCapacity: number
  totalBikesAvailable: number
  totalDocksAvailable: number
  bikesInUse: number
  utilizationPct: number
  knownFleet: number
  emptyStations: { name: string; stationId: string; capacity: number }[]
  fullStations: { name: string; stationId: string; capacity: number }[]
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

function MetricsCard({ data }: { data: BajsUtilizationData }) {
  const normal = data.activeStations - data.emptyStations.length - data.fullStations.length

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8 dark:bg-zinc-900/40 dark:ring-white/10">
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
          <Metric value={data.knownFleet ?? data.totalCapacity} label="ukupni bicikli" />
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <StatusBadge count={data.emptyStations.length} label="praznih" dotColor="bg-red-500" textColor="text-red-700 dark:text-red-400" bgColor="bg-red-50 dark:bg-red-950/20" />
        <StatusBadge count={data.fullStations.length} label="punih" dotColor="bg-amber-500" textColor="text-amber-700 dark:text-amber-400" bgColor="bg-amber-50 dark:bg-amber-950/20" />
        <StatusBadge count={normal} label="dostupnih" dotColor="bg-emerald-500" textColor="text-emerald-700 dark:text-emerald-400" bgColor="bg-emerald-50 dark:bg-emerald-950/20" />
      </div>
    </div>
  )
}

function UtilizationContent({ data }: { data: BajsUtilizationData }) {
  return (
    <div className="space-y-6">
      <MetricsCard data={data} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BajsStationMap />
        <BajsUsageChart />
      </div>
    </div>
  )
}

function StatusBadge({
  count,
  label,
  dotColor,
  textColor,
  bgColor,
}: {
  count: number
  label: string
  dotColor: string
  textColor: string
  bgColor: string
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium ${textColor} ${bgColor}`}>
      <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} />
      {count} {label}
    </span>
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
