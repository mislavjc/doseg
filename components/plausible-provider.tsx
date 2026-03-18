"use client"

import { useEffect } from "react"
import { SITE_DOMAIN } from "@/lib/constants"

export function PlausibleProvider() {
  useEffect(() => {
    import("@plausible-analytics/tracker").then(({ init }) => {
      init({ domain: SITE_DOMAIN })
    })
  }, [])

  return null
}
