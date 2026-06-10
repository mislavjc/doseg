import type { EditorialFacts } from "./facts"
import { BodyMuted, Eyebrow, Hook, Section } from "./primitives"
import { cn } from "@/lib/utils"

/** One labelled mini bar in the Sesvete comparison (Paper node ELH-0). */
function StatBar({
  label,
  barPct,
  value,
  highlight = false,
}: {
  label: string
  barPct: number
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-center gap-4">
      <span
        className={cn(
          "w-16 shrink-0 font-mono text-label",
          highlight ? "text-zg-blue" : "text-ink-muted"
        )}
      >
        {label}
      </span>
      <div className="h-[13px] grow bg-track">
        <div
          className={cn("h-[13px]", highlight ? "bg-zg-blue" : "bg-navy")}
          style={{ width: `${barPct}%` }}
        />
      </div>
      <span
        className={cn(
          "w-[120px] shrink-0 text-right font-mono text-label tabular-nums",
          highlight ? "text-zg-blue" : "text-ink"
        )}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * Sesvete (Paper node ELH-0) — the example district: most people + most stops,
 * near-lowest reach. Population/stops/score and their ranks are data-wired.
 */
export function Sesvete({ facts }: { facts: EditorialFacts }) {
  const s = facts.sesvete
  if (!s) return null
  return (
    <Section id="sesvete">
      <div className="flex flex-col gap-6">
        <Eyebrow>primjer · sesvete</Eyebrow>
        <Hook>Najviše ljudi i stanica. Gotovo najmanje grada.</Hook>
        <div className="flex flex-col gap-4 pt-1">
          <StatBar
            label="ljudi"
            barPct={s.populationBarPct}
            value={`${s.population} · ${s.populationRank}.`}
          />
          <StatBar
            label="stanice"
            barPct={s.stopsBarPct}
            value={`${s.stops} · ${s.stopsRank}.`}
          />
          <StatBar
            label="doseg"
            barPct={s.score}
            value={`${s.score}/100 · ${s.scoreRank}.`}
            highlight
          />
        </div>
        <BodyMuted>
          Najviše stanovnika i stanica u gradu, a doseg pri samom dnu. Sesvete su
          i najveći kvart po površini, pa i najgušća mreža pokriva tek dijelove:
          više prostora, ne više grada na dohvat.
        </BodyMuted>
      </div>
    </Section>
  )
}
