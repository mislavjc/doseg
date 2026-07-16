import Link from "next/link"

import { plural } from "@/app/linije/copy"
import { LineBadge } from "@/app/statistika/editorial/blocks"
import type { DosegAtPayload } from "@/lib/doseg-at"
import { cn } from "@/lib/utils"

/**
 * Presentational pieces of the doseg readout (imenik dotted-leader grammar),
 * server-renderable — the /adresa/[slug] page composes them from a payload
 * computed at render time.
 */

const BADGE_CAP = 12

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="shrink-0 font-mono text-label text-ink-muted">{label}</span>
      <span className="h-3 min-w-3 flex-1 border-b border-dotted border-hairline-strong" />
      {children}
    </div>
  )
}

export function Fact({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={cn("shrink-0 font-heros text-body font-bold text-ink", className)}>
      {children}
    </span>
  )
}

export function NearbyStops({ stops }: { stops: NonNullable<DosegAtPayload["nearby"]> }) {
  if (!stops.length) return null
  return (
    <div className="flex flex-col">
      <span className="pb-1 font-mono text-label text-ink-muted">stanice u blizini</span>
      {stops.map((s) => (
        <Link
          key={s.slug}
          href={`/stanice/${s.slug}`}
          className="group flex items-center gap-2.5 border-b border-hairline py-2"
        >
          <span className="min-w-0 truncate font-heros text-body text-ink transition-colors group-hover:text-zg-blue">
            {s.name}
          </span>
          <span className="h-3 min-w-3 flex-1 border-b border-dotted border-hairline-strong" />
          <span className="shrink-0 font-mono text-label text-ink-muted">
            {s.distM} m · {s.walkMin} min hoda · {s.lineCount}{" "}
            {plural(s.lineCount, "linija", "linije", "linija")}
          </span>
        </Link>
      ))}
    </div>
  )
}

export function NearbyLines({ lines }: { lines: NonNullable<DosegAtPayload["lines"]> }) {
  if (!lines.length) return null
  const day = lines.filter((l) => !l.isNight)
  const shown = day.slice(0, BADGE_CAP)
  const extra = day.length - shown.length
  const night = lines.length - day.length
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-label text-ink-muted">linije na 5 min hoda:</span>
      {shown.map((l) => (
        <LineBadge key={l.broj} broj={l.broj} href={`/linije/${l.broj}`} />
      ))}
      {(extra > 0 || night > 0) && (
        <span className="font-mono text-label text-ink-muted">
          {extra > 0 && `+${extra}`}
          {extra > 0 && night > 0 && " · "}
          {night > 0 && `noćne: ${night}`}
        </span>
      )}
    </div>
  )
}
