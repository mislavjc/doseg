import { describe, expect, it } from "vitest"

import { isDarkScore, scoreColor } from "./score-color"

const HEX_PATTERN = /^#[0-9a-f]{6}$/i

// ---------------------------------------------------------------------------
// scoreColor()
// ---------------------------------------------------------------------------

describe("scoreColor()", () => {
  it("score 0 → pale blue #f4f8fe", () => {
    expect(scoreColor(0).toLowerCase()).toBe("#f4f8fe")
  })

  it("score 100 → navy #0e3fb0", () => {
    expect(scoreColor(100).toLowerCase()).toBe("#0e3fb0")
  })

  it("score -5 clamps to same as score 0", () => {
    expect(scoreColor(-5).toLowerCase()).toBe(scoreColor(0).toLowerCase())
  })

  it("score 150 clamps to same as score 100", () => {
    expect(scoreColor(150).toLowerCase()).toBe(scoreColor(100).toLowerCase())
  })

  it("always returns a 7-char hex string", () => {
    for (const score of [0, 25, 50, 75, 100, -10, 200]) {
      expect(scoreColor(score)).toMatch(HEX_PATTERN)
    }
  })

  it("score 50 is intermediate (not endpoints)", () => {
    const mid = scoreColor(50).toLowerCase()
    expect(mid).not.toBe("#f4f8fe")
    expect(mid).not.toBe("#0e3fb0")
  })
})

// ---------------------------------------------------------------------------
// isDarkScore()
// ---------------------------------------------------------------------------

describe("isDarkScore()", () => {
  it("score 75 → true (at boundary)", () => {
    expect(isDarkScore(75)).toBe(true)
  })

  it("score 74 → false (just below boundary)", () => {
    expect(isDarkScore(74)).toBe(false)
  })

  it("score 100 → true", () => {
    expect(isDarkScore(100)).toBe(true)
  })

  it("score 0 → false", () => {
    expect(isDarkScore(0)).toBe(false)
  })

  it("score 50 → false", () => {
    expect(isDarkScore(50)).toBe(false)
  })
})
