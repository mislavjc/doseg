"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { Term } from "@/components/ui/term"
import { cn } from "@/lib/utils"
import { StatEyebrow, StatModuleTitle } from "./stat-typography"

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
  routes: Array<RouteHealth>
}

// --- Component ---

export default function InsightsSection({
  connectivityGaps,
}: {
  connectivityGaps: Array<ConnectivityGap>
}) {
  const hasGaps = connectivityGaps.length > 0

  return (
    <section className="border-t border-hairline-strong py-16 sm:py-24">
      {hasGaps && (
        <KeyFindingsCarousel
          key={connectivityGaps.map((g) => g.issue).join("|")}
          gaps={connectivityGaps}
        />
      )}

      <OperationalHealth />
    </section>
  )
}

// --- Key findings horizontal carousel ---

const isHtmlElement = (node: Element): node is HTMLElement =>
  "offsetLeft" in node

function nearestChildIndex(el: HTMLElement, scrollLeft: number): number {
  const pad = Number.parseFloat(getComputedStyle(el).paddingLeft) || 0
  const children = [...el.children]
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (!isHtmlElement(child)) {
      continue
    }
    const dist = Math.abs(child.offsetLeft - pad - scrollLeft)
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  return best
}

function KeyFindingsCarousel({ gaps }: { gaps: Array<ConnectivityGap> }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const GAP = 12
  const PEEK = 48

  const measure = useCallback(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    const { scrollLeft, scrollWidth, clientWidth } = el
    const maxScroll = scrollWidth - clientWidth
    setCanScrollLeft(maxScroll > 6 && scrollLeft > 6)
    setCanScrollRight(maxScroll > 6 && scrollLeft < maxScroll - 6)

    setActive(nearestChildIndex(el, scrollLeft))
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    const updateCardWidth = () => {
      const cols = gaps.length > 1 && el.clientWidth >= 560 ? 2 : 1
      const cardW =
        gaps.length <= 1
          ? el.clientWidth
          : cols === 2
            ? (el.clientWidth - GAP) / 2
            : el.clientWidth - PEEK - GAP
      el.style.setProperty("--card-w", `${Math.round(cardW)}px`)
      measure()
    }
    updateCardWidth()
    el.addEventListener("scroll", measure, { passive: true })
    const ro = new ResizeObserver(updateCardWidth)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", measure)
      ro.disconnect()
    }
  }, [gaps.length, measure])

  const scrollToIndex = (i: number) => {
    const el = scrollRef.current
    el?.children.item(i)?.scrollIntoView({
      behavior: "smooth",
      inline: "start",
      block: "nearest",
    })
  }

  return (
    <div className="relative">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <StatEyebrow>ključni nalazi</StatEyebrow>
          <StatModuleTitle>Ključni nalazi</StatModuleTitle>
        </div>
        {gaps.length > 1 && (
          <CarouselNav
            count={gaps.length}
            active={active}
            canScrollLeft={canScrollLeft}
            canScrollRight={canScrollRight}
            onScrollToIndex={scrollToIndex}
          />
        )}
      </div>
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
    </div>
  )
}

// --- Carousel navigation ---

const pad2 = (n: number) => String(n).padStart(2, "0")

function CarouselNav({
  count,
  active,
  canScrollLeft,
  canScrollRight,
  onScrollToIndex,
}: {
  count: number
  active: number
  canScrollLeft: boolean
  canScrollRight: boolean
  onScrollToIndex: (i: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="font-mono text-label text-ink-muted tabular-nums"
        aria-live="polite"
      >
        {pad2(active + 1)} / {pad2(count)}
      </span>
      <CarouselArrowButton
        direction="left"
        enabled={canScrollLeft}
        onClick={() => onScrollToIndex(Math.max(0, active - 1))}
      />
      <CarouselArrowButton
        direction="right"
        enabled={canScrollRight}
        onClick={() => onScrollToIndex(Math.min(count - 1, active + 1))}
      />
    </div>
  )
}

function CarouselArrowButton({
  direction,
  enabled,
  onClick,
}: {
  direction: "left" | "right"
  enabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={direction === "left" ? "Prethodni nalaz" : "Sljedeći nalaz"}
      disabled={!enabled}
      onClick={onClick}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center border border-hairline-strong bg-white text-ink-2 transition-colors",
        enabled ? "hover:bg-surface" : "cursor-not-allowed opacity-40"
      )}
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <title>
          {direction === "left" ? "Strelica lijevo" : "Strelica desno"}
        </title>
        <path d={direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
      </svg>
    </button>
  )
}

// --- Structural gap cards ---

function GapCard({ gap, index }: { gap: ConnectivityGap; index: number }) {
  const isCritical = gap.severity === "critical"

  return (
    <div className="flex h-full flex-col gap-2 border border-hairline-strong bg-white p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "inline-flex items-center px-2 py-1 font-mono text-label lowercase",
            isCritical ? "bg-ink text-white" : "bg-surface text-ink"
          )}
        >
          {isCritical ? "Kritično" : "Upozorenje"}
        </span>
        <span className="font-mono text-label text-ink-faint lowercase">
          Nalaz {index < 10 ? `0${index}` : index}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-head font-bold text-ink">{gap.issue}</span>
        <span className="text-body text-ink-muted">{gap.impact}</span>
      </div>
    </div>
  )
}

// --- Operational health (RT data) ---

function modeLabel(mode: string): string {
  return mode === "TRAM" ? "Tramvaj" : mode === "BUS" ? "Bus" : mode
}

function formatDelay(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)} s`
  }
  const min = Math.floor(seconds / 60)
  const sec = Math.round(seconds % 60)
  return sec > 0 ? `${min} min ${sec} s` : `${min} min`
}

function OperationalHealth() {
  const { data } = useSWR<RouteHealthResponse>("/api/rt/route-health", {
    refreshInterval: 60_000,
    keepPreviousData: true,
  })

  if (!data || data.routes.length === 0) {
    return null
  }

  const unreliable = data.routes.filter(
    (r) => r.samples >= 10 && r.severityScore >= 45
  )
  if (unreliable.length === 0) {
    return null
  }

  return (
    <div className="mt-12">
      <div className="mb-6 font-mono text-label font-bold text-ink-muted">
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
      return "text-zg-blue bg-blue-wash"
    case "moderate":
      return "text-ink-muted bg-surface"
    case "unreliable":
      return "text-ink bg-surface"
    case "critical":
      return "text-ink bg-surface"
    default:
      return "text-ink-2 bg-surface"
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

function HealthTable({ routes }: { routes: Array<RouteHealth> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-body">
        <thead>
          <tr className="border-b border-hairline-strong text-left font-mono text-label font-bold text-ink-muted">
            <th className="py-2 pr-3">Linija</th>
            <th className="py-2 pr-3">Stanje</th>
            <th className="py-2 pr-2 text-right sm:pr-6">Na vrijeme</th>
            <th className="py-2 pr-2 text-right sm:pr-6">Kašnjenje</th>
            <th className="py-2 pr-1 text-right sm:pr-3">
              <Term title="Koeficijent varijacije razmaka - mjeri koliko pravilno dolaze vozila (niži = bolje)">
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
    <tr className="border-b border-hairline">
      <td className="py-2.5 pr-3">
        <span className="font-mono font-medium text-ink">{r.routeId}</span>
        <span className="ml-2 font-mono text-label text-ink-faint">
          {modeLabel(r.mode)}
        </span>
      </td>
      <td className="py-2.5 pr-3">
        <span
          className={`inline-block px-2 py-0.5 font-mono text-label ${labelColor(r.label)}`}
        >
          {labelText(r.label)}
        </span>
      </td>
      <td
        className={`py-2.5 pr-6 text-right font-mono tabular-nums ${r.onTimePct < 0.6 ? "text-ink" : r.onTimePct < 0.8 ? "text-ink-muted" : "text-zg-blue"}`}
      >
        {Math.round(r.onTimePct * 100)}%
      </td>
      <td className="py-2.5 pr-6 text-right font-mono text-ink-2 tabular-nums">
        {formatDelay(r.avgDelay)}
      </td>
      <td
        className={`py-2.5 pr-3 text-right font-mono tabular-nums ${r.headwayCv === null ? "text-ink-faint" : r.headwayCv > 0.5 ? "text-ink" : r.headwayCv > 0.3 ? "text-ink-muted" : "text-zg-blue"}`}
      >
        {r.headwayCv === null ? "-" : r.headwayCv.toFixed(2)}
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
      ? "bg-ink-2"
      : score >= 45
        ? "bg-ink-ghost"
        : score >= 20
          ? "bg-blue-pale"
          : "bg-zg-blue"
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="font-mono text-label text-ink-muted tabular-nums">
        {Math.round(score)}
      </span>
      <div className="h-2 w-12 bg-track sm:w-16">
        <div
          className={`h-full ${color}`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
    </div>
  )
}
