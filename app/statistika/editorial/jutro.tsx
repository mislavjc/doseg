import { cn } from "@/lib/utils"
import type { EveningRow } from "./facts"
import { BodyMuted, Eyebrow, Hook, Section } from "./primitives"

/**
 * Jutro vs. večer (Paper node F3Z-0) — dumbbell of each district's peak→evening
 * reach drop. Morning dot (ink) fixed near the right = full reach; evening dot
 * (blue) pulled left by the drop. Top 3 (biggest losses) emphasised.
 */

const MORNING = 95 // % — morning dot near the right edge of the track
const SCALE = 0.95 // % leftward per 1% drop

function DumbbellRow({ row, top }: { row: EveningRow; top: boolean }) {
  const evening = Math.max(4, MORNING - row.drop * SCALE)
  return (
    <div className="flex h-[23px] items-center gap-3">
      <span
        className={cn(
          "w-[116px] shrink-0 text-right font-mono text-[11px] leading-[14px]",
          top ? "text-ink" : "text-ink-muted"
        )}
      >
        {row.short}
      </span>
      <div className="relative h-3.5 grow">
        <span className="absolute inset-x-0 top-1.5 h-0.5 bg-hairline" />
        <span
          className="absolute top-1.5 h-0.5 bg-zg-blue"
          style={{ left: `${evening}%`, width: `${MORNING - evening}%` }}
        />
        <span
          className="absolute top-0.5 size-[9px] -translate-x-1/2 rounded-full bg-zg-blue"
          style={{ left: `${evening}%` }}
        />
        <span
          className="absolute top-0.5 size-[9px] -translate-x-1/2 rounded-full bg-ink"
          style={{ left: `${MORNING}%` }}
        />
      </div>
      <span
        className={cn(
          "w-[48px] shrink-0 text-right font-mono text-[11px] leading-[14px] tabular-nums",
          top ? "text-zg-blue" : "text-ink-muted"
        )}
      >
        &minus;{row.drop}%
      </span>
    </div>
  )
}

function LegendDot({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-[9px] rounded-full", cls)} />
      <span className="font-mono text-[11px] leading-[14px] text-ink-muted">
        {label}
      </span>
    </span>
  )
}

export function Jutro({ rows }: { rows: EveningRow[] }) {
  return (
    <Section id="jutro">
      <div className="flex flex-col gap-6">
        <Eyebrow>jutro vs. večer</Eyebrow>
        <Hook>Kad padne mrak, istok ostaje bez trećine grada.</Hook>
        <div className="flex items-center gap-5 pl-[128px]">
          <LegendDot cls="bg-ink" label="jutro 8 h" />
          <LegendDot cls="bg-zg-blue" label="večer 21 h" />
        </div>
        <div className="flex flex-col gap-[5px] pt-0.5">
          {rows.map((r, i) => (
            <DumbbellRow key={r.name} row={r} top={i < 3} />
          ))}
        </div>
        <BodyMuted>
          Doseg je mjeren u jutarnjem špicu. Navečer se grad skupi, ali ne svuda
          jednako. Tri istočna kvarta, Novi Zagreb-istok, Peščenica i Donja
          Dubrava, gube i do trećine; rubni Podsused i Stenjevec gotovo ništa.
        </BodyMuted>
      </div>
    </Section>
  )
}
