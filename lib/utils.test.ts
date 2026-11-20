import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { cn } from "./utils"

const css = readFileSync(join(import.meta.dirname, "../app/globals.css"), "utf8")
const sizes = [...css.matchAll(/^\s*--text-([a-z]+):/gmu)].map((m) => m[1])

describe("cn() and the custom font-size utilities", () => {
  it("finds the @theme sizes", () => {
    expect(sizes).toEqual(["head", "body", "label"])
  })

  it.each(sizes)("keeps text-%s next to a text colour", (size) => {
    expect(cn(`text-${size}`, "text-ink-faint")).toBe(`text-${size} text-ink-faint`)
  })

  it.each(sizes)("lets a later text-%s replace an earlier size", (size) => {
    const other = sizes.find((s) => s !== size)
    expect(cn(`text-${other}`, `text-${size}`)).toBe(`text-${size}`)
  })
})
