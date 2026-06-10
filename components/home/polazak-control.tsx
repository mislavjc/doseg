"use client"

import { useState } from "react"

import { formatClock } from "./reach-state"
import { DropdownPanel, DropdownSection, MapTile, MapTileButton } from "./ui"

/**
 * Departure-time control (Paper "Polazak V1b — preseti + točno vrijeme",
 * spec §6). Separate from the 15/30/45 duration — drives the GTFS schedule.
 * Presets are chips; the big mono time box takes direct input or ±15 steps.
 */

const PRESETS = [
  { label: "špica 08", time: "08:00" },
  { label: "popodne 15", time: "15:00" },
  { label: "večer 20", time: "20:00" },
  { label: "kasno 23", time: "23:00" },
] as const

function ClockIcon() {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className="shrink-0 text-ink-muted"
    >
      <circle cx="7" cy="7" r="5.75" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7 4.2 V7 H9.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function parseTime(t: string): number | null {
  const m = t.trim().match(/^(\d{1,2})[:.]?(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

function fmt(totalMin: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMin))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** −15 / HH:MM input / +15 — commit on Enter or blur, step instantly. */
function ExactTimeRow({
  effective,
  active,
  onCommit,
}: {
  effective: string
  active: boolean
  onCommit: (t: string) => void
}) {
  // Remounted via `key={effective}` upstream, so the draft resets on change.
  const [draft, setDraft] = useState(effective)

  const commitDraft = () => {
    const parsed = parseTime(draft)
    if (parsed != null && fmt(parsed) !== effective) onCommit(fmt(parsed))
    else setDraft(effective)
  }
  const step = (delta: number) => {
    const base = parseTime(effective) ?? 0
    onCommit(fmt(base + delta))
  }

  return (
    <div className="flex items-stretch gap-1.5 px-[18px]">
      <button
        type="button"
        onClick={() => step(-15)}
        className="w-11 border border-hairline-strong font-mono text-[13px] leading-4 text-ink-muted transition-[color,transform] duration-150 ease-out hover:text-ink-2 active:scale-[0.97]"
      >
        −15
      </button>
      <label
        className={`flex grow items-center justify-center border py-2.5 ${
          active
            ? "border-zg-blue bg-chip-blue"
            : "border-hairline-strong bg-ground"
        }`}
      >
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
          }}
          aria-label="Točno vrijeme polaska"
          className={`w-[72px] bg-transparent text-center font-mono text-[22px] leading-[26px] outline-none ${
            active ? "text-zg-blue" : "text-ink-2"
          }`}
        />
      </label>
      <button
        type="button"
        onClick={() => step(15)}
        className="w-11 border border-hairline-strong font-mono text-[13px] leading-4 text-ink-muted transition-[color,transform] duration-150 ease-out hover:text-ink-2 active:scale-[0.97]"
      >
        +15
      </button>
    </div>
  )
}

function PanelBody({
  departTime,
  now,
  onPick,
}: {
  departTime: string | null
  now: string
  onPick: (t: string | null) => void
}) {
  const effective = departTime ?? now
  const isPreset = PRESETS.some((p) => p.time === departTime)
  return (
    <DropdownPanel className="origin-top-right top-full right-0 mt-1.5 w-[312px]">
      <p className="px-[18px] pt-[18px] pb-2 font-heros text-head font-bold text-ink">
        Kad krećeš?
      </p>
      <button
        type="button"
        onClick={() => onPick(null)}
        className={`mx-3 flex items-center justify-between px-3 py-2.5 text-left transition-colors duration-150 ${
          departTime === null ? "bg-chip-blue" : "hover:bg-row-tint"
        }`}
      >
        <span className="flex items-center gap-[9px]">
          <span
            className={`size-[7px] rounded-full ${
              departTime === null ? "bg-zg-blue" : "bg-ink-faint"
            }`}
          />
          <span
            className={`font-heros text-[16px] leading-5 ${
              departTime === null ? "font-bold text-zg-blue" : "text-ink"
            }`}
          >
            Sada
          </span>
        </span>
        <span
          className={`font-mono text-[13px] leading-4 ${
            departTime === null ? "text-zg-blue" : "text-ink-muted"
          }`}
        >
          {now}
        </span>
      </button>
      <DropdownSection label="doba dana" />
      <div className="flex flex-wrap gap-1.5 px-[18px] pb-1">
        {PRESETS.map((p) => {
          const selected = departTime === p.time
          return (
            <button
              key={p.time}
              type="button"
              onClick={() => onPick(p.time)}
              className={`border px-[11px] py-[7px] font-mono text-label transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.97] ${
                selected
                  ? "border-zg-blue bg-chip-blue text-zg-blue"
                  : "border-hairline-strong text-ink-muted hover:text-ink-2"
              }`}
            >
              {p.label}
            </button>
          )
        })}
      </div>
      <DropdownSection label="ili točno vrijeme" />
      <ExactTimeRow
        key={effective}
        effective={effective}
        active={departTime !== null && !isPreset}
        onCommit={onPick}
      />
      <div className="flex justify-between px-[18px] pt-1.5">
        <span className="font-mono text-[11px] leading-[14px] text-ink-faint">
          upiši ili koristi ±
        </span>
        <span className="font-mono text-[11px] leading-[14px] text-ink-faint">
          korak 15 min
        </span>
      </div>
      <div className="m-3 bg-note-bg px-[14px] py-3">
        <p className="font-heros text-[14px] leading-[19px] text-note-ink">
          Doseg se mijenja kroz dan — navečer istok grada gubi gotovo trećinu.
        </p>
      </div>
    </DropdownPanel>
  )
}

export function PolazakControl({
  departTime,
  onChange,
}: {
  departTime: string | null
  onChange: (t: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const now = formatClock(new Date())

  return (
    <div className="relative">
      <MapTile>
        <MapTileButton
          onClick={() => setOpen((o) => !o)}
          className="gap-2 px-[13px] py-[9px]"
        >
          <ClockIcon />
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-label text-ink-faint">polazak</span>
            <span className="font-heros text-[15px] leading-[18px] font-bold text-ink">
              {departTime ?? `Sada · ${now}`}
            </span>
          </span>
          <span className="font-mono text-[10px] leading-none text-ink-faint">
            ▾
          </span>
        </MapTileButton>
      </MapTile>
      {open && (
        <>
          <button
            type="button"
            aria-label="Zatvori"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 cursor-default"
          />
          <PanelBody departTime={departTime} now={now} onPick={onChange} />
        </>
      )}
    </div>
  )
}
