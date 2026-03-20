"use client"

import { useEffect } from "react"
import { SITE_DOMAIN } from "@/lib/constants"

let initialized = false

export function PlausibleProvider() {
  useEffect(() => {
    if (initialized) return
    initialized = true
    import("@plausible-analytics/tracker").then(({ init }) => {
      init({ domain: SITE_DOMAIN })
    })
  }, [])

  return null
}
