import Link from "next/link"

import { LineBadge } from "@/app/statistika/editorial/blocks"
import type { LineIndexEntry } from "@/lib/generated/LineIndexEntry"

/**
 * The canonical imenik row for a line (badge · terminals · dotted leader ·
 * headway fact) — shared by the /linije hub and the homepage directory.
 */

/** Right-column fact for a row: peak headway, or daily departures. */
function rowFact(line: LineIndexEntry): string {
  const peak = line.peakHeadwayMin
  if (peak && peak <= 60) return `svakih ${Math.round(peak)} min`
  return `${line.dailyDepartures} pol. dnevno`
}

export function LineRow({ line }: { line: LineIndexEntry }) {
  return (
    <li>
      <Link
        href={`/linije/${line.broj}`}
        className="group flex items-center gap-3.5 border-b border-hairline py-2.5"
      >
        <LineBadge broj={line.broj} />
        <span className="min-w-0 truncate font-heros text-[16px] leading-6 text-ink transition-colors group-hover:text-zg-blue">
          {line.terminals[0]} - {line.terminals[1]}
        </span>
        <span className="h-3 min-w-3 flex-1 border-b border-dotted border-hairline-strong" />
        <span className="shrink-0 font-mono text-label text-ink-muted">
          {rowFact(line)}
        </span>
      </Link>
    </li>
  )
}
