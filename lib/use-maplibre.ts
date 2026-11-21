import { useEffect, useRef } from "react"
import type { DependencyList, RefObject } from "react"

import { MapLibreMap } from "@/lib/maplibre"
import type { GeoJSONSource, MapOptions } from "@/lib/maplibre"

/**
 * One MapLibre map bound to a container div: built on mount (and again whenever
 * `deps` change) without the default attribution control, then torn down with
 * whatever cleanup `setup` returned. Controls, layers and handlers belong in
 * `setup`.
 */
export function useMapLibre(
  options: Omit<MapOptions, "container" | "attributionControl">,
  setup: (map: MapLibreMap) => (() => void) | void,
  deps: DependencyList
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)

  useEffect(() => {
    if (!containerRef.current) {
      return
    }
    const map = new MapLibreMap({
      ...options,
      container: containerRef.current,
      attributionControl: false,
    })
    mapRef.current = map
    const teardown = setup(map)
    return () => {
      teardown?.()
      map.remove()
      mapRef.current = null
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- the caller names what rebuilds its map; options and setup are fresh closures every render
  }, deps)

  return { containerRef, mapRef }
}

/**
 * Pushes `data` into a GeoJSON source that the map's load handler creates. The
 * source only exists once that handler has run, so its absence is exactly the
 * signal that we still have to wait for it.
 */
export function useGeoJSONSourceData(
  mapRef: RefObject<MapLibreMap | null>,
  sourceId: string,
  data: GeoJSON.GeoJSON | undefined
) {
  useEffect(() => {
    const map = mapRef.current
    if (!map || !data) {
      return
    }
    const apply = () => {
      void map.getSource<GeoJSONSource>(sourceId)?.setData(data)
    }
    if (map.getSource(sourceId)) {
      apply()
    } else {
      map.once("load", apply)
    }
  }, [mapRef, sourceId, data])
}
