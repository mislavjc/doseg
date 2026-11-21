/**
 * The CARTO dark-matter basemap, re-rendered from the OSM extract as a 1-bit
 * mask for the dither-crop engine.
 *
 * The heroes used to threshold CARTO's dark_nolabels raster tiles at gray < 6.
 * Its land is #090909, so that threshold kept exactly the near-black parts of
 * the style (CartoDB/basemap-styles, web-styles/dark-matter-no-labels.tm2):
 * buildings (#000), the fills of motorway, trunk, primary, secondary and
 * tertiary roads and their ramps (#030303), road tunnels (#040404) and rail
 * dashes (#000). Every lighter stroke drawn over them (road casings, minor and
 * service fills, paths, the rail casing) cut white channels through the
 * buildings. CARTO stopped serving those tiles without an API key in Nov 2026,
 * so this draws the same layers in the same order at the style's per-zoom
 * widths, in the same 256 px tile scale.
 *
 * Geometry comes from data/osm/croatia.osm.pbf (the extract setup-data.sh
 * downloads) and is cached under .cache/osm-basemap/, keyed by the extract's
 * size and mtime, so only the first run pays for the parse.
 */

import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"

import createParser from "osm-pbf-parser"
import through2 from "through2"

import { mercatorX, mercatorY } from "../../lib/geo"

const OSM_PBF = join(process.cwd(), "data", "osm", "croatia.osm.pbf")
const CACHE_DIR = join(process.cwd(), ".cache", "osm-basemap")
/** Bump when the parsed geometry changes shape, to invalidate old caches. */
const CACHE_VERSION = 2
/** Covers every baked crop, the city-wide home banner included. */
const BOX = { west: 13.9, south: 45.4, east: 18.1, north: 46.2 }

/** OpenMapTiles transportation classes, as CARTO's style keys them. */
const MOTORWAY = 1
const TRUNK = 2
const PRIMARY = 3
const SECONDARY = 4
const TERTIARY = 5
const MINOR = 6
const SERVICE = 7
const PATH = 8
const TRACK = 9
const RAIL = 10

const HIGHWAY_CLASS = new Map(
  Object.entries({
    motorway: MOTORWAY,
    trunk: TRUNK,
    primary: PRIMARY,
    secondary: SECONDARY,
    tertiary: TERTIARY,
    unclassified: MINOR,
    residential: MINOR,
    living_street: MINOR,
    road: MINOR,
    service: SERVICE,
    pedestrian: PATH,
    footway: PATH,
    cycleway: PATH,
    steps: PATH,
    path: PATH,
    bridleway: PATH,
    track: TRACK,
  })
)
const RAIL_TYPES = new Set(["rail", "narrow_gauge", "preserved", "funicular"])

const RAMP = 1
const TUNNEL = 2

interface PbfItem {
  type: "node" | "way" | "relation"
  id: number
  lat?: number
  lon?: number
  tags?: Record<string, string>
  refs?: Array<number>
  members?: Array<{ type: string; id: number; role: string }>
}

/** Polylines or polygon rings as flat normalised web-mercator x,y pairs. */
interface Shapes {
  xy: Float64Array
  /** Part i spans vertices start[i] .. start[i + 1]. */
  start: Uint32Array
  /** minX, minY, maxX, maxY per group, for crop culling. */
  bounds: Float64Array
}

export interface Basemap {
  /** Identifies the extract; part of every crop signature. */
  source: string
  /** Building rings; polygon p spans rings polyStart[p] .. polyStart[p + 1]. */
  rings: Shapes
  polyStart: Uint32Array
  /** One polyline per road or rail way. */
  lines: Shapes
  lineClass: Uint8Array
  lineFlags: Uint8Array
}

const isBuilding = (tags?: Record<string, string>) =>
  !!tags?.building && tags.building !== "no"

function lineKind(tags: Record<string, string>): [number, number] | null {
  const tunnel =
    tags.tunnel === "yes" || tags.tunnel === "building_passage" ? TUNNEL : 0
  if (tags.railway && RAIL_TYPES.has(tags.railway)) {
    return [RAIL, tunnel]
  }
  const hw = tags.highway
  if (!hw) {
    return null
  }
  const base = hw.endsWith("_link") ? hw.slice(0, -5) : hw
  const cls = HIGHWAY_CLASS.get(base)
  if (cls === undefined || (base !== hw && cls > TERTIARY)) {
    return null
  }
  return [cls, tunnel | (base === hw ? 0 : RAMP)]
}

function inBox(lat: number, lon: number): boolean {
  return (
    lat >= BOX.south && lat <= BOX.north && lon >= BOX.west && lon <= BOX.east
  )
}

/** Node coordinates as parallel arrays; PBF nodes arrive sorted by id. */
class NodeStore {
  ids: Array<number> = []
  x: Array<number> = []
  y: Array<number> = []
  add(id: number, lat: number, lon: number) {
    this.ids.push(id)
    this.x.push(mercatorX(lon))
    this.y.push(mercatorY(lat))
  }
  lookup(id: number): number {
    let lo = 0
    let hi = this.ids.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const v = this.ids[mid]
      if (v === id) {
        return mid
      }
      if (v < id) {
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    return -1
  }
}

interface Parsed {
  nodes: NodeStore
  buildingWays: Array<Array<number>>
  /** Untagged ways: candidate multipolygon members. */
  memberWays: Map<number, Array<number>>
  relations: Array<Array<number>>
  lineWays: Array<{ refs: Array<number>; cls: number; flags: number }>
}

function parsePbf(): Promise<Parsed> {
  const parsed: Parsed = {
    nodes: new NodeStore(),
    buildingWays: [],
    memberWays: new Map(),
    relations: [],
    lineWays: [],
  }
  const onItem = (item: PbfItem) => {
    if (item.type === "node") {
      const { lat = Number.NaN, lon = Number.NaN } = item
      if (inBox(lat, lon)) {
        parsed.nodes.add(item.id, lat, lon)
      }
      return
    }
    if (item.type === "relation") {
      if (item.tags?.type === "multipolygon" && isBuilding(item.tags)) {
        parsed.relations.push(
          (item.members ?? []).filter((m) => m.type === "way").map((m) => m.id)
        )
      }
      return
    }
    const refs = item.refs ?? []
    if (refs.length < 2 || parsed.nodes.lookup(refs[0]) < 0) {
      return
    }
    if (!item.tags || Object.keys(item.tags).length === 0) {
      parsed.memberWays.set(item.id, refs)
      return
    }
    if (isBuilding(item.tags)) {
      parsed.buildingWays.push(refs)
      return
    }
    const kind = lineKind(item.tags)
    if (kind) {
      parsed.lineWays.push({ refs, cls: kind[0], flags: kind[1] })
    }
  }
  return new Promise((resolve, reject) => {
    createReadStream(OSM_PBF)
      .pipe(createParser())
      .pipe(
        through2.obj(
          (items: Array<PbfItem>, _enc: string, next: () => void) => {
            for (const item of items) {
              onItem(item)
            }
            next()
          }
        )
      )
      .on("finish", () => resolve(parsed))
      .on("error", reject)
  })
}

/** Join a multipolygon's member ways end to end into closed rings. */
function assembleRings(ways: Array<Array<number>>): Array<Array<number>> {
  const open = ways.filter((w) => w.length > 1)
  const rings: Array<Array<number>> = []
  while (open.length > 0) {
    const ring = [...(open.pop() ?? [])]
    let grew = true
    while (ring[0] !== ring.at(-1) && grew) {
      grew = false
      const end = ring.at(-1)
      const i = open.findIndex((w) => w[0] === end || w.at(-1) === end)
      if (i >= 0) {
        const [next] = open.splice(i, 1)
        ring.push(...(next[0] === end ? next : next.toReversed()).slice(1))
        grew = true
      }
    }
    if (ring[0] === ring.at(-1)) {
      rings.push(ring)
    }
  }
  return rings
}

function shapeBuilder(nodes: NodeStore) {
  const xy: Array<number> = []
  const start: Array<number> = [0]
  /** Append one part from node refs; false (and nothing kept) if under min vertices resolve. */
  const push = (refs: Array<number>, min: number): boolean => {
    let n = 0
    for (const ref of refs) {
      const i = nodes.lookup(ref)
      if (i < 0) {
        continue
      }
      xy.push(nodes.x[i], nodes.y[i])
      n++
    }
    if (n < min) {
      xy.length -= n * 2
      return false
    }
    start.push(xy.length / 2)
    return true
  }
  return { xy, start, push }
}

function shapeBounds(
  xy: Float64Array,
  start: Uint32Array,
  groups: Uint32Array
): Float64Array {
  const b = new Float64Array((groups.length - 1) * 4)
  for (let g = 0; g < groups.length - 1; g++) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (let v = start[groups[g]]; v < start[groups[g + 1]]; v++) {
      minX = Math.min(minX, xy[v * 2])
      maxX = Math.max(maxX, xy[v * 2])
      minY = Math.min(minY, xy[v * 2 + 1])
      maxY = Math.max(maxY, xy[v * 2 + 1])
    }
    b.set([minX, minY, maxX, maxY], g * 4)
  }
  return b
}

const identity = (n: number) => Uint32Array.from({ length: n + 1 }, (_, i) => i)

function assemble(parsed: Parsed, source: string): Basemap {
  const rings = shapeBuilder(parsed.nodes)
  const polyStart = [0]
  for (const refs of parsed.buildingWays) {
    if (refs[0] === refs.at(-1) && rings.push(refs, 3)) {
      polyStart.push(rings.start.length - 1)
    }
  }
  for (const members of parsed.relations) {
    const before = rings.start.length
    for (const ring of assembleRings(
      members.map((id) => parsed.memberWays.get(id) ?? [])
    )) {
      rings.push(ring, 3)
    }
    if (rings.start.length > before) {
      polyStart.push(rings.start.length - 1)
    }
  }

  const lines = shapeBuilder(parsed.nodes)
  const lineClass: Array<number> = []
  const lineFlags: Array<number> = []
  for (const way of parsed.lineWays) {
    if (lines.push(way.refs, 2)) {
      lineClass.push(way.cls)
      lineFlags.push(way.flags)
    }
  }

  const ringXy = Float64Array.from(rings.xy)
  const ringStart = Uint32Array.from(rings.start)
  const polys = Uint32Array.from(polyStart)
  const lineXy = Float64Array.from(lines.xy)
  const lineStart = Uint32Array.from(lines.start)
  return {
    source,
    rings: {
      xy: ringXy,
      start: ringStart,
      bounds: shapeBounds(ringXy, ringStart, polys),
    },
    polyStart: polys,
    lines: {
      xy: lineXy,
      start: lineStart,
      bounds: shapeBounds(lineXy, lineStart, identity(lineClass.length)),
    },
    lineClass: Uint8Array.from(lineClass),
    lineFlags: Uint8Array.from(lineFlags),
  }
}

type Packed = Float64Array | Uint32Array | Uint8Array

function writeCache(path: string, arrays: Array<Packed>) {
  const parts: Array<Buffer> = [
    Buffer.from(
      new Uint32Array([arrays.length, ...arrays.map((a) => a.length)]).buffer
    ),
  ]
  for (const a of arrays) {
    const bytes = Buffer.from(a.buffer, a.byteOffset, a.byteLength)
    parts.push(bytes, Buffer.alloc((8 - (bytes.length % 8)) % 8))
  }
  const header = parts[0]
  parts[0] = Buffer.concat([
    header,
    Buffer.alloc((8 - (header.length % 8)) % 8),
  ])
  writeFileSync(path, Buffer.concat(parts))
}

/** Sequential reader over a writeCache file, one typed view per call. */
function readCache(path: string) {
  const buf = readFileSync(path)
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const lengths = new Uint32Array(ab, 4, new Uint32Array(ab, 0, 1)[0])
  let off = Math.ceil(((lengths.length + 1) * 4) / 8) * 8
  let i = 0
  const take = (size: number) => {
    const at = off
    const n = lengths[i++]
    off += Math.ceil((n * size) / 8) * 8
    return { at, n }
  }
  return {
    f64: () => {
      const { at, n } = take(8)
      return new Float64Array(ab, at, n)
    },
    u32: () => {
      const { at, n } = take(4)
      return new Uint32Array(ab, at, n)
    },
    u8: () => {
      const { at, n } = take(1)
      return new Uint8Array(ab, at, n)
    },
  }
}

/** Load (or parse and cache) the basemap geometry inside BOX. */
export async function loadBasemap(): Promise<Basemap> {
  if (!existsSync(OSM_PBF)) {
    throw new Error(
      `${OSM_PBF} is missing - run scripts/setup-data.sh to download the OSM extract`
    )
  }
  const st = statSync(OSM_PBF)
  const source = `osm${st.size}v${CACHE_VERSION}`
  const cachePath = join(
    CACHE_DIR,
    `v${CACHE_VERSION}-${st.size}-${Math.round(st.mtimeMs)}.bin`
  )
  if (existsSync(cachePath)) {
    const cache = readCache(cachePath)
    const ringXy = cache.f64()
    const ringStart = cache.u32()
    const polyStart = cache.u32()
    const lineXy = cache.f64()
    const lineStart = cache.u32()
    const lineClass = cache.u8()
    const lineFlags = cache.u8()
    return {
      source,
      rings: {
        xy: ringXy,
        start: ringStart,
        bounds: shapeBounds(ringXy, ringStart, polyStart),
      },
      polyStart,
      lines: {
        xy: lineXy,
        start: lineStart,
        bounds: shapeBounds(lineXy, lineStart, identity(lineClass.length)),
      },
      lineClass,
      lineFlags,
    }
  }

  console.error(
    `Parsing basemap geometry from ${OSM_PBF} (cached after the first run)...`
  )
  const bm = assemble(await parsePbf(), source)
  console.error(
    `  ${bm.polyStart.length - 1} buildings, ${bm.lineClass.length} road and rail ways`
  )
  mkdirSync(CACHE_DIR, { recursive: true })
  writeCache(cachePath, [
    bm.rings.xy,
    bm.rings.start,
    bm.polyStart,
    bm.lines.xy,
    bm.lines.start,
    bm.lineClass,
    bm.lineFlags,
  ])
  return bm
}

/** One stroke: full width in pixels at 256 px tiles, and whether it ends up blue. */
interface Stroke {
  width: number
  blue: boolean
  /** Equal on/off dash length in pixels; solid when absent. */
  dash?: number
}

/** Per-zoom width tables from dark-matter roads.mss, indexed by zoom - 10 (z10..z18). */
const W = {
  motorwayFill: [1, 3, 3, 4, 5, 6, 8, 12, 20],
  motorwayCase: [2.5, 5, 5.5, 6.5, 8, 9, 12, 16, 25],
  majorFill: [0, 2, 2.5, 3, 4, 5, 7, 10, 15],
  majorCase: [0.5, 3.5, 4.5, 5, 6.5, 7.5, 9.5, 13, 18],
  secondaryFill: [0, 0, 1.4, 2, 3, 4.5, 6, 10, 15],
  secondaryCase: [0, 0.5, 3, 4, 5.5, 7, 8.5, 13, 18],
  minorFill: [0, 0, 0, 0, 1, 2.5, 3, 5, 10],
  minorCase: [0, 0, 0.5, 0.5, 2.5, 4.5, 5, 8, 13],
  rampFill: [0, 0, 0, 0, 2.5, 3, 4, 6, 10],
  rampCase: [0, 0, 0, 0, 3.5, 5, 6, 8, 12],
  serviceFill: [0, 0, 0, 0, 0, 0, 1.5, 2.5, 3.33],
  serviceCase: [0, 0, 0, 0, 0, 1.25, 3, 5, 6.67],
  pathCase: [0, 0, 0, 0, 0, 1.2, 1.5, 2, 2.5],
  trackCase: [0, 0, 0, 0, 0, 0, 1.5, 2, 2.5],
  railCase: [0, 0, 0, 0.5, 0.5, 2, 2, 3, 6],
  railDash: [0, 0, 0, 0, 0, 1, 1, 2, 4],
}

/** Casing, rail dash and fill strokes for one way, as dark matter draws them. */
interface LineStyle {
  casing?: Stroke
  dash?: Stroke
  fill?: Stroke
}

const solid = (width: number, blue: boolean): Stroke | undefined =>
  width > 0 ? { width, blue } : undefined

/** The LineStyle of one way at zoom z. */
function lineStyle(cls: number, flags: number, z: number): LineStyle {
  const i = Math.min(Math.max(Math.round(z), 10), 18) - 10
  const tunnel = (flags & TUNNEL) !== 0
  if (cls === RAIL) {
    if (tunnel) {
      return {}
    }
    return {
      casing: solid(W.railCase[i], false),
      dash:
        W.railDash[i] > 0
          ? { width: W.railDash[i], blue: true, dash: 6 }
          : undefined,
    }
  }
  if (cls === PATH || cls === TRACK) {
    const width = (cls === PATH ? W.pathCase : W.trackCase)[i]
    return {
      casing: width > 0 ? { width, blue: false, dash: width } : undefined,
    }
  }
  if (flags & RAMP) {
    return {
      casing: solid(W.rampCase[i], false),
      fill: solid(W.rampFill[i], true),
    }
  }
  if (cls === MOTORWAY) {
    return {
      casing: solid(W.motorwayCase[i], false),
      fill: solid(W.motorwayFill[i], true),
    }
  }
  if (cls === TRUNK || cls === PRIMARY) {
    return {
      casing: solid(W.majorCase[i], false),
      fill: solid(W.majorFill[i], true),
    }
  }
  if (cls === SECONDARY || cls === TERTIARY) {
    return {
      casing: solid(W.secondaryCase[i], false),
      fill: solid(W.secondaryFill[i], true),
    }
  }
  if (cls === MINOR) {
    return {
      casing: solid(W.minorCase[i], false),
      fill: solid(W.minorFill[i], tunnel),
    }
  }
  return {
    casing: solid(W.serviceCase[i], false),
    fill: solid(W.serviceFill[i], tunnel),
  }
}

/** Antialiasing bias (px of full width) fitted against the CARTO heroes. */
export interface RenderBias {
  erase: number
  blue: number
  /** Width of the #111 building outline dark matter strokes from z15 on. */
  outline: number
  /** Supersampling factor per native pixel (1 = sample pixel centres). */
  ss: number
  /** Sub-pixel coverage above which a native pixel reads gray < 6 under CARTO's antialiasing. */
  cov: number
}
/**
 * Per-zoom fit against main's CARTO heroes (median blue IoU z14 0.76, z15 0.83,
 * z16 0.92, z17 0.92). Bump FIT_VERSION when these change so crop signatures
 * invalidate.
 */
export const FIT_VERSION = "fit1"
const FITTED = {
  14: { erase: 0, blue: -0.5, outline: 0, ss: 4, cov: 0.6 },
  15: { erase: 0, blue: -1, outline: 1, ss: 4, cov: 0.65 },
  16: { erase: 0, blue: -1, outline: 1, ss: 4, cov: 0.5 },
  17: { erase: 0, blue: -1, outline: 1, ss: 4, cov: 0.5 },
} satisfies Record<14 | 15 | 16 | 17, RenderBias>
const fittedBias = (z: number): RenderBias =>
  z <= 14
    ? FITTED[14]
    : z === 15
      ? FITTED[15]
      : z === 16
        ? FITTED[16]
        : FITTED[17]

/** Set mask pixels whose centres fall within half of the stroke width of segment A-B. */
function capsule(
  mask: Uint8Array,
  natW: number,
  natH: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
  value: number
) {
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy)
  const ux = len > 0 ? dx / len : 1
  const uy = len > 0 ? dy / len : 0
  const rowStart = Math.max(0, Math.ceil(Math.min(ay, by) - r - 0.5))
  const rowEnd = Math.min(natH - 1, Math.floor(Math.max(ay, by) + r - 0.5))
  for (let row = rowStart; row <= rowEnd; row++) {
    const yc = row + 0.5
    let lo = Infinity
    let hi = -Infinity
    for (const [cx, cy] of [
      [ax, ay],
      [bx, by],
    ]) {
      const h = r * r - (yc - cy) ** 2
      if (h >= 0) {
        lo = Math.min(lo, cx - Math.sqrt(h))
        hi = Math.max(hi, cx + Math.sqrt(h))
      }
    }
    if (len > 0) {
      // Band |(P-A)·n| <= r intersected with 0 <= (P-A)·u <= len, solved for x.
      const nx = -uy
      const ny = ux
      let bandLo = -Infinity
      let bandHi = Infinity
      const clip = (k: number, c0: number, min: number, max: number) => {
        if (Math.abs(k) < 1e-12) {
          if (c0 < min || c0 > max) {
            bandLo = Infinity
          }
          return
        }
        const a = (min - c0) / k
        const b = (max - c0) / k
        bandLo = Math.max(bandLo, Math.min(a, b))
        bandHi = Math.min(bandHi, Math.max(a, b))
      }
      clip(nx, (yc - ay) * ny - ax * nx, -r, r)
      clip(ux, (yc - ay) * uy - ax * ux, 0, len)
      if (bandLo <= bandHi) {
        lo = Math.min(lo, bandLo)
        hi = Math.max(hi, bandHi)
      }
    }
    if (lo > hi) {
      continue
    }
    const from = Math.max(0, Math.ceil(lo - 0.5))
    const to = Math.min(natW, Math.floor(hi - 0.5) + 1)
    if (to > from) {
      mask.fill(value, row * natW + from, row * natW + to)
    }
  }
}

/** Stroke a polyline (pixel coords) with round caps and joins, optionally dashed. */
function strokeLine(
  mask: Uint8Array,
  natW: number,
  natH: number,
  pts: Array<number>,
  stroke: Stroke,
  bias: number,
  k = 1
) {
  const r = ((stroke.width + bias) * k) / 2
  if (r <= 0) {
    return
  }
  const value = stroke.blue ? 1 : 0
  let along = 0
  for (let v = 0; v + 3 < pts.length; v += 2) {
    const [ax, ay, bx, by] = [pts[v], pts[v + 1], pts[v + 2], pts[v + 3]]
    const len = Math.hypot(bx - ax, by - ay)
    if (stroke.dash === undefined) {
      capsule(mask, natW, natH, ax, ay, bx, by, r, value)
      continue
    }
    const dashLen = stroke.dash * k
    const period = dashLen * 2
    let t = 0
    while (t < len) {
      const phase = (along + t) % period
      const step = Math.max(
        1e-6,
        Math.min(len - t, (phase < dashLen ? dashLen : period) - phase)
      )
      if (phase < dashLen) {
        const f0 = t / len
        const f1 = (t + step) / len
        capsule(
          mask,
          natW,
          natH,
          ax + (bx - ax) * f0,
          ay + (by - ay) * f0,
          ax + (bx - ax) * f1,
          ay + (by - ay) * f1,
          r,
          value
        )
      }
      t += step
    }
    along += len
  }
}

/** Even-odd scanline fill of one building (all its rings) at pixel centres. */
function fillPolygon(
  bm: Basemap,
  p: number,
  worldPx: number,
  x0: number,
  y0: number,
  mask: Uint8Array,
  natW: number,
  natH: number,
  xs: Array<number>
) {
  const { xy, start, bounds } = bm.rings
  const rowStart = Math.max(
    0,
    Math.ceil(bounds[p * 4 + 1] * worldPx - y0 - 0.5)
  )
  const rowEnd = Math.min(
    natH - 1,
    Math.floor(bounds[p * 4 + 3] * worldPx - y0 - 0.5)
  )
  for (let row = rowStart; row <= rowEnd; row++) {
    const yc = row + 0.5 + y0
    xs.length = 0
    for (let ring = bm.polyStart[p]; ring < bm.polyStart[p + 1]; ring++) {
      for (let v = start[ring]; v < start[ring + 1]; v++) {
        const w = v + 1 < start[ring + 1] ? v + 1 : start[ring]
        const ay = xy[v * 2 + 1] * worldPx
        const by = xy[w * 2 + 1] * worldPx
        if (ay <= yc === by <= yc) {
          continue
        }
        const ax = xy[v * 2] * worldPx
        xs.push(ax + ((yc - ay) / (by - ay)) * (xy[w * 2] * worldPx - ax) - x0)
      }
    }
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5))
      const to = Math.min(natW, Math.ceil(xs[k + 1] - 0.5))
      if (to > from) {
        mask.fill(1, row * natW + from, row * natW + to)
      }
    }
  }
}

const overlaps = (
  b: Float64Array,
  i: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
) =>
  b[i * 4] <= maxX &&
  b[i * 4 + 2] >= minX &&
  b[i * 4 + 1] <= maxY &&
  b[i * 4 + 3] >= minY

/**
 * Render the dark-matter blue mask (1 = gray < 6) for a natW×natH crop whose
 * top-left is world pixel (x0, y0) at zoom z (256 px tiles).
 */
export function renderBasemap(
  bm: Basemap,
  z: number,
  x0: number,
  y0: number,
  natW: number,
  natH: number,
  bias: RenderBias = fittedBias(z)
): Uint8Array {
  const k = bias.ss
  if (k <= 1) {
    return renderAt(bm, z, x0, y0, natW, natH, bias, 1)
  }
  const fine = renderAt(bm, z, x0 * k, y0 * k, natW * k, natH * k, bias, k)
  const mask = new Uint8Array(natW * natH)
  const need = bias.cov * k * k
  for (let y = 0; y < natH; y++) {
    for (let x = 0; x < natW; x++) {
      let sum = 0
      for (let dy = 0; dy < k; dy++) {
        const row = (y * k + dy) * natW * k + x * k
        for (let dx = 0; dx < k; dx++) {
          sum += fine[row + dx]
        }
      }
      mask[y * natW + x] = sum > need ? 1 : 0
    }
  }
  return mask
}

function renderAt(
  bm: Basemap,
  z: number,
  x0: number,
  y0: number,
  natW: number,
  natH: number,
  bias: RenderBias,
  k: number
): Uint8Array {
  const worldPx = 256 * 2 ** z * k
  const mask = new Uint8Array(natW * natH)
  const margin = (32 * k) / worldPx
  const minX = x0 / worldPx - margin
  const minY = y0 / worldPx - margin
  const maxX = (x0 + natW) / worldPx + margin
  const maxY = (y0 + natH) / worldPx + margin

  if (z >= 13) {
    const xs: Array<number> = []
    for (let p = 0; p < bm.polyStart.length - 1; p++) {
      if (overlaps(bm.rings.bounds, p, minX, minY, maxX, maxY)) {
        fillPolygon(bm, p, worldPx, x0, y0, mask, natW, natH, xs)
      }
    }
  }

  if (z >= 15 && z < 18 && bias.outline > 0) {
    const outline: Stroke = { width: bias.outline, blue: false }
    const { xy, start } = bm.rings
    for (let p = 0; p < bm.polyStart.length - 1; p++) {
      if (!overlaps(bm.rings.bounds, p, minX, minY, maxX, maxY)) {
        continue
      }
      for (let ring = bm.polyStart[p]; ring < bm.polyStart[p + 1]; ring++) {
        const pts: Array<number> = []
        for (let v = start[ring]; v < start[ring + 1]; v++) {
          pts.push(xy[v * 2] * worldPx - x0, xy[v * 2 + 1] * worldPx - y0)
        }
        strokeLine(mask, natW, natH, pts, outline, 0, k)
      }
    }
  }

  const visible: Array<number> = []
  for (let l = 0; l < bm.lineClass.length; l++) {
    if (overlaps(bm.lines.bounds, l, minX, minY, maxX, maxY)) {
      visible.push(l)
    }
  }
  const styles = visible.map((l) =>
    lineStyle(bm.lineClass[l], bm.lineFlags[l], z)
  )
  const pixels = visible.map((l) => {
    const pts: Array<number> = []
    for (let v = bm.lines.start[l]; v < bm.lines.start[l + 1]; v++) {
      pts.push(
        bm.lines.xy[v * 2] * worldPx - x0,
        bm.lines.xy[v * 2 + 1] * worldPx - y0
      )
    }
    return pts
  })
  const biasOf = (s: Stroke) => (s.blue ? bias.blue : bias.erase)
  visible.forEach((_, i) => {
    const { casing, dash } = styles[i]
    if (casing) {
      strokeLine(mask, natW, natH, pixels[i], casing, biasOf(casing), k)
    }
    if (dash) {
      strokeLine(mask, natW, natH, pixels[i], dash, biasOf(dash), k)
    }
  })
  visible.forEach((_, i) => {
    const { fill } = styles[i]
    if (fill) {
      strokeLine(mask, natW, natH, pixels[i], fill, biasOf(fill), k)
    }
  })
  return mask
}
