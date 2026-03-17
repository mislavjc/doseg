import { useState } from "react"
import { motion, AnimatePresence } from "motion/react"

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

const DELAY_THRESHOLD = 30 // seconds — below this is "on time"

function delayBadge(delay: number): { label: string; color: string } {
  if (delay > DELAY_THRESHOLD)
    return { label: `+${Math.round(delay / 60)}m`, color: "text-amber-400" }
  if (delay < -DELAY_THRESHOLD)
    return { label: `${Math.round(delay / 60)}m`, color: "text-sky-400" }
  return { label: "na vrijeme", color: "text-emerald-400" }
}

interface RouteDetailsProps {
  itinerary: Itinerary | null
  loading: boolean
}

const ease = [0.23, 1, 0.32, 1] as const

export function RouteDetails({ itinerary, loading }: RouteDetailsProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <motion.div
      className="panel absolute bottom-8 left-3 right-3 sm:bottom-8 sm:left-4 sm:right-auto sm:w-[280px] cursor-pointer"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
      transition={{ duration: 0.2, ease }}
      onClick={() => itinerary && setIsExpanded(!isExpanded)}
    >
      {loading && !itinerary && (
        <div className="flex items-center gap-2">
          <div className="route-spinner" />
          <span className="text-[12px] text-slate-400">Tražim rutu…</span>
        </div>
      )}
      {itinerary && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-2xl font-semibold tabular-nums tracking-tight text-slate-100">
              {formatDuration(itinerary.duration)}
            </span>
            <div className="flex items-center gap-2">
              {loading && <div className="route-spinner" />}
              <svg 
                className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
          
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {itinerary.legs.map((leg, i) => {
              const isWalk = leg.mode === "WALK"
              return (
                <div key={i} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-[10px] text-slate-600">›</span>}
                  {isWalk ? (
                    <div className="flex items-center justify-center w-5 h-5 rounded bg-white/5" title="Hodanje">
                      <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="5" r="1.5" />
                        <path d="M12 7.5v4.5" />
                        <path d="M12 12l-2.5 5M12 12l2.5 5" />
                        <path d="M12 7.5L9.5 10M12 7.5l2.5 2.5" />
                      </svg>
                    </div>
                  ) : (
                    <span
                      className="inline-flex h-[20px] min-w-[28px] items-center justify-center rounded-[4px] px-1.5 text-[11px] font-semibold"
                      style={{
                        backgroundColor: modeColor(leg.mode),
                        color: "#fff",
                      }}
                    >
                      {leg.route || modeLabel(leg.mode)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          <AnimatePresence initial={false}>
            {isExpanded && (
              <motion.div
                initial="hidden"
                animate="visible"
                exit="hidden"
                variants={{
                  hidden: { opacity: 0, height: 0, marginTop: 0 },
                  visible: { opacity: 1, height: "auto", marginTop: 16 },
                }}
                className="overflow-hidden"
              >
                <div className="flex gap-1.5 text-[11px] text-slate-400 mb-3">
                  {itinerary.transfers > 0 && (
                    <span>
                      {itinerary.transfers}{" "}
                      {itinerary.transfers === 1 ? "presjedanje" : "presjedanja"}
                    </span>
                  )}
                  {itinerary.transfers > 0 && <span aria-hidden>·</span>}
                  <span>{formatDistance(itinerary.walkDistance)} hodanja</span>
                </div>

                <div
                  className="flex flex-col gap-0.5"
                  role="list"
                >
                  {itinerary.legs.map((leg, i) => (
                    <div
                      key={i}
                      role="listitem"
                      className="flex items-center gap-2 py-1"
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
                        {leg.from.name || "Početak"} → {leg.to.name || "Kraj"}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="text-[11px] tabular-nums text-slate-400">
                          {formatDuration(leg.duration)}
                        </span>
                        {leg.mode !== "WALK" && leg.delay !== undefined && (() => {
                          const badge = delayBadge(leg.delay)
                          return (
                            <span className={`text-[9px] font-medium tabular-nums ${badge.color}`}>
                              {badge.label}
                            </span>
                          )
                        })()}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  )
}
