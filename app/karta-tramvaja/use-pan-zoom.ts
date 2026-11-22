"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

export type View = { x: number; y: number; s: number }

const MIN_ZOOM = 0.6
const MAX_ZOOM = 12

const isElement = (target: EventTarget): target is Element =>
  "closest" in target

/** Zoom toward/away from a point, clamping scale to [MIN_ZOOM, MAX_ZOOM]. */
function zoomAtPoint(v: View, factor: number, px: number, py: number): View {
  const ns = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.s * factor))
  return {
    x: px - (px - v.x) * (ns / v.s),
    y: py - (py - v.y) * (ns / v.s),
    s: ns,
  }
}

function useWheelZoom(
  containerRef: React.RefObject<HTMLDivElement | null>,
  setView: React.Dispatch<React.SetStateAction<View>>
) {
  // passive: false required to prevent page scroll
  useEffect(() => {
    const el = containerRef.current
    if (!el) {
      return
    }
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      setView((v) =>
        zoomAtPoint(
          v,
          e.deltaY > 0 ? 0.92 : 1.08,
          e.clientX - rect.left,
          e.clientY - rect.top
        )
      )
    }
    el.addEventListener("wheel", handler, { passive: false })
    return () => el.removeEventListener("wheel", handler)
  }, [containerRef, setView])
}

function usePointers(
  containerRef: React.RefObject<HTMLDivElement | null>,
  setView: React.Dispatch<React.SetStateAction<View>>
) {
  const ptrs = useRef(new Map<number, { x: number; y: number }>())
  const pinchDist = useRef<number | null>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)

  const onDown = useCallback(
    (e: React.PointerEvent) => {
      const ui = isElement(e.target) ? e.target.closest("[data-ui]") : null
      if (ui && !ui.closest("svg")) {
        return
      }
      ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (ptrs.current.size === 2) {
        const [a, b] = [...ptrs.current.values()]
        pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y)
      }
      if (ui) {
        return
      }
      dragStart.current = { x: e.clientX, y: e.clientY }
      containerRef.current?.setPointerCapture(e.pointerId)
    },
    [containerRef]
  )

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      const prev = ptrs.current.get(e.pointerId)
      if (!prev) {
        return
      }
      ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (ptrs.current.size === 1) {
        setView((v) => ({
          ...v,
          x: v.x + e.clientX - prev.x,
          y: v.y + e.clientY - prev.y,
        }))
        return
      }
      const pts = [...ptrs.current.values()]
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const rect = containerRef.current?.getBoundingClientRect()
      if (pinchDist.current !== null && rect) {
        const factor = dist / pinchDist.current
        const cx = (pts[0].x + pts[1].x) / 2 - rect.left
        const cy = (pts[0].y + pts[1].y) / 2 - rect.top
        setView((v) => zoomAtPoint(v, factor, cx, cy))
      }
      pinchDist.current = dist
    },
    [containerRef, setView]
  )

  /** Returns true when the gesture was a tap on the background, not a drag. */
  const onUp = useCallback((e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId)
    if (ptrs.current.size < 2) {
      pinchDist.current = null
    }
    const ds = dragStart.current
    dragStart.current = null
    return ds !== null && Math.hypot(e.clientX - ds.x, e.clientY - ds.y) < 4
  }, [])

  return { onDown, onMove, onUp }
}

/**
 * Pan, pinch and wheel zoom over a CSS-transformed SVG. `start` picks the
 * opening view from the container size, so mobile and desktop can open on
 * different zooms.
 */
export function usePanZoom(start: (width: number, height: number) => View) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, s: 1 })
  const startRef = useRef(start)
  const home = useCallback(() => {
    const el = containerRef.current
    if (el) {
      setView(startRef.current(el.clientWidth, el.clientHeight))
    }
  }, [])
  useLayoutEffect(home, [home])
  useWheelZoom(containerRef, setView)
  const pointers = usePointers(containerRef, setView)
  const zoomBy = useCallback((factor: number) => {
    const el = containerRef.current
    if (el) {
      setView((v) =>
        zoomAtPoint(v, factor, el.clientWidth / 2, el.clientHeight / 2)
      )
    }
  }, [])
  return { containerRef, view, ...pointers, zoomBy, home }
}
