"use client"

import useSWR from "swr"
import { Term } from "@/components/ui/term"

// --- Types ---

export interface ConnectivityGap {
  severity: "critical" | "warning"
  issue: string
  impact: string
  recommendation: string
}

interface RouteHealth {
  routeId: string
  mode: string
  avgDelay: number
  onTimePct: number
  headwayCv: number | null
  headwaySec: number | null
  severityScore: number
  label: "stable" | "moderate" | "unreliable" | "critical"
  samples: number
}

interface RouteHealthResponse {
  generatedAt: number
  routes: RouteHealth[]
}

// --- Component ---

export default function InsightsSection({
  connectivityGaps,
}: {
  connectivityGaps: ConnectivityGap[]
}) {
  const hasGaps = connectivityGaps.length > 0

  return (
    <section className="border-t border-slate-200 py-16 sm:py-24 dark:border-white/10">
      {hasGaps && (
        <>
          <div className="mb-12">
            <h2 className="font-serif text-[28px] tracking-tight text-slate-900 sm:text-[32px] dark:text-slate-100">
              Ključni nalazi
            </h2>
            <p className="mt-4 max-w-2xl text-[18px] leading-relaxed text-slate-700 dark:text-slate-300">
              Strukturni problemi u mreži i nedostatne veze.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {connectivityGaps.map((gap) => (
              <GapCard key={gap.issue} gap={gap} />
            ))}
          </div>
        </>
      )}

      <OperationalHealth />
    </section>
  )
}

// --- Structural gap cards ---

function GapCard({ gap }: { gap: ConnectivityGap }) {
  const isCritical = gap.severity === "critical"

  return (
    <div
      className={`flex flex-col gap-3 rounded-lg p-4 ${
        isCritical
          ? "bg-red-50 dark:bg-red-950/20"
          : "bg-amber-50 dark:bg-amber-950/20"
      }`}
    >
      <span
        className={`text-[11px] font-bold uppercase tracking-wider ${
          isCritical
            ? "text-red-600 dark:text-red-400"
            : "text-amber-600 dark:text-amber-400"
        }`}
      >
        {isCritical ? "Kritično" : "Upozorenje"}
      </span>
      <div className="text-[15px] font-medium leading-snug text-slate-900 dark:text-slate-100">
        {gap.issue}
      </div>
      <div className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">
        {gap.impact}
      </div>
      <div className="text-[13px] leading-relaxed text-slate-500 dark:text-slate-500">
        <strong className="font-medium text-slate-700 dark:text-slate-300">Preporuka:</strong>{" "}
        {gap.recommendation}
      </div>
    </div>
  )
}

// --- Operational health (RT data) ---

function modeLabel(mode: string): string {
  return mode === "TRAM" ? "Tramvaj" : mode === "BUS" ? "Bus" : mode
}

function formatDelay(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`
  const min = Math.floor(seconds / 60)
  const sec = Math.round(seconds % 60)
  return sec > 0 ? `${min} min ${sec} s` : `${min} min`
}

function OperationalHealth() {
  const { data } = useSWR<RouteHealthResponse>(
    "/api/rt/route-health",
    { refreshInterval: 60_000, keepPreviousData: true },
  )

  if (!data || data.routes.length === 0) return null

  const unreliable = data.routes.filter((r) => r.samples >= 10 && r.severityScore >= 45)
  if (unreliable.length === 0) return null

  return (
    <div className="mt-12">
      <div className="mb-6 font-sans text-[11px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
        Operativni problemi (zadnjih 24h)
      </div>
      <HealthTable routes={unreliable.slice(0, 8)} />
    </div>
  )
}

// --- Health table ---

function labelColor(label: string): string {
  switch (label) {
    case "stable": return "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40"
    case "moderate": return "text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40"
    case "unreliable": return "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/40"
    case "critical": return "text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-950/60"
    default: return "text-slate-600 bg-slate-50 dark:text-slate-400 dark:bg-slate-800"
  }
}

function labelText(label: string): string {
  switch (label) {
    case "stable": return "Stabilna"
    case "moderate": return "Umjerena"
    case "unreliable": return "Nepouzdana"
    case "critical": return "Kritična"
    default: return label
  }
}

function HealthTable({ routes }: { routes: RouteHealth[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] font-bold tracking-wider text-slate-500 uppercase dark:border-white/10 dark:text-slate-400">
            <th className="py-2 pr-3">Linija</th>
            <th className="py-2 pr-3">Stanje</th>
            <th className="py-2 pr-6 text-right">Na vrijeme</th>
            <th className="py-2 pr-6 text-right">Kašnjenje</th>
            <th className="py-2 pr-3 text-right"><Term title="Koeficijent varijacije razmaka — mjeri koliko pravilno dolaze vozila (niži = bolje)">Regularnost</Term></th>
            <th className="py-2 text-right">Ozbiljnost</th>
          </tr>
        </thead>
        <tbody>
          {routes.map((r) => (
            <HealthRow key={r.routeId} route={r} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HealthRow({ route: r }: { route: RouteHealth }) {
  return (
    <tr className="border-b border-slate-100 dark:border-white/5">
      <td className="py-2.5 pr-3">
        <span className="font-mono font-medium text-slate-900 dark:text-slate-100">{r.routeId}</span>
        <span className="ml-2 text-[11px] text-slate-400">{modeLabel(r.mode)}</span>
      </td>
      <td className="py-2.5 pr-3">
        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${labelColor(r.label)}`}>
          {labelText(r.label)}
        </span>
      </td>
      <td className={`py-2.5 pr-6 text-right font-mono tabular-nums ${r.onTimePct < 0.6 ? "text-red-600 dark:text-red-400" : r.onTimePct < 0.8 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
        {Math.round(r.onTimePct * 100)}%
      </td>
      <td className="py-2.5 pr-6 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
        {formatDelay(r.avgDelay)}
      </td>
      <td className={`py-2.5 pr-3 text-right font-mono tabular-nums ${r.headwayCv === null ? "text-slate-300 dark:text-slate-600" : r.headwayCv > 0.5 ? "text-red-600 dark:text-red-400" : r.headwayCv > 0.3 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
        {r.headwayCv !== null ? r.headwayCv.toFixed(2) : "\u2014"}
      </td>
      <td className="py-2.5 text-right">
        <SeverityBar score={r.severityScore} />
      </td>
    </tr>
  )
}

function SeverityBar({ score }: { score: number }) {
  const color =
    score >= 70 ? "bg-red-500" :
    score >= 45 ? "bg-amber-500" :
    score >= 20 ? "bg-sky-500" :
    "bg-emerald-500"
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="font-mono text-[12px] tabular-nums text-slate-500 dark:text-slate-400">
        {Math.round(score)}
      </span>
      <div className="h-2 w-16 rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
    </div>
  )
}
