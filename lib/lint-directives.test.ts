import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const root = join(import.meta.dirname, "..")
const dirs = ["app", "components", "lib", "hooks", "scripts"]
const skip = ["scripts/proto/", "lib/generated/"]

const files = dirs.flatMap((dir) =>
  readdirSync(join(root, dir), { recursive: true, encoding: "utf8" })
    .map((p) => join(dir, p))
    .filter((p) => /\.(?:tsx?|mjs)$/u.test(p))
    .filter((p) => !skip.some((s) => p.startsWith(s)))
)

const directive = /(?:eslint|oxlint)-disable/u
const explained = /(?:eslint|oxlint)-disable\S*\s+\S+.*\s--\s+\S/u

function unexplainedDisables(): Array<string> {
  return files.flatMap((file) =>
    readFileSync(join(root, file), "utf8")
      .split("\n")
      .flatMap((line, i) =>
        directive.test(line) && !explained.test(line)
          ? [`${file}:${i + 1}`]
          : []
      )
  )
}

describe("lint directives", () => {
  it("scans the source tree", () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it("gives every disable comment a rule and a reason after --", () => {
    expect(unexplainedDisables()).toEqual([])
  })
})
