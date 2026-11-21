import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

import { describe, expect, it } from "vitest"

const root = join(import.meta.dirname, "..")
const skip = ["app/api/og/", "lib/generated/"]

function sources(dir: string): Array<string> {
  return readdirSync(join(root, dir), { recursive: true, encoding: "utf8" })
    .map((p) => join(dir, p))
    .filter((p) => /\.tsx?$/u.test(p) && !p.endsWith(".test.ts"))
    .filter((p) => !skip.some((s) => p.startsWith(s)))
}

const files = ["app", "components", "lib", "hooks"].flatMap((dir) =>
  sources(dir)
)

function offenders(pattern: RegExp): Array<string> {
  return files.flatMap((file) =>
    readFileSync(join(root, file), "utf8")
      .split("\n")
      .flatMap((line, i) =>
        [...line.matchAll(pattern)].map(
          (m) => `${relative(root, join(root, file))}:${i + 1} ${m[0]}`
        )
      )
  )
}

describe("design rules (AGENTS.md)", () => {
  it("scans the source tree", () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it("uses only text-head, text-body and text-label for font size", () => {
    expect(
      offenders(
        /(?<![\w-])(?:[a-z0-9-]+:)*text-(?:\[\d+(?:\.\d+)?(?:px|rem|em)\]|xs|sm|base|lg|xl|[2-9]xl)(?![\w-])/gu
      )
    ).toEqual([])
  })

  it("has no all-caps or tracked-caps labels", () => {
    expect(
      offenders(
        /(?<![\w-])(?:[a-z0-9-]+:)*(?:uppercase|tracking-(?:wide|wider|widest))(?![\w-])/gu
      )
    ).toEqual([])
  })

  it("never hands map popups raw HTML", () => {
    expect(offenders(/\.setHTML\(/gu)).toEqual([])
  })
})
