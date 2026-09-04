/**
 * Shared quoted-CSV toolkit for GTFS files (routes.txt, trips.txt, …).
 *
 * One canonical parser instead of a copy per script: `readCsv` slurps small
 * files, `streamCsv` line-streams the huge ones (stop_times.txt), `idx` is the
 * permissive column lookup (-1 when absent) and `colIndex` the strict one.
 *
 * Used by scripts/promjene/build-geometry.ts (via scripts/lib/gtfs-feed.ts) and
 * the scripts/proto/* prototypes.
 */
import { createReadStream, readFileSync } from "node:fs"
import { createInterface } from "node:readline"

export function splitCsv(line: string): string[] {
  const out: string[] = []
  let cur = "", q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c
    } else if (c === '"') q = true
    else if (c === ",") { out.push(cur); cur = "" }
    else cur += c
  }
  out.push(cur)
  return out
}

export function readCsv(path: string): { header: string[]; rows: string[][] } {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.length)
  return { header: splitCsv(lines[0]), rows: lines.slice(1).map(splitCsv) }
}

export const idx = (header: string[], name: string) => header.indexOf(name)

/** Like `idx` but throws when the column is missing (for feeds we don't control). */
export function colIndex(header: string[], name: string): number {
  const i = header.indexOf(name)
  if (i < 0) throw new Error(`missing column ${name} in [${header.join(",")}]`)
  return i
}

export async function streamCsv(path: string, onRow: (cols: string[], col: (n: string) => number) => void) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity })
  let header: string[] | null = null
  let col: (n: string) => number = () => -1
  for await (const line of rl) {
    if (!line) continue
    if (!header) { header = splitCsv(line); col = (n) => header!.indexOf(n); continue }
    onRow(splitCsv(line), col)
  }
}
