"use client"

import dynamic from "next/dynamic"
import { useEffect, useState, type ComponentProps } from "react"

import type BajsHeroMapImpl from "./hero-map"

/**
 * The hero map is maplibre, about 290K of script plus its stylesheet, and the
 * band already shows the baked `bajs-hero.png` underneath. So the page paints
 * and hydrates without it, and the map chunk is only requested once the
 * browser has a quiet moment (or after two seconds, whichever comes first).
 */
const BajsHeroMap = dynamic(() => import("./hero-map"), { ssr: false })

const IDLE_TIMEOUT_MS = 2000

export function LazyBajsHeroMap(props: ComponentProps<typeof BajsHeroMapImpl>) {
  const [idle, setIdle] = useState(false)

  useEffect(() => {
    // Safari has no requestIdleCallback; there a plain timer stands in for it.
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(() => setIdle(true), {
        timeout: IDLE_TIMEOUT_MS,
      })
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(() => setIdle(true), IDLE_TIMEOUT_MS)
    return () => clearTimeout(id)
  }, [])

  return idle ? <BajsHeroMap {...props} /> : null
}
