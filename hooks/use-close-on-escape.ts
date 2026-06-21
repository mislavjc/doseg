"use client"

import { useEffect, useRef } from "react"

/** Close a transient overlay (popover, dropdown) on Escape while it's open.
 * Subscribes once per open-change; the callback is read through a ref so an
 * inline arrow doesn't re-bind the listener on every render. */
export function useCloseOnEscape(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])
}
