import { readFileSync } from "node:fs"

import { parseJson } from "../../lib/json"

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- same contract as parseJson in lib/json, for files on disk
export function readJson<T>(path: string): T {
  return parseJson<T>(readFileSync(path, "utf8"))
}
