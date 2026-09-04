/**
 * Throwaway: generate 4 reach-map variations clipped to the REAL Trešnjevka-sjever
 * district polygon (from public/district-map.svg), rasterised to PNG via sharp so
 * Paper imports each as one image. Shading = closeness to a tram "corridor" line
 * (dark = more reachable). Illustrative reach; geometry is real.
 *   bun scripts/proto/gen-kvart-shapes.ts
 */
import { mkdirSync, writeFileSync } from "node:fs"
import sharp from "sharp"
import { scoreColor } from "../../lib/score-color"
import { ptSegM } from "../lib/geo-line"

const TARGET = "Trešnjevka - sjever"
const OUT = "/tmp/kvart-shapes"
const svg = (await import("node:fs")).readFileSync("public/district-map.svg", "utf8")

// Pull the path d for the target district (title is a child of the path).
const re = /<path[^>]*class="district"[^>]*\bd="([^"]+)"[^>]*>\s*<title>([^<]*)<\/title>/g
let dPath = ""
for (let m: RegExpExecArray | null; (m = re.exec(svg)); ) {
  if (m[2].startsWith(TARGET)) { dPath = m[1]; break }
}
if (!dPath) throw new Error(`${TARGET} not found`)

// Approx bbox from coordinate pairs (paths are M/L/C absolute, no arcs).
const nums = (dPath.match(/-?\d+(?:\.\d+)?/g) || []).map(Number)
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
for (let i = 0; i + 1 < nums.length; i += 2) {
  const x = nums[i], y = nums[i + 1]
  if (x < minX) minX = x; if (x > maxX) maxX = x
  if (y < minY) minY = y; if (y > maxY) maxY = y
}
const w = maxX - minX, h = maxY - minY

// score ramp (navy = high reach) — the real lib/score-color.ts ramp on a 0–1 t
const ramp = (t: number) => scoreColor(t * 100)

// tram "corridor" line through the district; closeness → reach.
const P0: [number, number] = [minX + 0.1 * w, minY + 0.74 * h], P1: [number, number] = [maxX - 0.1 * w, minY + 0.28 * h]
const maxD = 0.46 * Math.hypot(w, h)
const reach = (px: number, py: number) => 1 - Math.min(1, ptSegM([px, py], P0, P1) / maxD)

const DISPLAY_W = 640
const dim = `width="${DISPLAY_W}" height="${Math.round((DISPLAY_W * h) / w)}" viewBox="${minX} ${minY} ${w} ${h}"`
const clip = `<clipPath id="k"><path d="${dPath}"/></clipPath>`
const outline = `<path d="${dPath}" fill="none" stroke="#0e3fb0" stroke-width="${w / 150}" stroke-linejoin="round"/>`

// grid of cells: cb = callback(cx,cy,x,y,size) -> svg element string
function grid(cols: number, cb: (cx: number, cy: number, x: number, y: number, s: number) => string) {
  const s = w / cols
  let out = ""
  for (let x = minX; x < maxX; x += s)
    for (let y = minY; y < maxY; y += s) out += cb(x + s / 2, y + s / 2, x, y, s)
  return out
}

const variants: Record<string, string> = {
  // V1 — clipped reach grid (the look they liked, real silhouette)
  v1: `<g clip-path="url(#k)">${grid(26, (cx, cy, x, y, s) =>
    `<rect x="${x}" y="${y}" width="${s * 0.9}" height="${s * 0.9}" fill="${ramp(reach(cx, cy))}"/>`)}</g>${outline}`,
  // V2 — smooth choropleth (radial from the corridor, clipped)
  v2: `<defs><radialGradient id="g" cx="35%" cy="62%" r="75%"><stop offset="0%" stop-color="${ramp(1)}"/><stop offset="55%" stop-color="${ramp(0.55)}"/><stop offset="100%" stop-color="${ramp(0.05)}"/></radialGradient></defs><path d="${dPath}" fill="url(#g)"/>${outline}`,
  // V3 — stippled dot field, reach-shaded
  v3: `<rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="#f4f8fe" clip-path="url(#k)"/><g clip-path="url(#k)">${grid(24, (cx, cy) =>
    `<circle cx="${cx}" cy="${cy}" r="${(w / 24) * 0.34}" fill="${ramp(reach(cx, cy))}"/>`)}</g>${outline}`,
  // V4 — isochrone bands (quantised reach → blocky rings)
  v4: `<g clip-path="url(#k)">${grid(30, (cx, cy, x, y, s) => {
    const q = Math.round(reach(cx, cy) * 3) / 3
    return `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${ramp(q)}"/>`
  })}</g>${outline}`,
}

mkdirSync(OUT, { recursive: true })
for (const [k, body] of Object.entries(variants)) {
  const full = `<svg xmlns="http://www.w3.org/2000/svg" ${dim}>${clip}${body}</svg>`
  writeFileSync(`${OUT}/${k}.svg`, full)
  await sharp(Buffer.from(full)).png().toFile(`${OUT}/${k}.png`)
}
console.log(`OK — ${TARGET} bbox ${w.toFixed(0)}×${h.toFixed(0)} → ${OUT}/v1..v4.png (${DISPLAY_W}px)`)
