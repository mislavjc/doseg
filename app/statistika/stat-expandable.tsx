"use client"

import { useState } from "react"

export function CollapsibleContent({
  children,
  expandLabel = "Prikaži više",
  collapseLabel = "Suzi prikaz",
  defaultExpanded = false,
  previewHeight = "20rem",
}: {
  children: React.ReactNode
  expandLabel?: string
  collapseLabel?: string
  defaultExpanded?: boolean
  previewHeight?: string
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="flex flex-col">
      <div
        className={expanded ? "" : "relative overflow-hidden"}
        style={expanded ? undefined : { maxHeight: previewHeight }}
      >
        {children}
        {!expanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white to-transparent dark:from-[#171717]" />
        )}
      </div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="mt-6 self-start rounded-full border border-slate-200 bg-white px-5 py-2.5 text-[13px] font-medium text-slate-600 transition-[transform,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-slate-300 hover:text-slate-900 active:scale-[0.98] dark:border-white/10 dark:bg-zinc-900/40 dark:text-slate-300 dark:hover:border-white/20"
        aria-expanded={expanded}
      >
        {expanded ? collapseLabel : expandLabel}
      </button>
    </div>
  )
}
