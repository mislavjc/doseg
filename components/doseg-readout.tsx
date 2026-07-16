import { plural } from "@/app/linije/copy"
import { LineBadge } from "@/app/statistika/editorial/blocks"
import type { NearbyLine, NearbyStop } from "@/lib/doseg-at"
import type { NearestBajs } from "@/lib/okolina"
import { cn } from "@/lib/utils"

/**
 * Presentational pieces of the /adresa/[slug] readout, server-renderable —
 * the page composes them from a payload computed at render time: the icon
 * ledger, the stop/Bajs distance gauges, the per-line timetable and the
 * badge rows.
 */

const BADGE_CAP = 12

/** Adresa fact cell (Paper lock-in ledger) — Central icon anchor, bold value,
 *  mono label underneath. No dotted leaders (short values drown in them) and
 *  the two type sizes never share a line; the page frames cells in hairline
 *  rows. */
export function LedgerCell({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  value: React.ReactNode
  label: string
}) {
  return (
    <div className="flex items-start gap-3.5 sm:w-[290px] sm:shrink-0">
      <Icon size={22} className="mt-px shrink-0 text-zg-blue" aria-hidden />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-heros text-body font-bold text-ink">{value}</span>
        <span className="font-mono text-label text-ink-muted">{label}</span>
      </div>
    </div>
  )
}

/** One lollipop gauge row — the pristup WalkBar grammar with a stop's facts. */
function GaugeRow({
  label,
  meters,
  maxMeters,
  accent,
  meta,
}: {
  label: string
  meters: number
  maxMeters: number
  accent: "blue" | "muted"
  meta?: string
}) {
  const bar = accent === "blue" ? "bg-zg-blue" : "bg-ink-faint"
  // Line is a % of the flexible track (longest = 36%) so the value and meta
  // text that follow never truncate inside the 620px column.
  const pct = (meters / maxMeters) * 36
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <span
        className={cn(
          "shrink-0 truncate font-mono text-label whitespace-nowrap sm:w-[172px] sm:text-right",
          accent === "blue" ? "text-ink-muted" : "text-ink-faint"
        )}
      >
        {label}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-[7px]">
        <span className={cn("size-[7px] shrink-0 rounded-[2px]", bar)} />
        <span className={cn("h-0.5 shrink-0", bar)} style={{ width: `${pct}%` }} />
        <span className={cn("h-[11px] w-[3px] shrink-0", bar)} />
        <span
          className={cn(
            "shrink-0 whitespace-nowrap pl-[3px] font-mono text-label tabular-nums",
            accent === "blue" ? "text-ink" : "text-ink-muted"
          )}
        >
          {meters} m
        </span>
        {meta && (
          <span className="min-w-0 truncate font-mono text-label text-ink-faint">
            · {meta}
          </span>
        )}
      </div>
    </div>
  )
}

/** Nearby stops as distance gauges against the city-average first stop. */
export function StopGauges({
  stops,
  cityAvgM,
}: {
  stops: NearbyStop[]
  cityAvgM: number | null
}) {
  if (!stops.length) return null
  const maxM = Math.max(...stops.map((s) => s.distM), cityAvgM ?? 0)
  return (
    <div className="flex flex-col gap-4">
      {stops.map((s) => (
        <GaugeRow
          key={s.slug}
          label={s.name}
          meters={s.distM}
          maxMeters={maxM}
          accent="blue"
          meta={`${s.walkMin} min hoda · ${s.lineCount} ${plural(s.lineCount, "linija", "linije", "linija")}`}
        />
      ))}
      {cityAvgM !== null && (
        <GaugeRow
          label="prosjek grada"
          meters={cityAvgM}
          maxMeters={maxM}
          accent="muted"
        />
      )}
    </div>
  )
}

/** Nearest Bajs stations in the stop-gauge grammar; bike counts are live. */
export function BajsGauges({ stations }: { stations: NearestBajs[] }) {
  if (!stations.length) return null
  const maxM = Math.max(...stations.map((s) => s.distM))
  return (
    <div className="flex flex-col gap-4">
      {stations.map((s) => (
        <GaugeRow
          key={s.name}
          label={s.name}
          meters={s.distM}
          maxMeters={maxM}
          accent="blue"
          meta={`${s.walkMin} min · ${
            s.bikesAvailable > 0
              ? `${s.bikesAvailable} ${plural(s.bikesAvailable, "bicikl", "bicikla", "bicikala")} sada`
              : "bez bicikala"
          }`}
        />
      ))}
    </div>
  )
}

/** Per-line timetable rows (Paper lock-in "linije"): badge, direction, peak
 *  headway. Only lines with a known headway belong here — the summary line on
 *  the page carries the rest. */
export function LineTable({
  lines,
}: {
  lines: (NearbyLine & { peakMin: number })[]
}) {
  return (
    <div className="flex flex-col">
      {lines.map((l, i) => (
        <div
          key={l.broj}
          className="flex items-center gap-3 border-b border-hairline py-2.5 first:border-t"
        >
          <LineBadge broj={l.broj} mode={l.mode} href={`/linije/${l.broj}`} />
          <span className="min-w-0 truncate font-mono text-label text-ink">
            {l.headsign ? `smjer ${l.headsign}` : "oba smjera"}
          </span>
          <span className="h-3 min-w-3 flex-1 border-b border-dotted border-hairline-strong" />
          <span className="shrink-0 font-mono text-label text-ink">
            {i === 0
              ? `svakih ~${Math.round(l.peakMin)} min u špici`
              : `~${Math.round(l.peakMin)} min`}
          </span>
        </div>
      ))}
    </div>
  )
}

export function NearbyLines({ lines }: { lines: NearbyLine[] }) {
  if (!lines.length) return null
  const day = lines.filter((l) => !l.isNight)
  const night = lines.filter((l) => l.isNight)
  const shown = day.slice(0, BADGE_CAP)
  const extra = day.length - shown.length
  // No inline label — the section hook and eyebrow above already say what
  // these are, and a label-led row wraps into orphan badges. Trams filled,
  // buses outlined (the sitewide badge grammar); night lines get their own row.
  return (
    <div className="flex flex-col gap-3">
      {day.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {shown.map((l) => (
            <LineBadge key={l.broj} broj={l.broj} mode={l.mode} href={`/linije/${l.broj}`} />
          ))}
          {extra > 0 && (
            <span className="font-mono text-label text-ink-muted">+{extra}</span>
          )}
        </div>
      )}
      {night.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-label text-ink-muted">noćne:</span>
          {night.map((l) => (
            <LineBadge key={l.broj} broj={l.broj} mode={l.mode} href={`/linije/${l.broj}`} />
          ))}
        </div>
      )}
    </div>
  )
}
