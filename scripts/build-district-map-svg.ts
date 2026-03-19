import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data")
const MAP_OUTPUT_PATH = join(process.cwd(), "public", "district-map.svg")
const BAJS_MAP_OUTPUT_PATH = join(
  process.cwd(),
  "public",
  "district-bajs-map.svg"
)
const EMBLEM_OUTPUT_PATH = join(
  process.cwd(),
  "public",
  "district-emblems.json"
)

const VIEWBOX_WIDTH = 960
const VIEWBOX_HEIGHT = 620
const PADDING = 28
const LABEL_MIN_AREA = 4000
const EMBLEM_SIZE = 56
const EMBLEM_PADDING = 4

type Point = [number, number]
type Ring = Point[]
type PolygonRings = Ring[]

interface DistrictScore {
  name: string
  osmId: number
  population?: number
  sampleCount: number
  avgReachableCells: number
  bajsAvgReachableCells?: number
  bajsBoostPct?: number
  bajsStations?: number
  rank: number
  score: number
  bestPoint: { lat: number; lon: number }
  tramLines: string[]
  busLines: string[]
  stops: number
  avgHeadwayMin: number
}

interface ScoreData {
  generatedAt: string
  departureTime: string
  gridSpacingM: number
  maxMinutes: number
  totalSamplePoints: number
  totalGridCells: number
  bajsTotalStations?: number
  districts: DistrictScore[]
}

interface DistrictProperties {
  name?: string
  osmId?: number
  score?: number
  reachPct?: string
  maxMinutes?: number
  population?: number
  bajsBoostPct?: number
  bajsStations?: number
}

interface Projector {
  project(point: Point): Point
}

interface DistrictShape {
  id: number
  name: string
  score: number
  reachPct: string
  maxMinutes?: number
  population?: number
  bajsBoostPct?: number
  bajsStations?: number
  path: string
  centroid: Point
  area: number
}

function pct(cells: number, total: number): string {
  const p = (cells / total) * 100
  if (p < 0.1) return "<0,1"
  if (p < 1) return p.toFixed(1).replace(".", ",")
  return Math.round(p).toString()
}

function enrichGeoJSON(
  geojson: GeoJSON.FeatureCollection,
  data: ScoreData
): GeoJSON.FeatureCollection {
  const scoreMap = new Map(
    data.districts.map((district) => [district.osmId, district])
  )

  for (const feature of geojson.features) {
    const score = scoreMap.get(Number(feature.properties?.osmId))
    if (!score || !feature.properties) continue

    feature.properties.score = score.score
    feature.properties.rank = score.rank
    feature.properties.reachPct = pct(
      score.avgReachableCells,
      data.totalGridCells
    )
    feature.properties.maxMinutes = data.maxMinutes
    feature.properties.population = score.population
    feature.properties.bajsBoostPct = score.bajsBoostPct ?? 0
    feature.properties.bajsStations = score.bajsStations ?? 0
  }

  return geojson
}

function getPolygons(geometry: GeoJSON.Geometry | null): PolygonRings[] {
  if (!geometry) return []
  if (geometry.type === "Polygon") {
    return [geometry.coordinates as PolygonRings]
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates as PolygonRings[]
  }
  return []
}

function scoreColor(score: number): string {
  if (score >= 70) return "#16a34a"
  if (score >= 50) return "#0891b2"
  if (score >= 25) return "#2563eb"
  return "#9333ea"
}

function bajsBoostColor(boostPct: number): string {
  if (boostPct >= 40) return "#d97706"
  if (boostPct >= 25) return "#f59e0b"
  if (boostPct >= 10) return "#fbbf24"
  if (boostPct > 0) return "#fcd34d"
  return "#94a3b8"
}

function roundCoord(value: number): number {
  return Math.round(value * 10) / 10
}

function createProjector(geojson: GeoJSON.FeatureCollection): Projector {
  let minLat = Infinity
  let maxLat = -Infinity
  let minLon = Infinity
  let maxLon = -Infinity

  for (const feature of geojson.features) {
    for (const polygon of getPolygons(feature.geometry)) {
      for (const ring of polygon) {
        for (const [lon, lat] of ring) {
          minLat = Math.min(minLat, lat)
          maxLat = Math.max(maxLat, lat)
          minLon = Math.min(minLon, lon)
          maxLon = Math.max(maxLon, lon)
        }
      }
    }
  }

  const midLat = (minLat + maxLat) / 2
  const lonFactor = Math.cos((midLat * Math.PI) / 180)
  const minX = minLon * lonFactor
  const maxX = maxLon * lonFactor
  const width = Math.max(maxX - minX, 1e-6)
  const height = Math.max(maxLat - minLat, 1e-6)
  const scale = Math.min(
    (VIEWBOX_WIDTH - PADDING * 2) / width,
    (VIEWBOX_HEIGHT - PADDING * 2) / height
  )

  const scaledWidth = width * scale
  const scaledHeight = height * scale
  const offsetX = (VIEWBOX_WIDTH - scaledWidth) / 2
  const offsetY = (VIEWBOX_HEIGHT - scaledHeight) / 2

  return {
    project([lon, lat]) {
      const x = offsetX + (lon * lonFactor - minX) * scale
      const y = VIEWBOX_HEIGHT - offsetY - (lat - minLat) * scale
      return [roundCoord(x), roundCoord(y)]
    },
  }
}

function ringToPath(ring: Ring, projector: Projector): string {
  if (ring.length === 0) return ""
  const [first, ...rest] = ring.map((point) => projector.project(point))
  return `M${first[0]} ${first[1]}${rest.map(([x, y]) => `L${x} ${y}`).join("")}Z`
}

function geometryToPath(
  geometry: GeoJSON.Geometry | null,
  projector: Projector
): string {
  return getPolygons(geometry)
    .flatMap((polygon) => polygon.map((ring) => ringToPath(ring, projector)))
    .filter(Boolean)
    .join("")
}

function geometryToEmblemPath(
  geometry: GeoJSON.Geometry | null,
  size: number = EMBLEM_SIZE
): string {
  const rawRings: Ring[] = []
  let minLat = Infinity
  let maxLat = -Infinity

  for (const polygon of getPolygons(geometry)) {
    for (const ring of polygon) {
      const points = ring.map(([lon, lat]) => {
        minLat = Math.min(minLat, lat)
        maxLat = Math.max(maxLat, lat)
        return [lon, lat] as Point
      })
      rawRings.push(points)
    }
  }

  if (rawRings.length === 0) return ""

  const midLat = (minLat + maxLat) / 2
  const lonFactor = Math.cos((midLat * Math.PI) / 180)
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  const projectedRings = rawRings.map((ring) =>
    ring.map(([lon, lat]) => {
      const point: Point = [lon * lonFactor, lat]
      minX = Math.min(minX, point[0])
      maxX = Math.max(maxX, point[0])
      minY = Math.min(minY, point[1])
      maxY = Math.max(maxY, point[1])
      return point
    })
  )

  const innerSize = size - EMBLEM_PADDING * 2
  const width = Math.max(maxX - minX, 1e-6)
  const height = Math.max(maxY - minY, 1e-6)
  const scale = Math.min(innerSize / width, innerSize / height)
  const centerX = minX + width / 2
  const centerY = minY + height / 2

  return projectedRings
    .map(
      (ring) =>
        `${ring
          .map(([x, y], index) => {
            const px = roundCoord(
              EMBLEM_PADDING + innerSize / 2 + (x - centerX) * scale
            )
            const py = roundCoord(
              EMBLEM_PADDING + innerSize / 2 - (y - centerY) * scale
            )
            return `${index === 0 ? "M" : "L"}${px} ${py}`
          })
          .join("")}Z`
    )
    .join("")
}

function polygonArea(points: Point[]): number {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    area += x1 * y2 - x2 * y1
  }
  return area / 2
}

function polygonCentroid(points: Point[]): Point | null {
  let crossSum = 0
  let cx = 0
  let cy = 0

  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    const cross = x1 * y2 - x2 * y1
    crossSum += cross
    cx += (x1 + x2) * cross
    cy += (y1 + y2) * cross
  }

  if (Math.abs(crossSum) < 1e-6) return null
  return [roundCoord(cx / (3 * crossSum)), roundCoord(cy / (3 * crossSum))]
}

function bboxCenter(points: Point[]): Point {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  for (const [x, y] of points) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }

  return [roundCoord((minX + maxX) / 2), roundCoord((minY + maxY) / 2)]
}

function featureLabelPoint(
  geometry: GeoJSON.Geometry | null,
  projector: Projector
): { centroid: Point; area: number } {
  let bestArea = 0
  let bestCentroid: Point = [VIEWBOX_WIDTH / 2, VIEWBOX_HEIGHT / 2]

  for (const polygon of getPolygons(geometry)) {
    const outerRing = polygon[0]
    if (!outerRing?.length) continue

    const projected = outerRing.map((point) => projector.project(point))
    const area = Math.abs(polygonArea(projected))
    if (area <= bestArea) continue

    bestArea = area
    bestCentroid = polygonCentroid(projected) ?? bboxCenter(projected)
  }

  return { centroid: bestCentroid, area: bestArea }
}

function formatLabelLines(name: string): string[] {
  const words = name.trim().split(/\s+/)
  if (words.length <= 1) return [name]
  if (words.length === 2) return words

  const midpoint = Math.ceil(words.length / 2)
  return [words.slice(0, midpoint).join(" "), words.slice(midpoint).join(" ")]
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function featureTitle(shape: DistrictShape): string {
  const lines = [
    shape.name,
    `${shape.score}/100`,
    `${shape.reachPct}% grada dostupno za ${shape.maxMinutes ?? 30} min`,
  ]

  if (shape.population) {
    lines.push(`${shape.population.toLocaleString("hr-HR")} stanovnika`)
  }

  return lines.join("\n")
}

function buildDistrictShapes(
  geojson: GeoJSON.FeatureCollection
): DistrictShape[] {
  const projector = createProjector(geojson)
  const shapes: DistrictShape[] = []

  for (const [index, feature] of geojson.features.entries()) {
    const properties = (feature.properties ?? {}) as DistrictProperties
    const path = geometryToPath(feature.geometry, projector)
    if (!path) continue

    const { centroid, area } = featureLabelPoint(feature.geometry, projector)
    shapes.push({
      id: properties.osmId ?? index,
      name: properties.name ?? "Nepoznata četvrt",
      score: properties.score ?? 0,
      reachPct: properties.reachPct ?? "0",
      maxMinutes: properties.maxMinutes,
      population: properties.population,
      bajsBoostPct: properties.bajsBoostPct,
      bajsStations: properties.bajsStations,
      path,
      centroid,
      area,
    })
  }

  return shapes
}

function buildDistrictEmblems(
  geojson: GeoJSON.FeatureCollection
): Record<string, string> {
  const emblems: Record<string, string> = {}

  for (const [index, feature] of geojson.features.entries()) {
    const osmId = Number(feature.properties?.osmId ?? index)
    const path = geometryToEmblemPath(feature.geometry)
    if (!path || Number.isNaN(osmId)) continue
    emblems[String(osmId)] = path
  }

  return emblems
}

function buildDistrictMapSvg(geojson: GeoJSON.FeatureCollection): string {
  const shapes = buildDistrictShapes(geojson)

  const districtsMarkup = shapes
    .map((shape) => {
      const labelLines = formatLabelLines(shape.name)
      const labelMarkup =
        shape.area >= LABEL_MIN_AREA
          ? `<text class="label" x="${shape.centroid[0]}" y="${shape.centroid[1]}">${labelLines
              .map(
                (line, index) =>
                  `<tspan x="${shape.centroid[0]}" dy="${index === 0 ? "-0.35em" : "1.1em"}">${escapeXml(line)}</tspan>`
              )
              .join(
                ""
              )}<tspan class="score" x="${shape.centroid[0]}" dy="1.15em">${shape.score}</tspan></text>`
          : ""

      return `<g><path class="district" d="${shape.path}" fill="${scoreColor(shape.score)}" tabindex="0"><title>${escapeXml(featureTitle(shape))}</title></path>${labelMarkup}</g>`
    })
    .join("")

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="title desc">
<title id="title">Karta povezanosti zagrebačkih četvrti</title>
<desc id="desc">Choropleth karta koja prikazuje ocjenu povezanosti po gradskoj četvrti. Zeleno označava bolju povezanost, a ljubičasto slabiju.</desc>
<style>
.district{fill-opacity:.42;stroke:rgba(226,232,240,.24);stroke-width:1.2;vector-effect:non-scaling-stroke;transition:fill-opacity .15s ease,stroke .15s ease;cursor:pointer;outline:none}
.district:hover,.district:focus{fill-opacity:.7;stroke:rgba(255,255,255,.55)}
.label{fill:rgba(203,213,225,.85);font:11px "Inter","Segoe UI",sans-serif;text-anchor:middle;pointer-events:none;user-select:none}
.score{fill:#f8fafc;font-size:12px;font-weight:600}
</style>
${districtsMarkup}
</svg>`
}

function bajsFeatureTitle(shape: DistrictShape): string {
  const boost = shape.bajsBoostPct ?? 0
  const stations = shape.bajsStations ?? 0
  const lines = [
    shape.name,
    boost > 0 ? `+${boost}% dosega s BAJS biciklima` : "Nema utjecaja BAJS-a",
    `${stations} BAJS ${stations === 1 ? "stanica" : "stanica"}`,
  ]

  if (shape.population) {
    lines.push(`${shape.population.toLocaleString("hr-HR")} stanovnika`)
  }

  return lines.join("\n")
}

function buildBajsMapSvg(geojson: GeoJSON.FeatureCollection): string {
  const shapes = buildDistrictShapes(geojson)

  const districtsMarkup = shapes
    .map((shape) => {
      const boost = shape.bajsBoostPct ?? 0
      const stations = shape.bajsStations ?? 0
      const labelLines = formatLabelLines(shape.name)
      const labelMarkup =
        shape.area >= LABEL_MIN_AREA
          ? `<text class="label" x="${shape.centroid[0]}" y="${shape.centroid[1]}">${labelLines
              .map(
                (line, index) =>
                  `<tspan x="${shape.centroid[0]}" dy="${index === 0 ? "-0.35em" : "1.1em"}">${escapeXml(line)}</tspan>`
              )
              .join(
                ""
              )}<tspan class="score" x="${shape.centroid[0]}" dy="1.15em">${boost > 0 ? `+${boost}%` : "-"}</tspan><tspan class="stations" x="${shape.centroid[0]}" dy="1.15em">${stations} st.</tspan></text>`
          : ""

      return `<g><path class="district" d="${shape.path}" fill="${bajsBoostColor(boost)}" tabindex="0"><title>${escapeXml(bajsFeatureTitle(shape))}</title></path>${labelMarkup}</g>`
    })
    .join("")

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="bajs-title bajs-desc">
<title id="bajs-title">Karta utjecaja BAJS bicikala po četvrtima</title>
<desc id="bajs-desc">Choropleth karta koja prikazuje koliko BAJS bike-sharing poboljšava dostupnost po gradskoj četvrti. Tamniji amber označava veće poboljšanje.</desc>
<style>
.district{fill-opacity:.50;stroke:rgba(226,232,240,.24);stroke-width:1.2;vector-effect:non-scaling-stroke;transition:fill-opacity .15s ease,stroke .15s ease;cursor:pointer;outline:none}
.district:hover,.district:focus{fill-opacity:.75;stroke:rgba(255,255,255,.55)}
.label{fill:rgba(203,213,225,.85);font:11px "Inter","Segoe UI",sans-serif;text-anchor:middle;pointer-events:none;user-select:none}
.score{fill:#f8fafc;font-size:12px;font-weight:600}
.stations{fill:rgba(203,213,225,.6);font-size:9px;font-weight:400}
</style>
${districtsMarkup}
</svg>`
}

function main() {
  const scorePath = join(DATA_DIR, "district-scores.json")
  const geojsonPath = join(DATA_DIR, "districts.geojson")

  if (!existsSync(geojsonPath)) {
    console.warn("Skipping district asset build: missing district data")
    return
  }

  const rawGeojson = JSON.parse(
    readFileSync(geojsonPath, "utf-8")
  ) as GeoJSON.FeatureCollection
  mkdirSync(join(process.cwd(), "public"), { recursive: true })

  const emblems = buildDistrictEmblems(rawGeojson)
  writeFileSync(EMBLEM_OUTPUT_PATH, JSON.stringify(emblems))
  console.log(`Wrote ${EMBLEM_OUTPUT_PATH}`)

  if (!existsSync(scorePath)) {
    console.warn("Skipping district SVG build: missing score data")
    return
  }

  const scoreData = JSON.parse(readFileSync(scorePath, "utf-8")) as ScoreData
  const enrichedGeojson = enrichGeoJSON(rawGeojson, scoreData)

  const svg = buildDistrictMapSvg(enrichedGeojson)
  writeFileSync(MAP_OUTPUT_PATH, svg)
  console.log(`Wrote ${MAP_OUTPUT_PATH}`)

  if (scoreData.bajsTotalStations && scoreData.bajsTotalStations > 0) {
    const bajsSvg = buildBajsMapSvg(enrichedGeojson)
    writeFileSync(BAJS_MAP_OUTPUT_PATH, bajsSvg)
    console.log(`Wrote ${BAJS_MAP_OUTPUT_PATH}`)
  }
}

main()
