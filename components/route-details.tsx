import { motion } from "motion/react"

import type { Itinerary } from "@/lib/otp"
import { modeColor, modeLabel } from "@/lib/transit"

function formatDuration(seconds: number): string {
  const mins = Math.round(Math.max(0, seconds) / 60)
  if (mins < 60) return `${mins} min`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

interface RouteDetailsProps {
  itinerary: Itinerary | null
  loading: boolean
}

const ease = [0.23, 1, 0.32, 1] as const

export function RouteDetails({ itinerary, loading }: RouteDetailsProps) {
  return (
    <motion.div
      className="panel absolute bottom-4 left-3 right-3 sm:bottom-8 sm:left-4 sm:right-auto sm:w-[280px]"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
      transition={{ duration: 0.2, ease }}
    >
      {loading && !itinerary && (
        <div className="flex items-center gap-2">
          <div className="route-spinner" />
          <span className="text-[12px] text-slate-400">Finding route…</span>
        </div>
      )}
      {itinerary && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-2xl font-semibold tabular-nums tracking-tight text-slate-100">
              {formatDuration(itinerary.duration)}
            </span>
            {loading && <div className="route-spinner" />}
          </div>
          <div className="mt-0.5 flex gap-1.5 text-[11px] text-slate-500">
            {itinerary.transfers > 0 && (
              <span>
                {itinerary.transfers} transfer
                {itinerary.transfers > 1 ? "s" : ""}
              </span>
            )}
            {itinerary.transfers > 0 && <span aria-hidden>·</span>}
            <span>{formatDistance(itinerary.walkDistance)} walk</span>
          </div>

          <motion.div
            key={itinerary.legs.map((l) => l.mode + (l.route || "")).join()}
            className="mt-3 flex flex-col gap-0.5"
            role="list"
            initial="hidden"
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: 0.05 } },
            }}
          >
            {itinerary.legs.map((leg, i) => (
              <motion.div
                key={i}
                role="listitem"
                className="flex items-center gap-2 py-1"
                variants={{
                  hidden: { opacity: 0, y: 4 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    transition: { duration: 0.2, ease },
                  },
                }}
              >
                <span
                  className="inline-flex h-[22px] min-w-[36px] items-center justify-center rounded-[5px] px-1.5 text-[11px] font-semibold"
                  style={{
                    backgroundColor:
                      leg.mode === "WALK"
                        ? "rgba(255,255,255,0.08)"
                        : modeColor(leg.mode),
                    color: leg.mode === "WALK" ? "#94a3b8" : "#fff",
                  }}
                >
                  {leg.route || modeLabel(leg.mode)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-slate-400">
                  {leg.from.name || "Start"} → {leg.to.name || "End"}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
                  {formatDuration(leg.duration)}
                </span>
              </motion.div>
            ))}
          </motion.div>
        </>
      )}
    </motion.div>
  )
}
