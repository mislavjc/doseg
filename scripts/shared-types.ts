/** An OSM element from the PBF parser. */
export interface OsmItem {
  type: "node" | "way" | "relation"
  id: number
  lat?: number
  lon?: number
  tags?: Record<string, string>
  refs?: number[]
}

/** A weighted graph edge (distance in centimeters). */
export interface Edge {
  from: number
  to: number
  distCm: number
}
