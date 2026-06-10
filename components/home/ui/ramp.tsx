import { REACH_RAMP } from "@/lib/reach-ramp"
import { MonoCaption } from "./primitives"

const REACH_GRADIENT = `linear-gradient(to right, ${REACH_RAMP.join(", ")})`
const RANK_GRADIENT =
  "linear-gradient(in oklab to right, var(--rank-100), var(--rank-0))"

/** Reach legend — near→far gradient with mono end labels. */
export function ReachRamp({
  rightLabel,
  dimmed = false,
}: {
  rightLabel: string
  dimmed?: boolean
}) {
  return (
    <div className="flex flex-col gap-[5px]">
      <div
        aria-hidden
        className="h-1.5"
        style={{ background: REACH_GRADIENT, opacity: dimmed ? 0.35 : 1 }}
      />
      <div className="flex justify-between">
        <MonoCaption>blizu</MonoCaption>
        <MonoCaption>{rightLabel}</MonoCaption>
      </div>
    </div>
  )
}

/**
 * Ranking spectrum (ljestvica) — navy→pale by score; optional position tick
 * for a district score (100 = navy end, left).
 */
export function RankRamp({ score }: { score?: number }) {
  return (
    <div
      aria-hidden
      className={`relative h-2 ${score == null ? "opacity-40" : ""}`}
      style={{ background: RANK_GRADIENT }}
    >
      {score != null && (
        <span
          className="absolute -top-[3px] h-[14px] w-[3px] bg-ink"
          style={{
            left: `clamp(0px, calc(${100 - score}% - 1.5px), calc(100% - 3px))`,
          }}
        />
      )}
    </div>
  )
}
