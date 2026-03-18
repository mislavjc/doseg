"use client"

import { useEffect } from "react"
import { init } from "@plausible-analytics/tracker"
import { SITE_DOMAIN } from "@/lib/constants"

export function PlausibleProvider() {
  useEffect(() => {
    init({ domain: SITE_DOMAIN })
  }, [])

  return null
}
