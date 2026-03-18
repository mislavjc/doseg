"use client"

import { useEffect } from "react"
import Plausible from "@plausible-analytics/tracker"
import { SITE_DOMAIN } from "@/lib/constants"

export function PlausibleProvider() {
  useEffect(() => {
    const plausible = Plausible({ domain: SITE_DOMAIN })
    plausible.enableAutoPageviews()
  }, [])

  return null
}
