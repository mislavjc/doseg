"use client"

import { isBikeMode, isWalkMode, legLineColors, WALK_BAND } from "@/lib/mode-colors"
import type { Itinerary, Leg } from "@/lib/otp"
import { POI_CATEGORIES } from "@/lib/poi"
import {
  formatClock,
  transfersLabel,
  type DistrictContext,
} from "./reach-state"
import {
  BikeIcon,
  BlueLink,
  Hook,
  ModeChip,
  MonoLabel,
  PoiDot,
  RankRamp,
  ReachRamp,
  Segmented,
  Skeleton,
} from "./ui"

/**
 * Panel content blocks shared by the desktop sidebar and the mobile bottom
 * sheet (spec §9 — "sheet content = the same components as desktop").
 */

export type ReachStats = {
  km2: number
  pctCity: number | null
  districtsInReach: number | null
  totalDistricts: number | null
}

/* ── loading (spec §3 — skeleton shaped like the readout) ────────────── */

export function LoadingContent() {
  return (
    <>
      <div className="flex flex-col gap-[5px]">
        <MonoLabel>računam doseg…</MonoLabel>
        <Skeleton className="h-[22px] w-44" />
        <Skeleton className="h-[22px] w-60" />
      </div>
      <ReachRamp rightLabel="daleko" dimmed />
      <div className="flex flex-col gap-[11px]">
        <MonoLabel>u dosegu</MonoLabel>
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
      </div>
    </>
  )
}

/* ── error (Paper "Tok · Desktop — 6 greška") ────────────────────────── */

export function ErrorContent({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-[10px]">
      <MonoLabel>greška pri izračunu</MonoLabel>
      <Hook>Ne mogu izračunati doseg.</Hook>
      <p className="font-heros text-[16px] leading-6 text-ink-muted">
        Podaci o mreži trenutno nisu dostupni. Provjeri vezu pa pokušaj
        ponovno, adresa ostaje upisana.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="w-fit pt-1 font-mono text-[16px] leading-6 text-zg-blue transition-colors duration-150 hover:text-navy"
      >
        pokušaj ponovno →
      </button>
    </div>
  )
}

/* ── reach blocks ────────────────────────────────────────────────────── */

export function ReachReadout({
  minutes,
  stats,
}: {
  minutes: number
  stats: ReachStats | null
}) {
  return (
    <div className="flex flex-col gap-[5px]">
      <MonoLabel>doseg · {minutes} min</MonoLabel>
      <Hook>{stats ? `${Math.round(stats.km2)} km² dohvatljivo` : "—"}</Hook>
      <p className="font-heros text-[16px] leading-[22px] text-ink-muted">
        {stats?.pctCity != null && `${stats.pctCity}% površine grada`}
        {stats?.districtsInReach != null &&
          stats.totalDistricts != null &&
          ` · ${stats.districtsInReach} od ${stats.totalDistricts} kvartova`}
      </p>
    </div>
  )
}

// Server caps the isochrone at 30 min for now — 45 ships later.
const MINUTE_OPTIONS = [
  { value: 15, label: "15" },
  { value: 30, label: "30" },
  { value: 45, label: "45", disabled: true, title: "uskoro" },
]

export function MinutesRow({
  minutes,
  onChange,
}: {
  minutes: number
  onChange: (m: number) => void
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="shrink-0 font-mono text-label text-ink-faint">
        doseg za
      </span>
      <Segmented options={MINUTE_OPTIONS} value={minutes} onChange={onChange} />
      <span className="shrink-0 font-mono text-label text-ink-faint">min</span>
    </div>
  )
}

export function PoiList({
  poiCounts,
}: {
  poiCounts: Record<string, number> | null
}) {
  return (
    <div className="flex flex-col gap-[11px]">
      <MonoLabel>u dosegu</MonoLabel>
      {POI_CATEGORIES.map((row) => (
        <div key={row.key} className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <PoiDot colorClass={row.colorClass} />
            <span className="font-heros text-[16px] leading-5 text-ink-2">
              {row.label}
            </span>
          </div>
          <span className="font-heros text-[16px] leading-5 text-ink">
            {poiCounts ? (poiCounts[row.key] ?? 0) : "…"}
          </span>
        </div>
      ))}
    </div>
  )
}

export function ReachContent({
  minutes,
  onMinutesChange,
  stats,
  poiCounts,
}: {
  minutes: number
  onMinutesChange: (m: number) => void
  stats: ReachStats | null
  poiCounts: Record<string, number> | null
}) {
  return (
    <>
      <ReachReadout minutes={minutes} stats={stats} />
      <ReachRamp rightLabel={`${minutes} min daleko`} />
      <MinutesRow minutes={minutes} onChange={onMinutesChange} />
      <PoiList poiCounts={poiCounts} />
    </>
  )
}

/* ── route blocks ────────────────────────────────────────────────────── */

/** BAJS station names arrive ALL-CAPS — title-case them for display. */
function deShout(name: string): string {
  if (name !== name.toUpperCase()) return name
  return name
    .toLowerCase()
    .replace(/(^|[\s\-./])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
}

function legTitle(leg: Leg): string {
  const mode = leg.mode.toUpperCase()
  if (isWalkMode(mode)) return "Pješice"
  if (mode === "TRAM") return `Tramvaj ${leg.route ?? ""}`.trim()
  if (mode === "BUS") return `Bus ${leg.route ?? ""}`.trim()
  if (mode === "RAIL" || mode === "TRAIN")
    return `Vlak ${leg.route ?? ""}`.trim()
  if (mode === "BICYCLE" || mode === "BIKE") return "BAJS"
  return leg.mode
}

export function JourneyStrip({
  legs,
  colors,
}: {
  legs: Leg[]
  colors: string[]
}) {
  return (
    <div className="flex h-8 shrink-0 gap-0.5 overflow-clip rounded-[5px]">
      {legs.map((leg, i) => {
        const walk = isWalkMode(leg.mode)
        return (
          <div
            key={i}
            className="flex basis-0 items-center justify-center"
            style={{
              flexGrow: Math.max(leg.duration, 60),
              background: walk ? WALK_BAND : colors[i],
            }}
          >
            {!walk &&
              (isBikeMode(leg.mode) ? (
                <BikeIcon className="text-white" />
              ) : (
                leg.route && (
                  <span className="font-mono text-[11px] leading-[14px] text-white">
                    {leg.route}
                  </span>
                )
              ))}
          </div>
        )
      })}
    </div>
  )
}

function LegRow({
  leg,
  color,
  index,
  isLast,
}: {
  leg: Leg
  color: string
  index: number
  isLast: boolean
}) {
  const walk = isWalkMode(leg.mode)
  const sub = walk && isLast ? "do odredišta" : `do ${deShout(leg.to.name)}`
  return (
    <div
      className={`leg-stagger flex items-center gap-[13px] py-3 ${
        isLast ? "" : "border-b border-hairline"
      }`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <ModeChip mode={leg.mode} route={leg.route} color={color} />
      <div className="flex grow flex-col gap-px">
        <span className="font-heros text-[16px] leading-5 text-ink">
          {legTitle(leg)}
        </span>
        <span className="font-heros text-[13px] leading-4 text-ink-faint">
          {sub}
        </span>
      </div>
      <span className="font-mono text-[13px] leading-4 text-ink-muted">
        {Math.max(1, Math.round(leg.duration / 60))} min
      </span>
    </div>
  )
}

export function RouteSummary({
  itinerary,
  departedAt,
}: {
  itinerary: Itinerary
  departedAt: Date | null
}) {
  const minutes = Math.round(itinerary.duration / 60)
  const arrival = departedAt
    ? new Date(departedAt.getTime() + itinerary.duration * 1000)
    : null
  return (
    <div className="flex flex-col gap-1">
      <p className="font-heros text-[16px] leading-5 font-bold text-ink">
        {minutes} min
      </p>
      <p className="font-heros text-[14px] leading-[18px] text-ink-muted">
        {departedAt && arrival
          ? `Polazak ${formatClock(departedAt)}, dolazak ${formatClock(arrival)} · `
          : ""}
        {transfersLabel(itinerary.transfers)}
      </p>
    </div>
  )
}

export function LegList({
  itinerary,
  colors,
}: {
  itinerary: Itinerary
  colors: string[]
}) {
  return (
    <div className="flex flex-col border-t border-hairline">
      {itinerary.legs.map((leg, i) => (
        <LegRow
          key={i}
          leg={leg}
          color={colors[i]}
          index={i}
          isLast={i === itinerary.legs.length - 1}
        />
      ))}
    </div>
  )
}

export function RouteSkeleton() {
  return (
    <>
      <div className="flex flex-col gap-[5px]">
        <MonoLabel>tražim rutu…</MonoLabel>
        <Skeleton className="h-[22px] w-28" />
        <Skeleton className="h-[18px] w-56" />
      </div>
      <Skeleton className="h-8 w-full rounded-[5px]" />
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    </>
  )
}

/** Beyond ~3 h it isn't a real ZET trip — the router pads it with mega-walks. */
export const MAX_SANE_ROUTE_MIN = 180

export function isRouteTooFar(itinerary: Itinerary): boolean {
  return itinerary.duration / 60 > MAX_SANE_ROUTE_MIN
}

export function RouteTooFar() {
  return (
    <div className="flex flex-col gap-[5px]">
      <Hook>Predaleko za javni prijevoz</Hook>
      <p className="font-heros text-[14px] leading-[18px] text-ink-muted">
        Do ovog odredišta nema razumne ZET veze. Probaj odredište bliže gradu.
      </p>
    </div>
  )
}

export function RouteContent({
  itinerary,
  departedAt,
  loading,
}: {
  itinerary: Itinerary | null
  departedAt: Date | null
  loading: boolean
}) {
  if (loading || !itinerary) return <RouteSkeleton />
  if (isRouteTooFar(itinerary)) return <RouteTooFar />
  const colors = legLineColors(itinerary.legs)
  return (
    <>
      <RouteSummary itinerary={itinerary} departedAt={departedAt} />
      <JourneyStrip legs={itinerary.legs} colors={colors} />
      {/* Long itineraries scroll here — summary/strip above stay pinned. */}
      <div className="scroll-fade min-h-0 grow overflow-y-auto">
        <LegList itinerary={itinerary} colors={colors} />
      </div>
    </>
  )
}

/* ── ljestvica ───────────────────────────────────────────────────────── */

export function LjestvicaBlock({ ctx }: { ctx: DistrictContext | null }) {
  const district = ctx?.district ?? null
  return (
    <div className="mt-auto flex flex-col gap-[11px] border-t border-hairline pt-4">
      <MonoLabel>tvoj kvart na ljestvici</MonoLabel>
      {district ? (
        <div className="flex items-center justify-between">
          <span className="font-heros text-[16px] leading-5 text-ink">
            {district.name}
          </span>
          <span className="font-mono text-label text-zg-blue">
            #{district.rank} od {ctx?.totalDistricts ?? 17} · {district.score}
          </span>
        </div>
      ) : (
        <p className="font-heros text-[16px] leading-5 text-ink-faint">
          Klikni kvart na karti
        </p>
      )}
      <RankRamp score={district?.score} />
      <BlueLink href="/statistika">Cijela statistika →</BlueLink>
    </div>
  )
}

/** Compact one-row variant for the mobile sheet (M · doseg otvoreno). */
export function LjestvicaRow({ ctx }: { ctx: DistrictContext | null }) {
  const district = ctx?.district ?? null
  return (
    <div className="flex items-center justify-between border-t border-hairline pt-3.5">
      <span className="font-heros text-[16px] leading-5 text-ink">
        {district
          ? `${district.name} · #${district.rank} od ${ctx?.totalDistricts ?? 17}`
          : "Tvoj kvart na ljestvici"}
      </span>
      <BlueLink href="/statistika">Statistika →</BlueLink>
    </div>
  )
}
