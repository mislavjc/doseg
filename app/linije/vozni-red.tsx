"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

import type { HourRow } from "@/lib/generated/HourRow"
import type { LineTimetable } from "@/lib/generated/LineTimetable"

import { SmjerToggle } from "./smjer-toggle"

/**
 * Full timetable, all day types and both directions (Paper "Vozni red
 * tablice"). Server renders the plain table; after hydration the component
 * grays out departed times and marks the next departure with a blue chip.
 * GTFS hours ≥ 24 are night service and display as 00–03.
 */

const DAY_GROUPS = [
  { key: "radniDan", label: "radni dan", missing: "ne vozi radnim danom" },
  { key: "subota", label: "subota", missing: "ne vozi subotom" },
  { key: "nedjelja", label: "nedjelja", missing: "ne vozi nedjeljom" },
] as const

type DayKey = (typeof DAY_GROUPS)[number]["key"]

interface Now {
  dayKey: DayKey
  /** Minutes into the GTFS service day (04:00 → 240; 01:30 → 1530). */
  serviceMin: number
}

function currentNow(): Now {
  const d = new Date()
  let day = d.getDay()
  let serviceMin = d.getHours() * 60 + d.getMinutes()
  if (d.getHours() < 4) {
    // Past-midnight departures belong to yesterday's service day.
    serviceMin += 24 * 60
    day = (day + 6) % 7
  }
  const dayKey: DayKey =
    day === 0 ? "nedjelja" : day === 6 ? "subota" : "radniDan"
  return { dayKey, serviceMin }
}

/** Union of both directions' hours, ascending (GTFS hours, may exceed 23). */
function mergedHours(dirs: HourRow[][]): number[] {
  const hours = new Set<number>()
  for (const dir of dirs) for (const row of dir) hours.add(row.hour)
  return [...hours].sort((a, b) => a - b)
}

function MinuteCell({
  minutes,
  hour,
  now,
  nextDep,
  isCurrentRow,
}: {
  minutes: number[]
  hour: number
  now: Now | null
  nextDep: number | null
  isCurrentRow: boolean
}) {
  return (
    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
      {minutes.map((m, i) => {
        const t = hour * 60 + m
        const label = String(m).padStart(2, "0")
        if (now && t === nextDep) {
          return (
            <span
              key={i}
              className="bg-zg-blue px-1.5 py-px font-mono text-label font-bold text-white"
            >
              {label}
            </span>
          )
        }
        const past = now !== null && t < now.serviceMin
        return (
          <span
            key={i}
            className={cn(
              "font-mono text-label",
              past
                ? "text-ink-ghost"
                : isCurrentRow
                  ? "text-ink"
                  : "text-ink-muted"
            )}
          >
            {label}
          </span>
        )
      })}
    </span>
  )
}

function DayTable({
  rows,
  terminals,
  now,
  activeDir,
}: {
  rows: HourRow[][]
  terminals: string[]
  now: Now | null
  activeDir: number
}) {
  const hours = mergedHours(rows)
  // Next departure per direction (first time ≥ now across the whole day).
  const nextDeps = rows.map((dir) => {
    if (!now) return null
    for (const row of dir) {
      for (const m of row.minutes) {
        const t = row.hour * 60 + m
        if (t >= now.serviceMin) return t
      }
    }
    return null
  })

  return (
    <div>
      <div className="flex items-center border-b border-ink px-3 pb-2.5">
        <span className="w-14 shrink-0 font-mono text-label text-ink-faint">
          sat
        </span>
        {terminals.map((t, i) => (
          <span
            key={t}
            className={cn(
              "min-w-0 flex-1 font-mono text-label text-zg-blue",
              i !== activeDir && "hidden sm:block"
            )}
          >
            s terminala {t}
          </span>
        ))}
      </div>
      {hours.map((hour) => {
        const isCurrentRow =
          now !== null &&
          now.serviceMin >= hour * 60 &&
          now.serviceMin < (hour + 1) * 60
        const rowPast =
          now !== null &&
          !isCurrentRow &&
          (hour + 1) * 60 <= now.serviceMin
        return (
          <div
            key={hour}
            className={cn(
              "flex items-start border-b border-hairline-strong px-3 py-1.5",
              isCurrentRow && "bg-blue-wash"
            )}
          >
            <span
              className={cn(
                "w-14 shrink-0 font-mono text-label font-bold",
                rowPast ? "text-ink-ghost" : "text-ink"
              )}
            >
              {String(hour % 24).padStart(2, "0")}
            </span>
            {rows.map((dir, di) => (
              <span
                key={di}
                className={cn(
                  "min-w-0 flex-1",
                  di !== activeDir && "hidden sm:flex"
                )}
              >
                <MinuteCell
                  minutes={dir.find((r) => r.hour === hour)?.minutes ?? []}
                  hour={hour}
                  now={now}
                  nextDep={nextDeps[di]}
                  isCurrentRow={isCurrentRow}
                />
              </span>
            ))}
          </div>
        )
      })}
    </div>
  )
}

export function VozniRed({
  timetable,
  terminals,
}: {
  timetable: LineTimetable
  /** Departure terminal display name per direction. */
  terminals: string[]
}) {
  const [now, setNow] = useState<Now | null>(null)
  const [activeDir, setActiveDir] = useState(0)

  useEffect(() => {
    const update = () => setNow(currentNow())
    const raf = requestAnimationFrame(update)
    const t = setInterval(update, 30_000)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(t)
    }
  }, [])

  return (
    <div>
      {terminals.length > 1 && (
        <div className="pb-6">
          <SmjerToggle
            labels={terminals.map((t) => `s terminala ${t}`)}
            active={activeDir}
            onSelect={setActiveDir}
            size="label"
          />
        </div>
      )}

      {DAY_GROUPS.map((group, gi) => {
        const rows = timetable[group.key]
        const hasService = rows.some((dir) => dir.length > 0)
        const isToday = now?.dayKey === group.key
        return (
          <div key={group.key} className={cn(gi > 0 && "pt-10")}>
            <p className="pb-3 font-mono text-label text-zg-blue">
              {group.label}
            </p>
            {hasService ? (
              <DayTable
                rows={rows}
                terminals={terminals}
                now={isToday ? now : null}
                activeDir={activeDir}
              />
            ) : (
              <p className="font-mono text-label text-ink-faint">
                {group.missing}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
