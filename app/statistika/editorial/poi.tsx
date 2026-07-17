import {
  IconArrowRight,
  IconMedicalCross,
  IconPark,
  IconSchool,
} from "@central-icons-react/square-outlined-radius-0-stroke-2"
import Link from "next/link"

import type { PoiKey } from "@/lib/kvart-data"
import { cn } from "@/lib/utils"

/**
 * POI row grammar shared by /kvartovi (Blizina: plural label + count) and
 * /adresa (okolina: singular label + walk distance, linked to the karta
 * route). One key type, one icon map, one row — adding a POI category means
 * touching this file only.
 */

export type { PoiKey }

// Central icons (square-outlined-radius-0-stroke-2) match the locked icon system.
const POI_ICON: Record<PoiKey, typeof IconPark> = {
  hospital: IconMedicalCross,
  school: IconSchool,
  park: IconPark,
}

export function PoiIcon({ k }: { k: PoiKey }) {
  const Icon = POI_ICON[k]
  return <Icon size={22} className="shrink-0 text-zg-blue" />
}

export function PoiRow({
  k,
  title,
  detail,
  value,
  valueClassName = "text-body",
  href,
}: {
  k: PoiKey
  title: string
  detail: string | null
  value: React.ReactNode
  valueClassName?: string
  href?: string
}) {
  const row =
    "flex items-center gap-3.5 border-b border-hairline py-[13px] first:border-t first:border-hairline"
  const inner = (
    <>
      <PoiIcon k={k} />
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <span
          className={cn(
            "font-heros text-body text-ink",
            href && "transition-colors group-hover:text-zg-blue"
          )}
        >
          {title}
        </span>
        {detail && (
          <span className="truncate font-mono text-label text-ink-muted">{detail}</span>
        )}
      </div>
      <span className={cn("shrink-0 font-mono text-ink", valueClassName)}>{value}</span>
      {/* The arrow is what turns a fact row into a navigable one — without it
          this reads identically to the static /kvartovi variant. */}
      {href && (
        <IconArrowRight
          size={14}
          className="shrink-0 text-ink-faint transition-colors group-hover:text-zg-blue"
        />
      )}
    </>
  )
  if (href)
    return (
      // prefetch=false: several per-row map deep links would each trigger
      // their own speculative /karta fetch the moment they scroll into view.
      <Link href={href} prefetch={false} className={cn("group", row)}>
        {inner}
      </Link>
    )
  return <div className={row}>{inner}</div>
}
