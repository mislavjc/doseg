/**
 * PROTOTYPE — backfill diff between two ZET GTFS feeds.
 *
 * Reads two extracted GTFS dirs (OLD, NEW) with the real pipeline's loader
 * (scripts/lib/gtfs-feed.ts — canonical route per line+direction, not the old
 * false-positive-prone "dominant shape" pick), measures how far the new trasa
 * moved from the old, ranks the biggest reroutes, and writes data/proto/
 * diff-*.json + diffs.json for the page via the pipeline's genDiff/genOneSided.
 *
 * Throwaway: only the curated COPY/ONE_SIDED selection and the ranking report
 * are proto-local. Run: bun scripts/proto/feed-diff.ts <oldDir> <newDir> [line]
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { distM, lenM, ptSegM, toM, type LonLat } from "../lib/geo-line"
import { genDiff, genOneSided, loadFeed } from "../lib/gtfs-feed"

const [, , OLD_DIR, NEW_DIR, FORCE_LINE] = process.argv
if (!OLD_DIR || !NEW_DIR) throw new Error("usage: feed-diff.ts <oldDir> <newDir> [line]")

function ptLineM(pLL: LonLat, line: LonLat[]): number {
  const p = toM(pLL)
  let m = Infinity
  for (let i = 1; i < line.length; i++) m = Math.min(m, ptSegM(p, toM(line[i - 1]), toM(line[i])))
  return m
}
function p90(xs: number[]): number { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(0.9 * (s.length - 1))] }
const bboxOf = (pts: LonLat[]) => [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))]

// genDiff/genOneSided type their geom loosely; the proto only needs the shapes back for the bbox.
interface GeomShapes { old: { shape: LonLat[] }; new: { shape: LonLat[] } }

async function main() {
  console.error("loading OLD…"); const oldF = await loadFeed(OLD_DIR)
  console.error("loading NEW…"); const newF = await loadFeed(NEW_DIR)

  const oldShorts = new Set(oldF.keys()), newShorts = new Set(newF.keys())
  const removed = [...oldShorts].filter((s) => !newShorts.has(s))
  const added = [...newShorts].filter((s) => !oldShorts.has(s))

  interface Score { short: string; dir: number; p90m: number; lenOldKm: number; lenNewKm: number; endMoveM: number; addStops: string[]; remStops: string[]; termOld: [string, string]; termNew: [string, string] }
  const scores: Score[] = []
  for (const short of newShorts) {
    if (!oldShorts.has(short)) continue
    const o = oldF.get(short)!, n = newF.get(short)!
    for (const dir of [0, 1]) {
      const od = o.dirs[dir], nd = n.dirs[dir]
      if (!od?.shape.length || !nd?.shape.length) continue
      const d1 = nd.shape.map((p) => ptLineM(p, od.shape))
      const d2 = od.shape.map((p) => ptLineM(p, nd.shape))
      const p90m = Math.max(p90(d1), p90(d2))
      const endMoveM = Math.max(distM(nd.shape[0], od.shape[0]), distM(nd.shape.at(-1)!, od.shape.at(-1)!))
      const oNames = new Set(od.stops.map((s) => s.name)), nNames = new Set(nd.stops.map((s) => s.name))
      scores.push({
        short, dir, p90m, lenOldKm: lenM(od.shape) / 1000, lenNewKm: lenM(nd.shape) / 1000, endMoveM,
        addStops: [...nNames].filter((x) => !oNames.has(x)), remStops: [...oNames].filter((x) => !nNames.has(x)),
        termOld: [od.stops[0]?.name ?? "?", od.stops.at(-1)?.name ?? "?"],
        termNew: [nd.stops[0]?.name ?? "?", nd.stops.at(-1)?.name ?? "?"],
      })
    }
  }
  scores.sort((a, b) => b.p90m + b.endMoveM - (a.p90m + a.endMoveM))

  console.error(`\nlines old=${oldShorts.size} new=${newShorts.size}  removed=[${removed}]  added=[${added}]`)
  console.error("\nTOP REROUTES (by how far the new trasa moved):")
  for (const s of scores.slice(0, 14))
    console.error(`  ${s.short.padEnd(5)} dir${s.dir}  moved p90=${(s.p90m).toFixed(0).padStart(4)}m  end=${s.endMoveM.toFixed(0).padStart(4)}m  ${s.lenOldKm.toFixed(1)}→${s.lenNewKm.toFixed(1)}km  +${s.addStops.length}/-${s.remStops.length} stanica  [${s.termOld.join(" – ")}] → [${s.termNew.join(" – ")}]`)

  // Export a curated set of real reroutes. Copy is hand-written per line for the
  // proto (real pipeline would template it, minding Croatian gender/declension).
  const COPY: Record<string, { mode: string; kind: string; headline: string; summary: string }> = {
    "2": { mode: "Tramvaj", kind: "produžena", headline: "Tramvaj 2 produžen — sada vozi do Savišća.", summary: "Više ne završava na Ljubljanici nego nastavlja do Savišća, s 21 novom stanicom." },
    "295": { mode: "Linija", kind: "skraćena", headline: "Linija 295 skraćena — više ne ide do Sarajevske.", summary: "Sada vozi samo do Sajma Jakuševec; gotovo cijela trasa prema rotoru je ukinuta." },
    "217": { mode: "Linija", kind: "preusmjerena", headline: "Linija 217 preusmjerena — počinje na Petruševcu.", summary: "Polazište pomaknuto sa Struga na Petruševečko naselje, ostatak trase isti." },
  }
  const TARGETS = FORCE_LINE ? FORCE_LINE.split(",") : ["2", "295", "217"]
  const dir = join(process.cwd(), "data", "proto")
  mkdirSync(dir, { recursive: true })

  const manifest: unknown[] = []
  for (const short of TARGETS) {
    const o = oldF.get(short), n = newF.get(short)
    const res = o && n ? genDiff(short, o, n) : null
    if (!res) { console.error(`skip ${short}: not in both feeds`); continue }
    const geom = res.geom as GeomShapes
    const stat = res.stat as { len_old_km: number; len_new_km: number; added: number; removed: number; oldTipName: string; newTipName: string }
    writeFileSync(join(dir, `diff-${short}.json`), JSON.stringify({ ...res.geom, bbox: bboxOf([...geom.old.shape, ...geom.new.shape]) }))
    manifest.push({
      line: short, cardType: "reroute", mode: COPY[short]?.mode ?? (o!.type === 0 ? "Tramvaj" : "Linija"),
      kind: COPY[short]?.kind ?? "preusmjerena",
      headline: COPY[short]?.headline ?? `Linija ${short} promijenjena.`, summary: COPY[short]?.summary ?? "",
      len_old_km: stat.len_old_km, len_new_km: stat.len_new_km,
      added: stat.added, removed: stat.removed,
      oldTipName: stat.oldTipName, newTipName: stat.newTipName,
    })
    console.error(`wrote diff-${short}.json new=${stat.newTipName} old=${stat.oldTipName}`)
  }

  // One-sided cards: a brand-new line (only blue) + discontinued ones (only the grey ghost).
  const ONE_SIDED: { short: string; side: "new" | "removed"; mode: string; headline: string; summary: string }[] = [
    { short: "3", side: "new", mode: "Tramvaj", headline: "Tramvaj 3 ponovno vozi.", summary: "Vraćen u promet na relaciji Ljubljanica – Savišće, nakon godina pauze." },
    { short: "162", side: "removed", mode: "Linija", headline: "Linija 162 ukinuta.", summary: "Više se ne vozi; preklapala se s drugim linijama na zapadu grada." },
    { short: "207", side: "removed", mode: "Linija", headline: "Linija 207 ukinuta.", summary: "Uklonjena iz voznog reda." },
  ]
  for (const os of ONE_SIDED) {
    const L = (os.side === "new" ? newF : oldF).get(os.short)
    const res = L ? genOneSided(os.short, os.side, L) : null
    if (!res) { console.error(`skip ${os.short}: not in feed`); continue }
    const geom = res.geom as GeomShapes
    const stat = res.stat as { len_km: number; stops_count: number; terminusName: string; originName: string }
    const drawn = os.side === "new" ? geom.new.shape : geom.old.shape
    writeFileSync(join(dir, `diff-${os.short}.json`), JSON.stringify({ ...res.geom, bbox: bboxOf(drawn) }))
    manifest.push({
      line: os.short, cardType: os.side, mode: os.mode, kind: os.side === "new" ? "nova linija" : "ukinuta linija",
      headline: os.headline, summary: os.summary,
      len_km: stat.len_km, stops_count: stat.stops_count, terminusName: stat.terminusName, originName: stat.originName,
    })
    console.error(`wrote diff-${os.short}.json (${os.side}) ${stat.stops_count} stanica`)
  }

  writeFileSync(join(dir, "diffs.json"), JSON.stringify({
    oldFeed: { version: "000368", start: "2025-04-07" }, newFeed: { version: "000385", start: "2026-03-11" }, changes: manifest,
  }))
  console.error(`\nwrote diffs.json — ${manifest.length} changes`)
}
main()
