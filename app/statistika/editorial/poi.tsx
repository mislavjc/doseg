import {
  IconMedicalCross,
  IconPark,
  IconSchool,
} from "@central-icons-react/square-outlined-radius-0-stroke-2"

import type { PoiKey } from "@/lib/kvart-data"
import { cn } from "@/lib/utils"

/**
 * POI row grammar shared by /kvartovi (Blizina: plural label + count) and
 * /adresa (okolina: singular label + walk distance). One key type, one icon
 * map, one row — adding a POI category means touching this file only.
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
}: {
  k: PoiKey
  title: string
  detail: string | null
  value: React.ReactNode
  valueClassName?: string
}) {
  return (
    <div className="flex items-center gap-3.5 border-b border-hairline py-[13px] first:border-t first:border-hairline">
      <PoiIcon k={k} />
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <span className="font-heros text-body text-ink">{title}</span>
        {detail && (
          <span className="truncate font-mono text-label text-ink-muted">{detail}</span>
        )}
      </div>
      <span className={cn("shrink-0 font-mono text-ink", valueClassName)}>{value}</span>
    </div>
  )
}
