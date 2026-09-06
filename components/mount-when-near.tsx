"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

/**
 * Renders `fallback` until the box comes within `rootMargin` of the viewport,
 * then swaps in `children` for good. Pairs with a `dynamic()` import so a
 * heavy client-only chunk (three.js, maplibre) is fetched only when a visitor
 * scrolls toward it instead of on every page load.
 */
export function MountWhenNear({
  children,
  fallback,
  rootMargin = "600px",
  className,
}: {
  children: ReactNode
  fallback: ReactNode
  rootMargin?: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true)
          io.disconnect()
        }
      },
      { rootMargin }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [near, rootMargin])

  return (
    <div ref={ref} className={className}>
      {near ? children : fallback}
    </div>
  )
}
