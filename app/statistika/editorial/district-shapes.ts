/**
 * Parse `public/district-map.svg` into per-district shapes. Shared by the
 * matrica choropleth (needs `name` + path `d`) and the 3D terrain (needs
 * `name` + `score`) so the brittle <title> string parsing lives in one place.
 */
export type DistrictShape = { name: string; d: string; score: number }

// Returns every `path.district` in document order (callers filter as needed) so
// the order stays aligned with three.js SVGLoader's path order in terrain-view.
export function parseDistrictShapes(svgText: string): DistrictShape[] {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml")
  return Array.from(doc.querySelectorAll("path.district")).map((p) => {
    const title = p.querySelector("title")?.textContent ?? ""
    const score = title.match(/(\d+)\s*\/\s*100/)
    return {
      name: title.split("\n")[0]?.trim() ?? "",
      d: p.getAttribute("d") ?? "",
      score: score ? +score[1] : 0,
    }
  })
}
