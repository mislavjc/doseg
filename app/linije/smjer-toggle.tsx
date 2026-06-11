"use client"

import { cn } from "@/lib/utils"

/**
 * Mobile-only segmented toggle shared by the stop list (smjer) and the
 * timetable (departure terminal). Desktop shows both columns instead.
 */
export function SmjerToggle({
  labels,
  active,
  onSelect,
  size = "body",
}: {
  labels: string[]
  active: number
  onSelect: (i: number) => void
  /** "body" = mono 16 (stanice), "label" = mono 12 (vozni red) */
  size?: "body" | "label"
}) {
  return (
    <div className="flex gap-2.5 sm:hidden">
      {labels.map((label, i) => (
        <button
          key={label}
          type="button"
          onClick={() => onSelect(i)}
          aria-pressed={active === i}
          className={cn(
            "border px-3.5 py-1.5 font-mono transition-colors",
            size === "body" ? "text-[16px] leading-5" : "text-label",
            active === i
              ? "border-zg-blue bg-zg-blue text-white"
              : "border-hairline-strong text-ink-muted"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
