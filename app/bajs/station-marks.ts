import type maplibregl from "maplibre-gl"

/**
 * How a station is drawn on the /bajs map: a needle.
 *
 * The hard part is not decoration, it is saying *where* a station is. A disc
 * centred on the point makes the location a 20 px fuzz, and at 188 stations a
 * field of discs reads as texture rather than data. A needle separates the two:
 * the foot is the spot, the head is the reading, and overlapping heads still
 * leave every foot visible. Head solid when bikes are waiting, hollow when the
 * stand is empty.
 */

export const STATION_LAYER = "station-icon"
const HOVER_LAYER = "station-icon-hover"

const BLUE = "#0e51c9"
const WHITE = "#ffffff"
const INK = "#101418"

/** Icons are drawn at 2x and registered with pixelRatio 2, so they stay sharp. */
const PR = 2

const W = 22
const H = 34
const HEAD_Y = 9

function disc(
  ctx: CanvasRenderingContext2D,
  y: number,
  r: number,
  fill: string,
  stroke: string,
  width: number
) {
  ctx.beginPath()
  ctx.arc(W / 2, y, r, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = width
  ctx.strokeStyle = stroke
  ctx.stroke()
}

function needle(filled: boolean, hover: boolean): ImageData {
  const c = document.createElement("canvas")
  c.width = W * PR
  c.height = H * PR
  const ctx = c.getContext("2d")
  if (!ctx) throw new Error("no 2d context")
  ctx.scale(PR, PR)

  const ink = hover ? INK : BLUE
  // White under-stroke first: on a blue speckled fabric a bare hairline
  // disappears into the buildings, and the stem is what carries the eye from
  // the reading down to the spot it belongs to.
  ctx.lineCap = "butt"
  for (const [width, colour] of [
    [4.5, WHITE],
    [2, ink],
  ] as const) {
    ctx.strokeStyle = colour
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(W / 2, H - 2)
    ctx.lineTo(W / 2, HEAD_Y)
    ctx.stroke()
  }

  // Foot: the exact spot, small enough to stay a point.
  disc(ctx, H - 2.5, 2.25, ink, WHITE, 1.5)
  disc(ctx, HEAD_Y, 7.5, filled ? ink : WHITE, filled ? WHITE : ink, 2.25)
  return ctx.getImageData(0, 0, c.width, c.height)
}

const iconId = (filled: boolean, hover: boolean) =>
  `station-${filled ? "full" : "empty"}${hover ? "-hover" : ""}`

/** Ramp from an empty stand to a full one, for use inside a zoom ramp. */
const byBikes = (
  low: number,
  high: number
): maplibregl.ExpressionSpecification => [
  "interpolate",
  ["linear"],
  ["get", "bikesAvailable"],
  0,
  low,
  20,
  high,
]

/** Layout of the icon layer, shared by the base layer and its hover twin. */
function iconLayout(hover: boolean): maplibregl.SymbolLayerSpecification["layout"] {
  return {
    "icon-image": [
      "case",
      [">", ["get", "bikesAvailable"], 0],
      iconId(true, hover),
      iconId(false, hover),
    ],
    // The foot stands on the coordinate, and every mark is drawn even where they
    // crowd: hiding stations to avoid collisions would be a lie.
    "icon-anchor": "bottom",
    "icon-allow-overlap": true,
    "icon-ignore-placement": true,
    // Zoom outermost, as MapLibre requires; the inner ramp lets a well stocked
    // stand sit a little taller than a nearly empty one.
    "icon-size": [
      "interpolate",
      ["linear"],
      ["zoom"],
      11,
      byBikes(0.6, 0.72),
      14,
      byBikes(0.82, 0.98),
      16,
      byBikes(1, 1.2),
    ],
  }
}

/** Draw every station. `STATION_LAYER` is what takes hover and clicks. */
export function addStationLayers(
  map: maplibregl.Map,
  data: GeoJSON.FeatureCollection
) {
  map.addSource("stations", { type: "geojson", data })
  for (const filled of [true, false]) {
    for (const hover of [true, false]) {
      map.addImage(iconId(filled, hover), needle(filled, hover), { pixelRatio: PR })
    }
  }
  map.addLayer({
    id: STATION_LAYER,
    type: "symbol",
    source: "stations",
    layout: iconLayout(false),
  })
  // A twin filtered down to the station under the cursor. Hover cannot ride on
  // the icon itself: `feature-state` is a paint-time value and `icon-image` is a
  // layout property, so a layer that reads one there never renders at all.
  map.addLayer({
    id: HOVER_LAYER,
    type: "symbol",
    source: "stations",
    filter: ["==", ["get", "stationId"], ""],
    layout: iconLayout(true),
  })
}

export function setStationHover(map: maplibregl.Map, stationId?: string | number) {
  map.setFilter(HOVER_LAYER, ["==", ["get", "stationId"], stationId ?? ""])
}
