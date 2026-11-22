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
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40" />
        )}
      </div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="mt-6 self-start border border-hairline-strong bg-white px-5 py-2.5 text-body text-ink-2 transition-[transform,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-hairline-strong hover:text-ink active:scale-[0.98]"
        aria-expanded={expanded}
      >
        {expanded ? collapseLabel : expandLabel}
      </button>
    </div>
  )
}
