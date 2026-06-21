"use client"

import { IconLocation } from "@central-icons-react/square-outlined-radius-0-stroke-2"

import { isBikeMode, isWalkMode, legLineColors, WALK_BAND } from "@/lib/mode-colors"
import type { Itinerary, Leg } from "@/lib/otp"
import { POI_CATEGORIES } from "@/lib/poi"
import {
  deShout,
  formatClock,
  transfersLabel,
  type DistrictContext,
  type PanelState,
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

/** Everything the panel content needs — shared by the desktop Sidebar and the
 * mobile MobileSheet/SheetBody so the prop shape lives in one place. */
export type PanelContentProps = {
  panel: PanelState
  minutes: number
  onMinutesChange: (m: number) => void
  stats: ReachStats | null
  poiCounts: Record<string, number> | null
  poiLayers: Record<string, boolean>
  onTogglePoi: (key: string) => void
  districtCtx: DistrictContext | null
  departedAt: Date | null
  onBackToReach: () => void
  onRetry: () => void
  onUseMyLocation: () => void
}

/** Empty-state shortcut: set the origin from the browser's geolocation —
 * surfaces the "Moja lokacija" action at the moment of intent (spec: never
 * auto-prompt). */
export function GeoButton({ onUse }: { onUse: () => void }) {
  return (
    <button
      type="button"
      onClick={onUse}
      className="flex shrink-0 items-center gap-2.5 self-start border border-hairline-strong px-3.5 py-[11px] transition-colors duration-150 ease-out hover:bg-row-tint active:scale-[0.99]"
    >
      <IconLocation size={16} className="shrink-0 text-zg-blue" />
      <span className="font-heros text-[16px] leading-5 text-zg-blue">
        Koristi moju lokaciju
      </span>
    </button>
  )
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

// Server caps the isochrone at 30 min for now — 45 ships later. The inline
// "uskoro" note reads on touch too (title tooltips never show there).
const MINUTE_OPTIONS = [
  { value: 15, label: "15" },
  { value: 30, label: "30" },
  { value: 45, label: "45", disabled: true, note: "uskoro" },
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

export type PoiLayerState = Record<string, boolean>

/** Counts of what's in reach, doubling as map-layer toggles — clicking a row
 * shows/hides that category's dots (the dot dims when the layer is off). */
export function PoiList({
  poiCounts,
  active,
  onToggle,
}: {
  poiCounts: Record<string, number> | null
  active: PoiLayerState
  onToggle: (key: string) => void
}) {
  return (
    <div className="flex flex-col gap-[11px]">
      <div className="flex items-center justify-between">
        <MonoLabel>u dosegu</MonoLabel>
        <span className="font-mono text-[11px] leading-[14px] text-ink-faint">
          klik za kartu
        </span>
      </div>
      {POI_CATEGORIES.map((row) => {
        const on = active[row.key]
        return (
          <button
            key={row.key}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(row.key)}
            className="-mx-1.5 flex items-center justify-between rounded-none px-1.5 py-0.5 text-left transition-colors duration-150 hover:bg-row-tint"
          >
            <span className="flex items-center gap-2.5">
              <span className={on ? "" : "opacity-30"}>
                <PoiDot colorClass={row.colorClass} />
              </span>
              <span className="font-heros text-[16px] leading-5 text-ink-2">
                {row.label}
              </span>
            </span>
            <span className="font-heros text-[16px] leading-5 text-ink">
              {poiCounts ? (poiCounts[row.key] ?? 0) : "…"}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function ReachContent({
  minutes,
  onMinutesChange,
  stats,
  poiCounts,
  poiLayers,
  onTogglePoi,
}: {
  minutes: number
  onMinutesChange: (m: number) => void
  stats: ReachStats | null
  poiCounts: Record<string, number> | null
  poiLayers: PoiLayerState
  onTogglePoi: (key: string) => void
}) {
  return (
    <>
      <ReachReadout minutes={minutes} stats={stats} />
      <ReachRamp rightLabel={`${minutes} min daleko`} />
      <MinutesRow minutes={minutes} onChange={onMinutesChange} />
      <PoiList poiCounts={poiCounts} active={poiLayers} onToggle={onTogglePoi} />
    </>
  )
}

/* ── route blocks ────────────────────────────────────────────────────── */

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
        <a
          href="/statistika"
          className="group -mx-1.5 flex items-center justify-between px-1.5 py-0.5 transition-colors duration-150 hover:bg-row-tint"
        >
          <span className="font-heros text-[16px] leading-5 text-ink">
            {district.name}
          </span>
          <span className="font-mono text-label text-zg-blue">
            #{district.rank} od {ctx?.totalDistricts ?? 17} · {district.score}/100
          </span>
        </a>
      ) : (
        <p className="font-heros text-[16px] leading-5 text-ink-faint">
          Klikni kartu za svoj kvart
        </p>
      )}
      <RankRamp score={district?.score} />
      {district && (
        <span className="font-mono text-[11px] leading-[14px] text-ink-faint">
          ocjena dosega · 0–100
        </span>
      )}
      <div className="flex items-center justify-between">
        <BlueLink href="/o-projektu">O projektu</BlueLink>
        <BlueLink href="/statistika">Cijela statistika →</BlueLink>
      </div>
    </div>
  )
}

/** Compact one-row variant for the mobile sheet (M · doseg otvoreno). The
 * kvart links to the full ranking; site nav lives in SheetNav below. */
export function LjestvicaRow({ ctx }: { ctx: DistrictContext | null }) {
  const district = ctx?.district ?? null
  return (
    <div className="flex items-center justify-between gap-3 border-t border-hairline pt-3.5">
      {district ? (
        <a href="/statistika" className="flex flex-col">
          <span className="font-heros text-[16px] leading-5 text-ink">
            {district.name}
          </span>
          <span className="font-mono text-[11px] leading-[14px] text-zg-blue">
            #{district.rank} od {ctx?.totalDistricts ?? 17} · {district.score}/100
          </span>
        </a>
      ) : (
        <span className="font-heros text-[16px] leading-5 text-ink">
          Tvoj kvart na ljestvici
        </span>
      )}
      <BlueLink href="/statistika">Cijela statistika →</BlueLink>
    </div>
  )
}
