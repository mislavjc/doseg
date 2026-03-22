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
    <section className="flex flex-col border-t border-slate-200 py-16 sm:py-24 dark:border-white/10">
      <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-serif text-[28px] tracking-tight text-slate-900 sm:text-[32px] dark:text-slate-100">
            BAJS iskorištenost
          </h2>
          <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
            Trenutna iskorištenost BAJS sustava dijeljenih bicikala — koliko
            je bicikala u uporabi, te prazne i pune stanice.
          </p>
        </div>
      </div>

      {error && <p className="text-[13px] text-slate-500 dark:text-slate-400">{error.message}</p>}
      {isLoading && !data && (
        <div className="flex h-40 items-center justify-center" role="status" aria-label="Učitavanje">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-lime-500" />
          <span className="sr-only">Učitavanje...</span>
        </div>
      )}
      {data && <UtilizationContent data={data} />}
    </section>
  )
}

function MetricsCard({ data }: { data: BajsUtilizationData }) {
  const normal = data.activeStations - data.emptyStations.length - data.fullStations.length

  return (
    <div className="flex flex-col gap-12 border-l-2 border-slate-200 pl-6 dark:border-white/10">
      <div className="flex flex-col gap-2">
        <div>
          <span className={`font-serif text-[48px] font-medium leading-none tabular-nums ${pctColor(data.utilizationPct)}`}>
            {fmtHR(data.utilizationPct, 1)}%
          </span>
        </div>
        <div className="text-[14px] text-slate-500 dark:text-slate-400">
          iskorištenost
        </div>
        <div className="mt-2 flex flex-col gap-3 text-[13px] text-slate-600 dark:text-slate-400">
          <Metric value={data.bikesInUse} label="u uporabi" />
          <Metric value={data.totalBikesAvailable} label="na stanicama" />
          <Metric value={data.knownFleet ?? data.totalCapacity} label="ukupni bicikli" />
        </div>
      </div>
      <div className="flex flex-col">
        <StatusBadge count={data.emptyStations.length} label="praznih" dotColor="bg-red-500" />
        <StatusBadge count={data.fullStations.length} label="punih" dotColor="bg-amber-500" />
        <StatusBadge count={normal} label="dostupnih" dotColor="bg-emerald-500" />
      </div>
    </div>
  )
}

function UtilizationContent({ data }: { data: BajsUtilizationData }) {
  return (
    <div className="flex flex-col gap-12 lg:flex-row lg:items-start lg:gap-16">
      <div className="flex-1 space-y-12">
        <MetricsCard data={data} />
      </div>
      <div className="w-full lg:w-[600px] lg:shrink-0">
        <div className="flex flex-col gap-12">
          <BajsUsageChart />
          <BajsStationMap />
        </div>
      </div>
    </div>
  )
}

function StatusBadge({
  count,
  label,
  dotColor,
}: {
  count: number
  label: string
  dotColor: string
}) {
  return (
    <div className={`flex items-center gap-3 border-b border-slate-100 py-3 last:border-0 dark:border-white/5`}>
      <div className="flex items-center gap-3">
        <span className={`inline-block h-3 w-3 rounded ${dotColor}`} />
        <span className="text-[14px] text-slate-700 dark:text-slate-300">{label}</span>
      </div>
      <span className="font-serif text-[15px] font-medium tabular-nums text-slate-900 dark:text-slate-100">
        {count}
      </span>
    </div>
  )
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <strong className="font-serif text-[18px] font-medium text-slate-900 dark:text-slate-100">
        {value.toLocaleString("hr-HR")}
      </strong>{" "}
      {label}
    </span>
  )
}
