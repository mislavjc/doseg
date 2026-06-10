"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export type GeocodeSuggestion = {
  display_name: string
  lat: number
  lon: number
  kind?: "hospital" | "school" | "park" | "street" | "address" | "place"
}

function useDebouncedFetch(query: string, onResults: () => void) {
  const [data, setData] = useState<GeocodeSuggestion[]>([])
  const [pending, setPending] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (abortRef.current) abortRef.current.abort()
    if (query.length < 2) return

    timerRef.current = setTimeout(() => {
      const controller = new AbortController()
      abortRef.current = controller
      setPending(true)
      fetch(`/api/geocode?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((d) => { if (!controller.signal.aborted) { const r = Array.isArray(d) ? d : []; setData(r); setPending(false); if (r.length > 0) onResults() } })
        .catch((err) => { if (!(err instanceof DOMException && err.name === "AbortError")) setPending(false) })
    }, 350)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [query, onResults])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const results = query.length < 2 ? [] : data
  const loading = query.length >= 2 && pending
  return { results, loading, cancel }
}

export function useAddressSearch() {
  const [query, setQuery] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const openOnResults = useCallback(() => setIsOpen(true), [])
  const { results, loading, cancel } = useDebouncedFetch(query, openOnResults)

  const select = useCallback((result: GeocodeSuggestion) => {
    setQuery(result.display_name.split(",")[0])
    setIsOpen(false)
  }, [])

  const clear = useCallback(() => {
    setQuery("")
    setIsOpen(false)
    cancel()
  }, [cancel])

  return { query, setQuery, results, loading, isOpen, setIsOpen, select, clear }
}
