"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { Term } from "@/components/ui/term"
import { cn } from "@/lib/utils"
import { StatModuleTitle } from "./stat-typography"

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
          <div className="mb-8">
            <StatModuleTitle className="text-lg sm:text-xl">
              Ključni nalazi
            </StatModuleTitle>
          </div>

          <KeyFindingsCarousel
            key={connectivityGaps.map((g) => g.issue).join("|")}
            gaps={connectivityGaps}
          />

          <div className="mt-6">
            <a
              href="#preporuke"
              className="text-[13px] font-medium text-[#FF6B4A] hover:text-[#FF8B6A] dark:text-[#FF8B6A] dark:hover:text-[#FFA08A]"
            >
              Vidi sve preporuke &rarr;
            </a>
          </div>
        </>
      )}

      <OperationalHealth />
    </section>
  )
}

// --- Key findings horizontal carousel ---

function KeyFindingsCarousel({ gaps }: { gaps: ConnectivityGap[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const GAP = 12
  const PEEK = 48

  const measure = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    const maxScroll = scrollWidth - clientWidth
    setCanScrollRight(maxScroll > 6 && scrollLeft < maxScroll - 6)

    const pad = Number.parseFloat(getComputedStyle(el).paddingLeft) || 0
    const children = [...el.children] as HTMLElement[]
    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < children.length; i++) {
      const dist = Math.abs(children[i].offsetLeft - pad - scrollLeft)
      if (dist < bestDist) {
        bestDist = dist
        best = i
      }
    }
    setActive(best)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const cardW =
      gaps.length <= 1 ? el.clientWidth : el.clientWidth - PEEK - GAP
    el.style.setProperty("--card-w", `${Math.round(cardW)}px`)
    measure()
  }, [gaps.length, measure])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener("scroll", measure, { passive: true })
    const ro = new ResizeObserver(() => {
      const cardW =
        gaps.length <= 1 ? el.clientWidth : el.clientWidth - PEEK - GAP
      el.style.setProperty("--card-w", `${Math.round(cardW)}px`)
      measure()
    })
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", measure)
      ro.disconnect()
    }
  }, [gaps.length, measure])

  const scrollToIndex = (i: number) => {
    const el = scrollRef.current
    const child = el?.children[i] as HTMLElement | undefined
    child?.scrollIntoView({
      behavior: "smooth",
      inline: "start",
      block: "nearest",
    })
  }

  return (
    <div className="relative">
      {canScrollRight && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-linear-to-l from-white via-white/60 to-transparent dark:from-zinc-950 dark:via-zinc-950/60"
        />
      )}
      <div
        ref={scrollRef}
        style={{ gap: GAP }}
        className="scrollbar-hide flex snap-x snap-mandatory items-stretch overflow-x-auto pb-4"
      >
        {gaps.map((gap, i) => (
          <div
            key={gap.issue}
            className="flex shrink-0 snap-start"
            style={{ width: "var(--card-w)" }}
          >
            <GapCard gap={gap} index={i + 1} />
          </div>
        ))}
      </div>
      {gaps.length > 1 && (
        <div
          className="mt-1 flex justify-center gap-2"
          role="tablist"
          aria-label="Nalazi"
        >
          {gaps.map((gap, i) => (
            <button
              key={gap.issue}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={`Nalaz ${i + 1}`}
              onClick={() => scrollToIndex(i)}
              className={cn(
                "h-2 rounded-full transition-[width,background-color] duration-200 ease-out",
                i === active
                  ? "w-6 bg-slate-800 dark:bg-slate-200"
                  : "w-2 bg-slate-300 hover:bg-slate-400 dark:bg-slate-600 dark:hover:bg-slate-500"
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// --- Structural gap cards ---

function GapCard({ gap, index }: { gap: ConnectivityGap; index: number }) {
  const isCritical = gap.severity === "critical"

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 rounded-[12px] bg-[#f9f9f9] p-5 dark:bg-[#1a1a1a]">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
            isCritical
              ? "border-red-200 text-red-600 dark:border-red-900/50 dark:text-red-400"
              : "border-slate-200 text-slate-500 dark:border-white/10 dark:text-slate-400"
          }`}
        >
          {isCritical ? "Kritično" : "Upozorenje"}
        </span>
        <span className="text-[13px] text-slate-500 dark:text-slate-400">
          Nalaz {index < 10 ? `0${index}` : index}
        </span>
      </div>
      <div className="mt-1 text-[14px] leading-relaxed text-slate-900 dark:text-slate-100">
        <span className="font-medium">{gap.issue}</span>. {gap.impact}
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
  const { data } = useSWR<RouteHealthResponse>("/api/rt/route-health", {
    refreshInterval: 60_000,
    keepPreviousData: true,
  })

  if (!data || data.routes.length === 0) return null

  const unreliable = data.routes.filter(
    (r) => r.samples >= 10 && r.severityScore >= 45
  )
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
    case "stable":
      return "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40"
    case "moderate":
      return "text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40"
    case "unreliable":
      return "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/40"
    case "critical":
      return "text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-950/60"
    default:
      return "text-slate-600 bg-slate-50 dark:text-slate-400 dark:bg-slate-800"
  }
}

function labelText(label: string): string {
  switch (label) {
    case "stable":
      return "Stabilna"
    case "moderate":
      return "Umjerena"
    case "unreliable":
      return "Nepouzdana"
    case "critical":
      return "Kritična"
    default:
      return label
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
            <th className="py-2 pr-3 text-right">
              <Term title="Koeficijent varijacije razmaka — mjeri koliko pravilno dolaze vozila (niži = bolje)">
                Regularnost
              </Term>
            </th>
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
        <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
          {r.routeId}
        </span>
        <span className="ml-2 text-[11px] text-slate-400">
          {modeLabel(r.mode)}
        </span>
      </td>
      <td className="py-2.5 pr-3">
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${labelColor(r.label)}`}
        >
          {labelText(r.label)}
        </span>
      </td>
      <td
        className={`py-2.5 pr-6 text-right font-mono tabular-nums ${r.onTimePct < 0.6 ? "text-red-600 dark:text-red-400" : r.onTimePct < 0.8 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}
      >
        {Math.round(r.onTimePct * 100)}%
      </td>
      <td className="py-2.5 pr-6 text-right font-mono text-slate-700 tabular-nums dark:text-slate-300">
        {formatDelay(r.avgDelay)}
      </td>
      <td
        className={`py-2.5 pr-3 text-right font-mono tabular-nums ${r.headwayCv === null ? "text-slate-300 dark:text-slate-600" : r.headwayCv > 0.5 ? "text-red-600 dark:text-red-400" : r.headwayCv > 0.3 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}
      >
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
    score >= 70
      ? "bg-red-500"
      : score >= 45
        ? "bg-amber-500"
        : score >= 20
          ? "bg-sky-500"
          : "bg-emerald-500"
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="font-mono text-[12px] text-slate-500 tabular-nums dark:text-slate-400">
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
