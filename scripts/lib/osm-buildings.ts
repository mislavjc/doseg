/**
 * Building footprints from the OSM extract, rasterised straight into a
 * coverage mask for the dither-crop engine. This replaced CARTO's
 * dark_nolabels raster tiles, which started answering every request with an
 * "API key required" placeholder in Nov 2026 and silently baked blank heroes.
 *
 * The first load parses data/osm/croatia.osm.pbf (the extract setup-data.sh
 * downloads) and caches the footprints under .cache/osm-buildings/, keyed by
 * the extract's size and mtime, so later runs skip the parse.
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
const CACHE_DIR = join(process.cwd(), ".cache", "osm-buildings")
/** Covers every baked crop, the city-wide home banner included. */
const BOX = { west: 13.9, south: 45.4, east: 18.1, north: 46.2 }

interface PbfItem {
  type: "node" | "way" | "relation"
  id: number
  lat?: number
  lon?: number
  tags?: Record<string, string>
  refs?: Array<number>
  members?: Array<{ type: string; ref: number; role: string }>
}

export interface Footprints {
  /** Identifies the extract; part of every crop signature. */
  source: string
  /** Ring vertices as normalised web-mercator x,y pairs (0..1). */
  xy: Float64Array
  /** Ring r spans vertices ringStart[r] .. ringStart[r + 1]. */
  ringStart: Uint32Array
  /** Polygon p spans rings polyStart[p] .. polyStart[p + 1]. */
  polyStart: Uint32Array
  /** minX, minY, maxX, maxY per polygon, normalised mercator. */
  bounds: Float64Array
}

const isBuilding = (tags?: Record<string, string>) =>
  !!tags?.building && tags.building !== "no"

function inBox(lat: number, lon: number): boolean {
  return (
    lat >= BOX.south && lat <= BOX.north && lon >= BOX.west && lon <= BOX.east
  )
}

/** Node coordinates kept as parallel arrays; PBF nodes arrive sorted by id. */
class NodeStore {
  ids: Array<number> = []
  x: Array<number> = []
  y: Array<number> = []
  add(id: number, lat: number, lon: number) {
    this.ids.push(id)
    this.x.push(mercatorX(lon))
    this.y.push(mercatorY(lat))
  }
  find(id: number): number {
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
  memberWays: Map<number, Array<number>>
  relations: Array<{ outer: Array<number>; inner: Array<number> }>
}

function parsePbf(): Promise<Parsed> {
  const parsed: Parsed = {
    nodes: new NodeStore(),
    buildingWays: [],
    memberWays: new Map(),
    relations: [],
  }
  return new Promise((resolve, reject) => {
    createReadStream(OSM_PBF)
      .pipe(createParser())
      .pipe(
        through2.obj(
          (items: Array<PbfItem>, _enc: string, next: () => void) => {
            for (const item of items) {
              if (item.type === "node") {
                const { lat = Number.NaN, lon = Number.NaN } = item
                if (inBox(lat, lon)) {
                  parsed.nodes.add(item.id, lat, lon)
                }
              } else if (item.type === "way") {
                const refs = item.refs ?? []
                if (refs.length < 4 || parsed.nodes.find(refs[0]) < 0) {
                  continue
                }
                if (isBuilding(item.tags)) {
                  parsed.buildingWays.push(refs)
                } else if (refs[0] === refs.at(-1)) {
                  parsed.memberWays.set(item.id, refs)
                }
              } else if (
                item.tags?.type === "multipolygon" &&
                isBuilding(item.tags)
              ) {
                const ways = (role: string) =>
                  (item.members ?? [])
                    .filter((m) => m.type === "way" && m.role === role)
                    .map((m) => m.ref)
                parsed.relations.push({
                  outer: ways("outer"),
                  inner: ways("inner"),
                })
              }
            }
            next()
          }
        )
      )
      .on("finish", () => resolve(parsed))
      .on("error", reject)
  })
}

function polygonBounds(fp: Omit<Footprints, "bounds">): Float64Array {
  const polys = fp.polyStart.length - 1
  const b = new Float64Array(polys * 4)
  for (let p = 0; p < polys; p++) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (
      let v = fp.ringStart[fp.polyStart[p]];
      v < fp.ringStart[fp.polyStart[p + 1]];
      v++
    ) {
      const x = fp.xy[v * 2]
      const y = fp.xy[v * 2 + 1]
      if (x < minX) {
        minX = x
      }
      if (x > maxX) {
        maxX = x
      }
      if (y < minY) {
        minY = y
      }
      if (y > maxY) {
        maxY = y
      }
    }
    b.set([minX, minY, maxX, maxY], p * 4)
  }
  return b
}

/** Flatten parsed ways/relations into typed polygon arrays. */
function assemble(parsed: Parsed, source: string): Footprints {
  const xy: Array<number> = []
  const ringStart: Array<number> = [0]
  const polyStart: Array<number> = [0]

  const pushRing = (refs: Array<number>): boolean => {
    let n = 0
    for (const ref of refs) {
      const i = parsed.nodes.find(ref)
      if (i < 0) {
        continue
      }
      xy.push(parsed.nodes.x[i], parsed.nodes.y[i])
      n++
    }
    if (n < 3) {
      xy.length -= n * 2
      return false
    }
    ringStart.push(xy.length / 2)
    return true
  }

  for (const refs of parsed.buildingWays) {
    if (pushRing(refs)) {
      polyStart.push(ringStart.length - 1)
    }
  }

  for (const rel of parsed.relations) {
    const before = ringStart.length
    for (const id of [...rel.outer, ...rel.inner]) {
      const refs = parsed.memberWays.get(id)
      if (refs) {
        pushRing(refs)
      }
    }
    if (ringStart.length > before) {
      polyStart.push(ringStart.length - 1)
    }
  }

  const fp = {
    source,
    xy: Float64Array.from(xy),
    ringStart: Uint32Array.from(ringStart),
    polyStart: Uint32Array.from(polyStart),
  }
  return { ...fp, bounds: polygonBounds(fp) }
}

function writeCache(path: string, fp: Footprints) {
  const header = new Uint32Array([
    fp.xy.length,
    fp.ringStart.length,
    fp.polyStart.length,
    0,
  ])
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from(header.buffer),
      Buffer.from(fp.xy.buffer),
      Buffer.from(fp.ringStart.buffer),
      Buffer.from(fp.polyStart.buffer),
    ])
  )
}

function readCache(path: string, source: string): Footprints {
  const buf = readFileSync(path)
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const [xyLen, ringLen, polyLen] = new Uint32Array(ab, 0, 3)
  let off = 16
  const xy = new Float64Array(ab, off, xyLen)
  off += xyLen * 8
  const ringStart = new Uint32Array(ab, off, ringLen)
  off += ringLen * 4
  const polyStart = new Uint32Array(ab, off, polyLen)
  const fp = { source, xy, ringStart, polyStart }
  return { ...fp, bounds: polygonBounds(fp) }
}

/** Load (or parse and cache) every building footprint inside BOX. */
export async function loadFootprints(): Promise<Footprints> {
  if (!existsSync(OSM_PBF)) {
    throw new Error(
      `${OSM_PBF} is missing - run scripts/setup-data.sh to download the OSM extract`
    )
  }
  const st = statSync(OSM_PBF)
  const source = `osm${st.size}`
  const cachePath = join(CACHE_DIR, `${st.size}-${Math.round(st.mtimeMs)}.bin`)
  if (existsSync(cachePath)) {
    return readCache(cachePath, source)
  }

  console.error(
    `Parsing building footprints from ${OSM_PBF} (cached after the first run)...`
  )
  const fp = assemble(await parsePbf(), source)
  console.error(`  ${fp.polyStart.length - 1} buildings`)
  mkdirSync(CACHE_DIR, { recursive: true })
  writeCache(cachePath, fp)
  return fp
}

/** Push the crop-relative x of every edge of ring r that crosses world row yc. */
function ringCrossings(
  fp: Footprints,
  r: number,
  worldPx: number,
  yc: number,
  x0: number,
  xs: Array<number>
) {
  const v0 = fp.ringStart[r]
  const v1 = fp.ringStart[r + 1]
  for (let v = v0; v < v1; v++) {
    const w = v + 1 < v1 ? v + 1 : v0
    const ay = fp.xy[v * 2 + 1] * worldPx
    const by = fp.xy[w * 2 + 1] * worldPx
    if (ay <= yc === by <= yc) {
      continue
    }
    const ax = fp.xy[v * 2] * worldPx
    const bx = fp.xy[w * 2] * worldPx
    xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax) - x0)
  }
}

/**
 * Rasterise the footprints into a natW×natH mask (1 = building) whose top-left
 * is world pixel (x0, y0) at a world size of worldPx. Pixel centres are tested
 * with an even-odd scanline fill per polygon, so inner rings punch holes.
 */
export function rasterizeFootprints(
  fp: Footprints,
  worldPx: number,
  x0: number,
  y0: number,
  natW: number,
  natH: number
): Uint8Array {
  const mask = new Uint8Array(natW * natH)
  const minX = x0 / worldPx
  const minY = y0 / worldPx
  const maxX = (x0 + natW) / worldPx
  const maxY = (y0 + natH) / worldPx
  const xs: Array<number> = []

  for (let p = 0; p < fp.polyStart.length - 1; p++) {
    const b = p * 4
    if (
      fp.bounds[b] > maxX ||
      fp.bounds[b + 2] < minX ||
      fp.bounds[b + 1] > maxY ||
      fp.bounds[b + 3] < minY
    ) {
      continue
    }

    const rowStart = Math.max(
      0,
      Math.ceil(fp.bounds[b + 1] * worldPx - y0 - 0.5)
    )
    const rowEnd = Math.min(
      natH - 1,
      Math.floor(fp.bounds[b + 3] * worldPx - y0 - 0.5)
    )
    for (let row = rowStart; row <= rowEnd; row++) {
      xs.length = 0
      for (let r = fp.polyStart[p]; r < fp.polyStart[p + 1]; r++) {
        ringCrossings(fp, r, worldPx, row + 0.5 + y0, x0, xs)
      }
      xs.sort((a, c) => a - c)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const from = Math.max(0, Math.ceil(xs[k] - 0.5))
        const to = Math.min(natW, Math.ceil(xs[k + 1] - 0.5))
        if (to > from) {
          mask.fill(1, row * natW + from, row * natW + to)
        }
      }
    }
  }
  return mask
}
