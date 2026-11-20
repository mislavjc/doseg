import { setWorkerUrl } from "maplibre-gl"

setWorkerUrl(
  new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString()
)

export * from "maplibre-gl"
