import { cn } from "@/lib/utils"
import type { WalkData } from "./facts"
import { BodyMuted, Eyebrow, Hook, Section } from "./primitives"

/**
 * Pristup (Paper node CCU-0) — the gap starts before the tram. Walk-to-nearest-
 * stop as lollipop bars: best + worst in blue, city average muted; length ∝ m.
 */

function WalkBar({
  label,
  meters,
  maxMeters,
  accent,
}: {
  label: string
  meters: number
  maxMeters: number
  accent: "blue" | "muted"
}) {
  const bar = accent === "blue" ? "bg-zg-blue" : "bg-ink-faint"
  // Line is a % of the flexible track (longest = 64%) → responsive, no overflow.
  const pct = (meters / maxMeters) * 64
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "w-[116px] shrink-0 text-right font-mono text-label whitespace-nowrap",
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
      </div>
    </div>
  )
}

export function Pristup({ data }: { data: WalkData }) {
  return (
    <Section id="pristup">
      <div className="flex flex-col gap-6">
        <Eyebrow>pristup</Eyebrow>
        <Hook>Jaz počinje prije tramvaja.</Hook>
        <div className="flex flex-col gap-4 pt-1">
          <WalkBar
            label={data.best.name}
            meters={data.best.m}
            maxMeters={data.maxM}
            accent="blue"
          />
          <WalkBar
            label="prosjek grada"
            meters={data.avg}
            maxMeters={data.maxM}
            accent="muted"
          />
          <WalkBar
            label={data.worst.name}
            meters={data.worst.m}
            maxMeters={data.maxM}
            accent="blue"
          />
        </div>
        <BodyMuted>
          Šetnja do najbliže stanice: {data.ratio}× dulja na rubu grada nego u
          centru, prije nego što tramvaj uopće krene.
        </BodyMuted>
      </div>
    </Section>
  )
}
