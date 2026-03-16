import type { Itinerary } from "@/lib/otp"
import { modeColor, modeLabel } from "@/lib/transit"

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins} min`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

export function RouteDetails({ itinerary }: { itinerary: Itinerary }) {
  return (
    <div className="panel absolute bottom-8 left-4 w-[280px]">
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
          {formatDuration(itinerary.duration)}
        </span>
        <div className="flex gap-1.5 text-[11px] text-slate-400">
          {itinerary.transfers > 0 && (
            <span>
              {itinerary.transfers} transfer
              {itinerary.transfers > 1 ? "s" : ""}
            </span>
          )}
          {itinerary.transfers > 0 && <span aria-hidden>·</span>}
          <span>{formatDistance(itinerary.walkDistance)} walk</span>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-0.5">
        {itinerary.legs.map((leg, i) => (
          <div key={i} className="leg-item flex items-center gap-2 py-1"
            style={{ animationDelay: `${i * 50}ms` }}>
            <span
              className="inline-flex h-[22px] min-w-[36px] items-center justify-center rounded-[5px] px-1.5 text-[11px] font-semibold"
              style={{
                backgroundColor:
                  leg.mode === "WALK" ? "#f1f5f9" : modeColor(leg.mode),
                color: leg.mode === "WALK" ? "#64748b" : "#fff",
              }}
            >
              {leg.route || modeLabel(leg.mode)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-slate-500">
              {leg.from.name || "Start"} → {leg.to.name || "End"}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
              {formatDuration(leg.duration)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
