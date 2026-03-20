"use client"

import { useCallback } from "react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)
const ITEM_H = 32 // px per row

function pad(n: number) {
  return String(n).padStart(2, "0")
}

export function TimePicker({
  value,
  onChange,
}: {
  value: string // "HH:MM"
  onChange: (value: string) => void
}) {
  const [h, m] = value.split(":").map(Number)
  // Snap minute to nearest 5, carrying into the hour if needed (e.g. 14:58 → 15:00)
  const rawSnap = Math.round(m / 5) * 5
  const displayH = (h + Math.floor(rawSnap / 60)) % 24
  const displayM = rawSnap % 60

  return (
    <Popover>
      <PopoverTrigger className="flex cursor-pointer flex-col items-center outline-none">
        <span className="text-[13px] text-slate-200 tabular-nums transition-colors hover:text-white">
          {pad(displayH)}:{pad(displayM)}
        </span>
        <span className="text-[9px] text-slate-400">polazak</span>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="center"
        sideOffset={8}
        className="w-auto gap-0 rounded-xl bg-[rgba(20,20,28,0.95)] p-1 ring-1 ring-white/10 backdrop-blur-xl"
      >
        <div className="flex gap-0.5">
          <ScrollColumn
            items={HOURS}
            selected={displayH}
            onSelect={(v) => onChange(`${pad(v)}:${pad(displayM)}`)}
            label="h"
          />
          <div className="flex w-4 items-center justify-center text-[13px] text-slate-500">
            :
          </div>
          <ScrollColumn
            items={MINUTES}
            selected={displayM}
            onSelect={(v) => onChange(`${pad(displayH)}:${pad(v)}`)}
            label="m"
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ScrollColumnItem({
  item,
  selected,
  onSelect,
}: {
  item: number
  selected: boolean
  onSelect: (value: number) => void
}) {
  return (
    <button
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(item)}
      className={`flex w-full items-center justify-center rounded-lg text-[14px] tabular-nums transition-colors ${
        selected
          ? "bg-white/10 font-semibold text-white"
          : "text-slate-400 hover:text-slate-200"
      }`}
      style={{ height: ITEM_H }}
    >
      {pad(item)}
    </button>
  )
}

function ScrollColumn({
  items,
  selected,
  onSelect,
  label,
}: {
  items: number[]
  selected: number
  onSelect: (value: number) => void
  label: string
}) {
  const attachRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return
      const idx = items.indexOf(selected)
      if (idx >= 0) {
        node.scrollTop = idx * ITEM_H
      }
    },
    [items, selected]
  )

  return (
    <div
      ref={attachRef}
      className="scrollbar-hide relative h-[160px] w-[52px] overflow-y-auto scroll-smooth"
      role="listbox"
      aria-label={label}
    >
      <div style={{ height: ITEM_H * 2 }} />
      {items.map((item) => (
        <ScrollColumnItem
          key={item}
          item={item}
          selected={item === selected}
          onSelect={onSelect}
        />
      ))}
      <div style={{ height: ITEM_H * 2 }} />
    </div>
  )
}
