import { readFileSync } from "node:fs"

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- the caller names the shape it expects; that is the point of the helper
export function parseJson<T>(text: string): T {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- JSON is the trust boundary: our own generated files or a documented API response, typed by the caller
  return JSON.parse(text) as T
}

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- same contract as parseJson, for files on disk
export function readJson<T>(path: string): T {
  return parseJson<T>(readFileSync(path, "utf8"))
}
